import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { supabaseAdmin } from '../providers/supabaseAdmin.js';
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
}

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
      .select('horizon, theme')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data ?? { horizon: 'medium', theme: 'dark' };
  });

  app.put<{ Body: SettingsBody }>('/user/settings', async (req) => {
    const user = requireUser(req);
    const horizon = req.body?.horizon
      ? validateEnum(req.body.horizon, ['short', 'medium', 'long'] as const, 'medium')
      : undefined;
    const theme = req.body?.theme
      ? validateEnum(req.body.theme, ['dark', 'light'] as const, 'dark')
      : undefined;
    if (!horizon && !theme) throw new BadRequest('Aucune valeur à mettre à jour');

    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert({ user_id: user.id, horizon, theme }, { onConflict: 'user_id' });
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

    // Limite : 100 épisodes par user
    const { count } = await supabaseAdmin
      .from('podcast_episodes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if ((count ?? 0) >= 100) {
      throw new BadRequest('Trop d\'épisodes stockés (max 100). Supprime-en avant.');
    }

    const { data, error } = await supabaseAdmin
      .from('podcast_episodes')
      .insert({
        user_id: user.id,
        date: ep.date,
        categories,
        script,
        sources,
        duration_estimate_sec: duration,
      })
      .select('id, created_at')
      .single();
    if (error) throw error;
    return { id: data.id, createdAt: data.created_at };
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
