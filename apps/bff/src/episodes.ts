import { supabaseAdmin } from './providers/supabaseAdmin.js';
import { BadRequest } from './validation.js';

/**
 * Enregistrement d'un épisode — partagé par POST /api/user/podcast/episodes
 * et par le rappel quotidien qui prépare l'épisode avant de notifier.
 * Les champs doivent être déjà validés par l'appelant.
 */

export const MAX_EPISODES_PER_USER = 100;

export interface NewEpisode {
  date: string;
  categories: string[];
  script: string;
  sources: string[];
  durationEstimateSec: number;
}

export async function insertEpisode(
  userId: string,
  ep: NewEpisode,
): Promise<{ id: string; createdAt: string }> {
  const { count, error: countError } = await supabaseAdmin
    .from('podcast_episodes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_EPISODES_PER_USER) {
    throw new BadRequest(
      `Trop d'épisodes stockés (max ${MAX_EPISODES_PER_USER}). Supprime-en avant.`,
    );
  }

  const { data, error } = await supabaseAdmin
    .from('podcast_episodes')
    .insert({
      user_id: userId,
      date: ep.date,
      categories: ep.categories,
      script: ep.script,
      sources: ep.sources,
      duration_estimate_sec: ep.durationEstimateSec,
    })
    .select('id, created_at')
    .single();
  if (error) throw error;
  return { id: data.id, createdAt: data.created_at };
}
