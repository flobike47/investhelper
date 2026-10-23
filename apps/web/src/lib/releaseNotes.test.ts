// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RELEASES, type Release } from '@/constants/releases';
import { MAX_SHOWN, latestReleaseId, releaseDate, unseenReleases } from './releaseNotes';

const NOW = new Date('2026-11-10T09:00:00Z');
const rel = (id: string): Release => ({ id, added: [`note ${id}`] });
// Du plus récent au plus ancien, comme RELEASES
const LIST = ['2026-11-08', '2026-11-01.2', '2026-11-01', '2026-10-21', '2026-08-01'].map(rel);
const ids = (rs: Release[]) => rs.map((r) => r.id);

describe('unseenReleases', () => {
  it("ne montre rien à un compte créé après la dernière note", () => {
    expect(unseenReleases(LIST, { lastSeenId: null, accountCreatedAt: '2026-11-09T10:00:00Z', now: NOW })).toEqual([]);
  });

  it("montre à un ancien compte ce qui est sorti depuis son inscription, 3 au plus", () => {
    const shown = unseenReleases(LIST, { lastSeenId: null, accountCreatedAt: '2026-10-01T10:00:00Z', now: NOW });
    expect(ids(shown)).toEqual(['2026-11-08', '2026-11-01.2', '2026-11-01']);
    expect(shown).toHaveLength(MAX_SHOWN);
  });

  it('ne montre rien quand la dernière note a déjà été vue', () => {
    expect(unseenReleases(LIST, { lastSeenId: '2026-11-08', accountCreatedAt: '2026-01-01', now: NOW })).toEqual([]);
  });

  it("ne montre que ce qui est plus récent que la dernière note vue, même jour compris", () => {
    expect(ids(unseenReleases(LIST, { lastSeenId: '2026-11-01', accountCreatedAt: '2026-01-01', now: NOW }))).toEqual([
      '2026-11-08',
      '2026-11-01.2',
    ]);
  });

  it('ignore les notes de plus de 60 jours (stockage purgé, longue absence)', () => {
    const shown = unseenReleases(LIST, { lastSeenId: '2026-01-01', accountCreatedAt: null, now: NOW });
    expect(ids(shown)).not.toContain('2026-08-01');
  });

  it.each([null, undefined, 'pas une date'])('ne montre rien sans seuil connu (création du compte : %s)', (createdAt) => {
    expect(unseenReleases(LIST, { lastSeenId: null, accountCreatedAt: createdAt, now: NOW })).toEqual([]);
  });
});

describe('latestReleaseId / releaseDate', () => {
  it('renvoie la note la plus récente, ou null sans note', () => {
    expect(latestReleaseId(LIST)).toBe('2026-11-08');
    expect(latestReleaseId([])).toBeNull();
  });

  it("donne la date d'une note sans son suffixe", () => {
    expect(releaseDate(rel('2026-11-01.2'))).toBe('2026-11-01');
  });
});

describe('fichier des notes (constants/releases.ts)', () => {
  it('a des identifiants datés, uniques et triés du plus récent au plus ancien', () => {
    const list = RELEASES.map((r) => r.id);
    list.forEach((id) => expect(id).toMatch(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/));
    expect(new Set(list).size).toBe(list.length);
    expect([...list].sort().reverse()).toEqual(list);
  });

  it('a des notes non vides, en phrases courtes', () => {
    for (const r of RELEASES) {
      const lines = [...(r.added ?? []), ...(r.fixed ?? []), ...(r.improved ?? [])];
      expect(lines.length, r.id).toBeGreaterThan(0);
      lines.forEach((l) => {
        expect(l.trim().length, r.id).toBeGreaterThan(0);
        expect(l.length, `${r.id} : « ${l} »`).toBeLessThanOrEqual(140);
      });
    }
  });
});
