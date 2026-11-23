import { describe, expect, it } from 'vitest';
import {
  buildSourceDetails,
  computeStartRatio,
  isHttpUrl,
  parseTopicsOutput,
  sanitizeSourceDetails,
  sanitizeTopics,
} from '../src/podcastDetails.js';

const SCRIPT = 'Alex: Bonjour à tous. Sophie: Premier sujet, la BCE. Alex: Passons au pétrole.';

describe('isHttpUrl', () => {
  it.each([
    ['https://example.com/a', true],
    ['http://example.com', true],
    ['javascript:alert(1)', false],
    ['ftp://example.com/a', false],
    ['pas une url', false],
    ['', false],
  ])('%s → %s', (url, expected) => {
    expect(isHttpUrl(url)).toBe(expected);
  });
});

describe('buildSourceDetails', () => {
  it('dédoublonne par URL en gardant la première catégorie (ordre stable)', () => {
    const details = buildSourceDetails([
      {
        category: 'bourse',
        articles: [
          { url: 'https://a.test/1', title: 'A1', publisher: 'Média A', publishedAt: '2026-11-22T08:00:00Z' },
          { url: 'https://a.test/2', title: 'A2', publisher: null, publishedAt: null },
        ],
      },
      {
        category: 'energie',
        articles: [{ url: 'https://a.test/1', title: 'A1 bis', publisher: 'Média A', publishedAt: null }],
      },
    ]);
    expect(details.map((d) => d.url)).toEqual(['https://a.test/1', 'https://a.test/2']);
    expect(details[0]).toEqual({
      url: 'https://a.test/1',
      title: 'A1',
      publisher: 'Média A',
      category: 'bourse',
      publishedAt: '2026-11-22T08:00:00Z',
    });
    expect(details[1].publisher).toBeNull();
  });

  it('écarte les URL non http(s)', () => {
    const details = buildSourceDetails([
      { category: 'x', articles: [{ url: 'javascript:alert(1)', title: 'T', publisher: null, publishedAt: null }] },
    ]);
    expect(details).toEqual([]);
  });
});

describe('sanitizeSourceDetails (entrée client)', () => {
  it('garde les entrées http(s) valides et écarte le reste', () => {
    const out = sanitizeSourceDetails([
      { url: 'https://ok.test/a', title: 'Ok', publisher: 'M', category: 'bourse', publishedAt: null },
      { url: 'ftp://bad.test/a', title: 'Ftp' },
      { url: 'https://ok.test/a', title: 'doublon' },
      'pas un objet',
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ url: 'https://ok.test/a', title: 'Ok', category: 'bourse' });
  });

  it('borne le nombre de sources et la longueur des champs', () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ url: `https://ok.test/${i}` }));
    expect(sanitizeSourceDetails(many)).toHaveLength(100);
    const [long] = sanitizeSourceDetails([{ url: 'https://ok.test/x', title: 'x'.repeat(1000) }]);
    expect(long.title).toHaveLength(300);
  });

  it('renvoie [] pour une valeur qui n\'est pas un tableau', () => {
    expect(sanitizeSourceDetails({ url: 'https://ok.test' })).toEqual([]);
    expect(sanitizeSourceDetails(undefined)).toEqual([]);
  });
});

describe('sanitizeTopics (entrée client)', () => {
  it('écarte les sujets sans titre ou sans position, borne startRatio à [0, 1]', () => {
    const out = sanitizeTopics([
      { title: 'BCE', summary: 'Taux', category: 'bourse', startRatio: 1.7 },
      { title: '', startRatio: 0.2 },
      { title: 'Sans position' },
      { title: 'Négatif', startRatio: -0.5 },
    ]);
    expect(out).toEqual([
      { title: 'BCE', summary: 'Taux', category: 'bourse', startRatio: 1 },
      { title: 'Négatif', summary: '', category: null, startRatio: 0 },
    ]);
  });

  it('plafonne à 8 sujets', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `T${i}`, startRatio: i / 12 }));
    expect(sanitizeTopics(many)).toHaveLength(8);
  });
});

describe('computeStartRatio', () => {
  it('renvoie la position relative de l\'ancrage', () => {
    const idx = SCRIPT.indexOf('Premier sujet');
    expect(computeStartRatio(SCRIPT, 'Premier sujet')).toBeCloseTo(idx / SCRIPT.length);
  });

  it('ignore la casse si la recherche exacte échoue', () => {
    expect(computeStartRatio(SCRIPT, 'PREMIER SUJET')).not.toBeNull();
  });

  it('renvoie null si l\'ancrage est absent', () => {
    expect(computeStartRatio(SCRIPT, 'texte inexistant')).toBeNull();
  });
});

describe('parseTopicsOutput', () => {
  const cats = ['bourse', 'energie'];
  const ok = (topics: unknown[]) => JSON.stringify({ topics });

  it('calcule startRatio depuis l\'ancrage et trie par position', () => {
    const raw = ok([
      { title: 'Pétrole', summary: 'Le baril', category: 'energie', anchor: 'Passons au pétrole' },
      { title: 'BCE', summary: 'Les taux', category: 'bourse', anchor: 'Premier sujet, la BCE' },
    ]);
    const topics = parseTopicsOutput(raw, SCRIPT, cats);
    expect(topics.map((t) => t.title)).toEqual(['BCE', 'Pétrole']);
    expect(topics[0].startRatio).toBeCloseTo(SCRIPT.indexOf('Premier') / SCRIPT.length);
    expect(topics[1].category).toBe('energie');
  });

  it('met la catégorie inconnue à null sans rejeter le sujet', () => {
    const topics = parseTopicsOutput(
      ok([{ title: 'BCE', summary: 'Taux', category: 'crypto', anchor: 'Premier sujet' }]),
      SCRIPT,
      cats,
    );
    expect(topics).toHaveLength(1);
    expect(topics[0].category).toBeNull();
  });

  it('répartit régulièrement un sujet dont l\'ancrage est introuvable', () => {
    const topics = parseTopicsOutput(
      ok([
        { title: 'A', summary: 'a', category: 'bourse', anchor: 'introuvable 1' },
        { title: 'B', summary: 'b', category: 'bourse', anchor: 'introuvable 2' },
      ]),
      SCRIPT,
      cats,
    );
    expect(topics.map((t) => t.startRatio)).toEqual([0, 0.5]);
  });

  it.each([
    ['JSON invalide', '{ pas du json'],
    ['pas d\'objet', '[]'],
    ['topics absent', '{"autre": 1}'],
    ['liste vide', ok([])],
    ['plus de 8 sujets', ok(Array.from({ length: 9 }, (_, i) => ({ title: `T${i}`, summary: 's', category: 'bourse', anchor: 'Alex' })))],
    ['titre non string', ok([{ title: 3, summary: 's', category: 'bourse', anchor: 'Alex' }])],
    ['titre trop long', ok([{ title: 'x'.repeat(121), summary: 's', category: 'bourse', anchor: 'Alex' }])],
    ['ancrage vide', ok([{ title: 'T', summary: 's', category: 'bourse', anchor: '  ' }])],
    ['un sujet invalide parmi des valides', ok([
      { title: 'T', summary: 's', category: 'bourse', anchor: 'Alex' },
      { title: 'T', category: 'bourse', anchor: 'Alex' },
    ])],
  ])('renvoie [] si la sortie est invalide : %s', (_label, raw) => {
    expect(parseTopicsOutput(raw, SCRIPT, cats)).toEqual([]);
  });
});
