/**
 * Cloudflare Worker — proxy CORS + auth pour Yahoo Finance.
 *
 * Récupère les données analystes (recommendations, price targets, earnings)
 * via les endpoints non-officiels de Yahoo Finance, en gérant le flow
 * cookie + crumb requis par Yahoo depuis 2023.
 *
 * Routes exposées :
 *   GET /quoteSummary/{symbol}?modules=recommendationTrend,financialData,calendarEvents
 *
 * Auth (optionnelle mais recommandée) : header `Authorization: Bearer <PROXY_SECRET>`
 * où PROXY_SECRET est défini comme variable d'env du Worker.
 *
 * Limites Yahoo : non documentées, en pratique ~100 req/min sans souci.
 * Cloudflare Worker free : 100 000 req/jour, largement suffisant.
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SESSION_TTL_MS = 30 * 60_000;

/** Cache de session (cookie + crumb) au niveau du module — réutilisé tant que l'instance Worker reste tiède. */
let cachedSession = null;
let cachedAt = 0;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Auth partagée (optionnelle)
    if (env.PROXY_SECRET) {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.PROXY_SECRET}`) {
        return json({ error: 'Unauthorized' }, 401);
      }
    }

    try {
      const url = new URL(request.url);
      const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');

      if (parts[0] !== 'quoteSummary' || !parts[1]) {
        return json({ error: 'Not found. Use /quoteSummary/{symbol}?modules=...' }, 404);
      }

      const symbol = parts[1];
      const modules =
        url.searchParams.get('modules') ||
        'recommendationTrend,financialData,calendarEvents';

      const data = await fetchQuoteSummary(symbol, modules);
      return json(data, 200);
    } catch (e) {
      return json({ error: String(e?.message ?? e) }, 502);
    }
  },
};

async function fetchQuoteSummary(symbol, modules) {
  // Premier essai avec la session cache
  let session = await getYahooSession(false);
  let res = await callQuoteSummary(symbol, modules, session);

  // Yahoo renvoie souvent 401 si le crumb est périmé → on rafraîchit la session une fois
  if (res.status === 401 || res.status === 403) {
    session = await getYahooSession(true);
    res = await callQuoteSummary(symbol, modules, session);
  }

  if (!res.ok) {
    throw new Error(`Yahoo HTTP ${res.status}: ${await safeText(res)}`);
  }
  return res.json();
}

async function callQuoteSummary(symbol, modules, session) {
  const url = new URL(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`,
  );
  url.searchParams.set('modules', modules);
  url.searchParams.set('crumb', session.crumb);

  return fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Cookie: session.cookie,
    },
  });
}

async function getYahooSession(force) {
  const now = Date.now();
  if (!force && cachedSession && now - cachedAt < SESSION_TTL_MS) {
    return cachedSession;
  }

  // 1. Récupérer un cookie de session (A1, A3)
  const r1 = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
  });
  const setCookie = r1.headers.get('Set-Cookie') ?? '';
  const cookie = parseCookies(setCookie);
  if (!cookie) {
    throw new Error('Impossible de récupérer un cookie Yahoo (fc.yahoo.com).');
  }

  // 2. Obtenir le crumb (token anti-bot)
  const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': USER_AGENT, Cookie: cookie },
  });
  if (!r2.ok) {
    throw new Error(`Échec getcrumb (HTTP ${r2.status}).`);
  }
  const crumb = (await r2.text()).trim();
  if (!crumb) throw new Error('Crumb Yahoo vide.');

  cachedSession = { cookie, crumb };
  cachedAt = now;
  return cachedSession;
}

function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return '';
  // Plusieurs cookies sont concaténés par virgule. On split à l'apparition d'un nom de cookie.
  return setCookieHeader
    .split(/,\s*(?=[A-Z0-9_]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
