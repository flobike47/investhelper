import { describe, expect, it } from 'vitest';
import { isDue, isTimePassed, isValidTime, isValidTimeZone, localParts } from '../src/localTime.js';

const PARIS = 'Europe/Paris';

describe('localParts', () => {
  it.each([
    ['2026-10-23T06:00:00Z', PARIS, '2026-10-23', 8 * 60],
    ['2026-10-23T22:30:00Z', PARIS, '2026-10-24', 30],
    ['2026-10-23T03:00:00Z', 'America/New_York', '2026-10-22', 23 * 60],
  ])('%s en %s → %s, %i min', (iso, tz, date, minutes) => {
    expect(localParts(new Date(iso), tz)).toEqual({ date, minutes });
  });
});

describe('isValidTime / isValidTimeZone', () => {
  it.each(['00:00', '08:15', '23:59'])('accepte %s', (t) => expect(isValidTime(t)).toBe(true));
  it.each(['8:15', '24:00', '12:60', '12h30', '', 830])('refuse %s', (t) => expect(isValidTime(t)).toBe(false));
  it.each([PARIS, 'UTC', 'America/New_York'])('accepte le fuseau %s', (tz) => expect(isValidTimeZone(tz)).toBe(true));
  it.each(['Mars/Olympus', '', 'x'.repeat(65), 42])('refuse le fuseau %s', (tz) =>
    expect(isValidTimeZone(tz)).toBe(false),
  );
});

describe('isDue', () => {
  const at = (iso: string, pushTime = '08:00', lastSentOn: string | null = null) =>
    isDue({ now: new Date(iso), timeZone: PARIS, pushTime, lastSentOn });

  it.each([
    ['avant l’heure', '2026-10-23T05:59:00Z', null, false],
    ['pile à l’heure', '2026-10-23T06:00:00Z', null, true],
    ['rattrapage 2 h 59 après', '2026-10-23T08:59:00Z', null, true],
    ['trop tard (3 h après)', '2026-10-23T09:00:00Z', null, false],
    ['déjà envoyé aujourd’hui', '2026-10-23T06:30:00Z', '2026-10-23', false],
    ['envoyé hier', '2026-10-23T06:30:00Z', '2026-10-22', true],
  ])('%s', (_label, iso, lastSentOn, expected) => {
    expect(at(iso, '08:00', lastSentOn)).toBe(expected);
  });

  // Passage à l'heure d'hiver le 25/10/2026 : 08:00 Paris = 07:00 UTC (et non plus 06:00)
  it("suit l'heure locale au passage à l'heure d'hiver", () => {
    expect(at('2026-10-25T06:00:00Z')).toBe(false);
    expect(at('2026-10-25T07:00:00Z')).toBe(true);
  });

  // Passage à l'heure d'été le 29/03/2026 : 02:30 n'existe pas, rattrapé à 03:00
  it("rattrape une heure qui n'existe pas (heure d'été)", () => {
    expect(at('2026-03-29T00:59:00Z', '02:30')).toBe(false); // 01:59 locale
    expect(at('2026-03-29T01:00:00Z', '02:30')).toBe(true); // 03:00 locale
  });

  it("n'envoie qu'une fois une heure vécue deux fois (heure d'hiver)", () => {
    // 02:30 locale existe à 00:30 UTC puis à 01:30 UTC le 25/10
    expect(at('2026-10-25T00:30:00Z', '02:30')).toBe(true);
    expect(at('2026-10-25T01:30:00Z', '02:30', '2026-10-25')).toBe(false);
  });
});

describe('isTimePassed', () => {
  it("compare à l'heure locale de l'utilisateur", () => {
    const now = new Date('2026-10-23T07:00:00Z'); // 09:00 à Paris
    expect(isTimePassed(now, PARIS, '08:00')).toBe(true);
    expect(isTimePassed(now, PARIS, '10:00')).toBe(false);
  });
});
