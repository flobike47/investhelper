import type { FastifyBaseLogger } from 'fastify';
import { redis } from '../cache.js';
import { insertEpisode } from '../episodes.js';
import { isDue, localParts } from '../localTime.js';
import { prepareEpisodeAudio } from '../podcastAudio.js';
import { generatePodcastScript, type PodcastTarget } from '../podcastScript.js';
import { supabaseAdmin } from '../providers/supabaseAdmin.js';
import { pushConfigured, sendToUser, type PushPayload } from '../push.js';
import { QuotaExceeded } from '../ratelimit.js';

/**
 * Rappel quotidien « ton podcast t'attend ».
 *
 * Toutes les minutes : pour chaque user qui a activé l'option et dont
 * l'heure locale est passée, on réserve la journée (UPDATE conditionnel sur
 * podcast_push_last_sent_on → un seul envoi par jour, même avec deux ticks
 * ou deux instances), on prépare l'épisode du jour s'il n'existe pas, puis
 * son audio (cache TTS), et on notifie ses appareils une fois l'audio prêt.
 */

const TICK_MS = 60_000;
const LOCK_KEY = 'lock:podcast-reminder';
const LOCK_TTL_SEC = 55;
const TAG = 'podcast-daily';
/** Audio en échec : jusqu'à 5 nouvelles tentatives espacées de 10 s, puis
 *  la notification part quand même (le lecteur synthétisera à la lecture). */
export const AUDIO_RETRIES = 5;
export const AUDIO_RETRY_DELAY_MS = 10_000;

export interface TickOptions {
  /** Attente entre deux tentatives audio — injectée par les tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface ReminderRow {
  user_id: string;
  podcast_push_time: string;
  timezone: string;
  podcast_push_last_sent_on: string | null;
  podcast_duration: string | null;
}

/** Réserve la journée `day` pour `userId`. Faux si un autre tick l'a déjà fait. */
async function claimDay(userId: string, day: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .update({ podcast_push_last_sent_on: day })
    .eq('user_id', userId)
    .or(`podcast_push_last_sent_on.is.null,podcast_push_last_sent_on.lt.${day}`)
    .select('user_id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

function readyPayload(categories: string[], durationSec: number): PushPayload {
  const minutes = Math.max(1, Math.round(durationSec / 60));
  const topics = categories.slice(0, 3).join(', ') + (categories.length > 3 ? '…' : '');
  return {
    title: 'Ton podcast du jour est prêt',
    body: `${minutes} min · ${topics}`,
    url: 'podcast',
    tag: TAG,
  };
}

const FALLBACK_PAYLOAD: PushPayload = {
  title: "Ton brief du jour t'attend",
  body: "Ouvre l'app pour générer l'épisode du jour.",
  url: 'podcast',
  tag: TAG,
};

/** Prépare l'audio avec retries. Vrai si tout l'épisode est en cache. */
async function prepareAudioWithRetries(
  userId: string,
  script: string,
  log: FastifyBaseLogger,
  sleep: (ms: number) => Promise<void>,
): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try {
      await prepareEpisodeAudio(userId, script);
      return true;
    } catch (err) {
      // Quota 24 h épuisé : attendre 10 s n'y changera rien
      if (err instanceof QuotaExceeded || attempt >= AUDIO_RETRIES) {
        log.warn({ err, userId, attempts: attempt + 1 }, 'rappel podcast : audio non prêt, envoi quand même');
        return false;
      }
      await sleep(AUDIO_RETRY_DELAY_MS);
    }
  }
}

async function remindUser(
  row: ReminderRow,
  day: string,
  log: FastifyBaseLogger,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  const userId = row.user_id;

  const { data: subs, error: subsError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  if (subsError) throw subsError;
  if (!subs?.length) return; // aucun appareil : rien à préparer ni à envoyer

  const { data: cats, error: catsError } = await supabaseAdmin
    .from('podcast_categories')
    .select('name')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (catsError) throw catsError;
  const categories = (cats ?? []).map((c) => c.name as string);
  if (categories.length === 0) return; // pas de thème choisi : pas d'épisode possible

  const { data: existing, error: epError } = await supabaseAdmin
    .from('podcast_episodes')
    .select('categories, duration_estimate_sec, script')
    .eq('user_id', userId)
    .eq('date', day)
    .limit(1);
  if (epError) throw epError;

  let payload: PushPayload;
  let script: string | null = null;
  if (existing?.length) {
    // Déjà généré à la main aujourd'hui : on rappelle qu'il attend (son audio
    // est préparé plus bas, souvent déjà en cache s'il a été écouté)
    payload = readyPayload(existing[0].categories, existing[0].duration_estimate_sec);
    script = existing[0].script as string;
  } else {
    const target: PodcastTarget =
      row.podcast_duration && row.podcast_duration !== 'auto' ? Number(row.podcast_duration) : 'auto';
    try {
      const result = await generatePodcastScript(userId, categories, target);
      await insertEpisode(userId, {
        date: day,
        categories,
        script: result.script,
        sources: result.sources,
        durationEstimateSec: result.durationEstimateSec,
      });
      payload = readyPayload(categories, result.durationEstimateSec);
      script = result.script;
    } catch (err) {
      // Quota, pas de news, 100 épisodes, Gemini en panne… : le rappel part
      // quand même, l'utilisateur générera depuis l'app.
      log.warn({ err, userId }, 'rappel podcast : génération échouée, envoi du rappel simple');
      payload = FALLBACK_PAYLOAD;
    }
  }

  const audioReady = script !== null && (await prepareAudioWithRetries(userId, script, log, sleep));

  const { sent, failures } = await sendToUser(userId, payload, log);
  log.info(
    { userId, day, sent, failed: failures.length, ready: payload !== FALLBACK_PAYLOAD, audioReady },
    'rappel podcast envoyé',
  );
}

/** Un passage du job. Exporté pour les tests (`now` et `sleep` injectés). */
export async function runPodcastReminderTick(
  log: FastifyBaseLogger,
  now = new Date(),
  { sleep = defaultSleep }: TickOptions = {},
): Promise<void> {
  if (!pushConfigured) return;

  // Évite deux passages simultanés (plusieurs instances). Redis down : on
  // continue, la réservation en base empêche quand même les doublons.
  try {
    const locked = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL_SEC, 'NX');
    if (locked === null) return;
  } catch {
    /* passthrough */
  }

  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('user_id, podcast_push_time, timezone, podcast_push_last_sent_on, podcast_duration')
    .eq('podcast_push_enabled', true);
  if (error) throw error;

  for (const row of (data ?? []) as ReminderRow[]) {
    try {
      const input = {
        now,
        timeZone: row.timezone,
        pushTime: row.podcast_push_time,
        lastSentOn: row.podcast_push_last_sent_on,
      };
      if (!isDue(input)) continue;
      const day = localParts(now, row.timezone).date;
      if (!(await claimDay(row.user_id, day))) continue;
      await remindUser(row, day, log, sleep);
    } catch (err) {
      log.error({ err, userId: row.user_id }, 'rappel podcast : échec pour cet utilisateur');
    }
  }
}

/** Démarre le job ; renvoie la fonction d'arrêt (appelée au SIGTERM). */
export function startPodcastReminder(log: FastifyBaseLogger): () => void {
  if (!pushConfigured) {
    log.warn('VAPID_* absentes : notifications push et rappel podcast désactivés');
    return () => {};
  }
  let running = false;
  const timer = setInterval(() => {
    // Une génération peut dépasser une minute : pas de passages superposés
    if (running) return;
    running = true;
    runPodcastReminderTick(log)
      .catch((err) => log.error({ err }, 'rappel podcast : passage échoué'))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
  return () => clearInterval(timer);
}
