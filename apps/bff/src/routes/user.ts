import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { supabaseAdmin } from '../providers/supabaseAdmin.js';
import { insertEpisode } from '../episodes.js';
import { isTimePassed, isValidTime, isValidTimeZone, localParts } from '../localTime.js';
import { readQuota } from '../ratelimit.js';
import {
  BadRequest,
  clampArray,
  clampInt,
  validateEnum,
  validateString,
  validateSymbol,
} from '../validation.js';

interface SettingsBody {
  horizon?: 'short' | 'medium' | 'long';
  theme?: 'dark' | 'light';
  podcastDuration?: 'auto' | '2' | '4' | '8';
  podcastPushEnabled?: boolean;
  /** Heure locale d'envoi du rappel, HH:MM. */
  podcastPushTime?: string;
  /** Fuseau IANA du navigateur (ex. Europe/Paris). */
  timezone?: string;
}

const PODCAST_DURATIONS = ['auto', '2', '4', '8'] as const;
const DEFAULT_PUSH_TIME = '08:00';
const DEFAULT_TIMEZONE = 'Europe/Paris';

interface AddTickerBody { ticker: string }
interface AddCategoryBody { name: string }

interface EpisodeBody {
  date: string;
  categories: string[];
  script: string;
  sources: string[];
  durationEstimateSec: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function registerUserRoutes(app: FastifyInstance) {
  // -------- Settings --------
  app.get('/user/settings', async (req) => {
    const user = requireUser(req);
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .select('horizon, theme, podcast_duration, podcast_push_enabled, podcast_push_time, timezone')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return {
      horizon: data?.horizon ?? 'medium',
      theme: data?.theme ?? 'dark',
      podcastDuration: data?.podcast_duration ?? 'auto',
      podcastPushEnabled: data?.podcast_push_enabled ?? false,
      podcastPushTime: data?.podcast_push_time ?? DEFAULT_PUSH_TIME,
      timezone: data?.timezone ?? DEFAULT_TIMEZONE,
    };
  });

  app.put<{ Body: SettingsBody }>('/user/settings', async (req) => {
    const user = requireUser(req);
    const body = req.body ?? {};
    const horizon = body.horizon
      ? validateEnum(body.horizon, ['short', 'medium', 'long'] as const, 'medium')
      : undefined;
    const theme = body.theme
      ? validateEnum(body.theme, ['dark', 'light'] as const, 'dark')
      : undefined;
    const podcastDuration = body.podcastDuration
      ? validateEnum(body.podcastDuration, PODCAST_DURATIONS, 'auto')
      : undefined;
    if (body.podcastPushEnabled !== undefined && typeof body.podcastPushEnabled !== 'boolean') {
      throw new BadRequest('podcastPushEnabled invalide');
    }
    if (body.podcastPushTime !== undefined && !isValidTime(body.podcastPushTime)) {
      throw new BadRequest('podcastPushTime invalide (HH:MM)');
    }
    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
      throw new BadRequest('timezone invalide');
    }
    const { podcastPushEnabled, podcastPushTime, timezone } = body;
    const pushChanged =
      podcastPushEnabled !== undefined || podcastPushTime !== undefined || timezone !== undefined;
    if (!horizon && !theme && !podcastDuration && !pushChanged) {
      throw new BadRequest('Aucune valeur à mettre à jour');
    }

    // Activer le rappel ou déplacer son heure à un moment déjà passé
    // aujourd'hui ne doit pas déclencher un envoi immédiat (rattrapage du
    // job) : on marque la journée comme faite. Le premier rappel part au
    // prochain passage de l'heure choisie.
    let lastSentOn: string | undefined;
    if (pushChanged) {
      const { data: current, error: readError } = await supabaseAdmin
        .from('user_settings')
        .select('podcast_push_time, timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (readError) throw readError;
      const tz = timezone ?? current?.timezone ?? DEFAULT_TIMEZONE;
      const time = podcastPushTime ?? current?.podcast_push_time ?? DEFAULT_PUSH_TIME;
      const now = new Date();
      if (isTimePassed(now, tz, time)) lastSentOn = localParts(now, tz).date;
    }

    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          horizon,
          theme,
          podcast_duration: podcastDuration,
          podcast_push_enabled: podcastPushEnabled,
          podcast_push_time: podcastPushTime,
          timezone,
          podcast_push_last_sent_on: lastSentOn,
        },
        { onConflict: 'user_id' },
      );
    if (error) throw error;
    return { ok: true };
  });

  // -------- Watchlist --------
  app.get('/user/watchlist', async (req) => {
    const user = requireUser(req);
    const { data, error } = await supabaseAdmin
      .from('watchlist')
      .select('ticker, position')
      .eq('user_id', user.id)
      .order('position', { ascending: true });
    if (error) throw error;
    return { tickers: (data ?? []).map((r) => r.ticker) };
  });

  app.post<{ Body: AddTickerBody }>('/user/watchlist', async (req) => {
    const user = requireUser(req);
    const ticker = validateSymbol(req.body?.ticker ?? '');

    // Limite : 100 tickers par user (DOS protection sur la table)
    const { count } = await supabaseAdmin
      .from('watchlist')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if ((count ?? 0) >= 100) {
      throw new BadRequest('Watchlist pleine (max 100 tickers)');
    }

    const { data: existing } = await supabaseAdmin
      .from('watchlist')
      .select('position')
      .eq('user_id', user.id)
      .order('position', { ascending: false })
      .limit(1);
    const nextPos = (existing?.[0]?.position ?? -1) + 1;

    const { error } = await supabaseAdmin
      .from('watchlist')
      .upsert(
        { user_id: user.id, ticker, position: nextPos },
        { onConflict: 'user_id,ticker', ignoreDuplicates: true },
      );
    if (error) throw error;
    return { ok: true, ticker };
  });

  app.delete<{ Params: { ticker: string } }>('/user/watchlist/:ticker', async (req) => {
    const user = requireUser(req);
    const ticker = validateSymbol(req.params.ticker);
    const { error } = await supabaseAdmin
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('ticker', ticker);
    if (error) throw error;
    return { ok: true };
  });

  // -------- Podcast categories --------
  app.get('/user/podcast/categories', async (req) => {
    const user = requireUser(req);
    const { data, error } = await supabaseAdmin
      .from('podcast_categories')
      .select('name, position')
      .eq('user_id', user.id)
      .order('position', { ascending: true });
    if (error) throw error;
    return { categories: (data ?? []).map((r) => r.name) };
  });

  app.post<{ Body: AddCategoryBody }>('/user/podcast/categories', async (req) => {
    const user = requireUser(req);
    const name = validateString(req.body?.name ?? '', 'name', 60, 1);

    const { count } = await supabaseAdmin
      .from('podcast_categories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if ((count ?? 0) >= 20) {
      throw new BadRequest('Trop de catégories (max 20)');
    }

    const { data: existing } = await supabaseAdmin
      .from('podcast_categories')
      .select('position')
      .eq('user_id', user.id)
      .order('position', { ascending: false })
      .limit(1);
    const nextPos = (existing?.[0]?.position ?? -1) + 1;

    const { error } = await supabaseAdmin
      .from('podcast_categories')
      .upsert(
        { user_id: user.id, name, position: nextPos },
        { onConflict: 'user_id,name', ignoreDuplicates: true },
      );
    if (error) throw error;
    return { ok: true, name };
  });

  app.delete<{ Params: { name: string } }>('/user/podcast/categories/:name', async (req) => {
    const user = requireUser(req);
    const name = validateString(decodeURIComponent(req.params.name), 'name', 60, 1);
    const { error } = await supabaseAdmin
      .from('podcast_categories')
      .delete()
      .eq('user_id', user.id)
      .eq('name', name);
    if (error) throw error;
    return { ok: true };
  });

  // -------- Podcast episodes --------
  app.get('/user/podcast/episodes', async (req) => {
    const user = requireUser(req);
    const { data, error } = await supabaseAdmin
      .from('podcast_episodes')
      .select('id, date, categories, script, sources, duration_estimate_sec, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return {
      episodes: (data ?? []).map((e) => ({
        id: e.id,
        date: e.date,
        categories: e.categories,
        script: e.script,
        sources: e.sources,
        durationEstimateSec: e.duration_estimate_sec,
        createdAt: e.created_at,
      })),
    };
  });

  app.post<{ Body: EpisodeBody }>('/user/podcast/episodes', async (req) => {
    const user = requireUser(req);
    const ep = req.body;
    if (!ep || typeof ep !== 'object') throw new BadRequest('Body requis');
    if (!ISO_DATE_RE.test(ep.date ?? '')) throw new BadRequest('date invalide (YYYY-MM-DD)');
    const script = validateString(ep.script ?? '', 'script', 50_000, 50);
    const categories = clampArray(
      (Array.isArray(ep.categories) ? ep.categories : []).map((c) =>
        validateString(String(c), 'categorie', 60, 1),
      ),
      20,
    );
    const sources = clampArray(
      (Array.isArray(ep.sources) ? ep.sources : []).filter((s) => typeof s === 'string' && s.length < 2048),
      100,
    );
    const duration = clampInt(ep.durationEstimateSec, 240, 0, 3600);

    return insertEpisode(user.id, {
      date: ep.date,
      categories,
      script,
      sources,
      durationEstimateSec: duration,
    });
  });

  app.delete<{ Params: { id: string } }>('/user/podcast/episodes/:id', async (req) => {
    const user = requireUser(req);
    // UUID v4 only
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
      throw new BadRequest('id invalide');
    }
    const { error } = await supabaseAdmin
      .from('podcast_episodes')
      .delete()
      .eq('user_id', user.id)
      .eq('id', req.params.id);
    if (error) throw error;
    return { ok: true };
  });

  // -------- Quotas (lecture seule, indicatif pour l'UI) --------
  app.get('/user/quotas', async (req) => {
    const user = requireUser(req);
    const buckets = await Promise.all([
      readQuota(user.id, 'sentiment'),
      readQuota(user.id, 'themes'),
      readQuota(user.id, 'podcastScript'),
      readQuota(user.id, 'podcastTts'),
    ]);
    return { quotas: buckets };
  });

  // -------- Identité --------
  app.get('/user/me', async (req) => {
    const user = requireUser(req);
    return { id: user.id, email: user.email, role: user.role };
  });
}
