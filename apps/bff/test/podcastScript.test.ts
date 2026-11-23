import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScriptLogger } from '../src/podcastScript.js';

const { textMock, newsMock } = vi.hoisted(() => ({
  textMock: vi.fn(async (..._args: unknown[]) => ''),
  newsMock: vi.fn(async (..._args: unknown[]) => ({ articles: [] as unknown[] })),
}));

vi.mock('ioredis', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return { Redis: RedisMock, default: RedisMock };
});
vi.mock('../src/providers/gemini.js', () => ({ gemini: { text: textMock, json: vi.fn(), ttsMultiSpeaker: vi.fn() } }));
vi.mock('../src/providers/newsapi.js', () => ({ newsapi: { everything: newsMock, topHeadlines: vi.fn() } }));
vi.mock('../src/ratelimit.js', () => ({ enforceQuota: vi.fn(async () => undefined) }));

const { generatePodcastScript } = await import('../src/podcastScript.js');
const { redis } = await import('../src/cache.js');

const SCRIPT = 'Alex: Bonjour. Sophie: La BCE garde ses taux. Alex: Et le pétrole recule.';
const article = (url: string, title: string, publisher = 'Média') => ({
  url,
  title,
  description: `desc ${title}`,
  source: { id: null, name: publisher },
  publishedAt: '2026-11-22T08:00:00Z',
  author: null,
  urlToImage: null,
  content: null,
});
const log = { warn: vi.fn() } satisfies ScriptLogger;

beforeEach(async () => {
  await redis.flushall();
  textMock.mockReset();
  newsMock.mockReset();
  log.warn.mockReset();
  newsMock.mockImplementation(async (params: unknown) => {
    const q = (params as { q: string }).q;
    if (q === 'bourse') {
      return { articles: [article('https://n.test/bce', 'BCE'), article('https://n.test/x', 'Doublon')] };
    }
    return { articles: [article('https://n.test/petrole', 'Pétrole'), article('https://n.test/x', 'Doublon')] };
  });
});

describe('generatePodcastScript : détails et sujets', () => {
  it('renvoie les sources détaillées avec la catégorie de la requête, sans doublon', async () => {
    textMock.mockResolvedValueOnce(SCRIPT).mockResolvedValueOnce('{"topics":[]}');
    const result = await generatePodcastScript('user-1', ['bourse', 'energie'], 2, log);

    expect(result.sources).toEqual(['https://n.test/bce', 'https://n.test/x', 'https://n.test/petrole']);
    expect(result.sourceDetails.map((s) => [s.url, s.category])).toEqual([
      ['https://n.test/bce', 'bourse'],
      ['https://n.test/x', 'bourse'],
      ['https://n.test/petrole', 'energie'],
    ]);
    expect(result.sourceDetails[0]).toMatchObject({ title: 'BCE', publisher: 'Média', publishedAt: '2026-11-22T08:00:00Z' });
  });

  it('demande les sujets avec un schéma JSON, puis les renvoie calculés', async () => {
    textMock
      .mockResolvedValueOnce(SCRIPT)
      .mockResolvedValueOnce(
        JSON.stringify({
          topics: [{ title: 'BCE', summary: 'Taux inchangés.', category: 'bourse', anchor: 'La BCE garde ses taux' }],
        }),
      );
    const result = await generatePodcastScript('user-1', ['bourse', 'energie'], 2, log);

    expect(result.topics).toEqual([
      {
        title: 'BCE',
        summary: 'Taux inchangés.',
        category: 'bourse',
        startRatio: SCRIPT.indexOf('La BCE') / SCRIPT.length,
      },
    ]);
    const topicsOpts = textMock.mock.calls[1][2] as { responseSchema?: unknown; thinkingBudget?: number };
    expect(topicsOpts.responseSchema).toBeDefined();
    expect(topicsOpts.thinkingBudget).toBe(0);
  });

  it("garde le script et renvoie topics: [] si l'appel des sujets échoue", async () => {
    textMock.mockResolvedValueOnce(SCRIPT).mockRejectedValueOnce(new Error('Gemini 503'));
    const result = await generatePodcastScript('user-1', ['bourse'], 2, log);

    expect(result.script).toBe(SCRIPT);
    expect(result.topics).toEqual([]);
    expect(log.warn).toHaveBeenCalled();
  });

  it('renvoie topics: [] si la sortie des sujets est invalide', async () => {
    textMock.mockResolvedValueOnce(SCRIPT).mockResolvedValueOnce('{"topics": "pas un tableau"}');
    const result = await generatePodcastScript('user-1', ['bourse'], 2, log);

    expect(result.script).toBe(SCRIPT);
    expect(result.topics).toEqual([]);
  });
});
