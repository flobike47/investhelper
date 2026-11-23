import { describe, expect, it } from 'vitest';
import { isHttpUrl, parseSourceUrl } from './sources';

describe('parseSourceUrl', () => {
  it('déduit le titre du slug, sans identifiant de fin ni www', () => {
    expect(
      parseSourceUrl(
        'https://www.lesechos.fr/finance-marches/marches-financiers/fed-les-minutes-revelent-un-comite-divise-sur-decembre-2101234',
      ),
    ).toEqual({
      url: 'https://www.lesechos.fr/finance-marches/marches-financiers/fed-les-minutes-revelent-un-comite-divise-sur-decembre-2101234',
      host: 'lesechos.fr',
      publisher: 'Les Echos',
      title: 'Fed les minutes revelent un comite divise sur decembre',
    });
  });

  it('retire la date en fin de slug', () => {
    const src = parseSourceUrl('https://www.reuters.com/markets/us/treasury-yields-ease-after-fed-minutes-2026-11-22/');
    expect(src.publisher).toBe('Reuters');
    expect(src.title).toBe('Treasury yields ease after fed minutes');
  });

  it('retire l’extension de page et l’identifiant AV-…', () => {
    const src = parseSourceUrl('https://www.bfmtv.com/economie/bourse/nvidia-resultats-record_AV-202611220341.html');
    expect(src.title).toBe('Nvidia resultats record');
  });

  it('décode les caractères encodés', () => {
    const src = parseSourceUrl('https://www.lemonde.fr/economie/inflation-%C3%A9lev%C3%A9e_6543210_3234.html');
    expect(src.publisher).toBe('Le Monde');
    expect(src.title).toBe('Inflation élevée');
  });

  it('reconnaît un sous-domaine d’un média connu', () => {
    const src = parseSourceUrl('https://finance.yahoo.com/news/nvidia-earnings-preview-123456.html');
    expect(src).toMatchObject({ host: 'finance.yahoo.com', publisher: 'Yahoo Finance', title: 'Nvidia earnings preview' });
  });

  it('URL sans chemin → le nom du média comme titre', () => {
    expect(parseSourceUrl('https://www.bloomberg.com/')).toEqual({
      url: 'https://www.bloomberg.com/',
      host: 'bloomberg.com',
      publisher: 'Bloomberg',
      title: 'Bloomberg',
    });
  });

  it('segment générique et identifiant seuls → le nom du média', () => {
    expect(parseSourceUrl('https://www.ft.com/content/3f9a2c1e8b7d4a6f9e0c1b2a3d4e5f60')).toMatchObject({
      publisher: 'Financial Times',
      title: 'Financial Times',
    });
    expect(parseSourceUrl('https://www.cnbc.com/2026/11/22/content').title).toBe('CNBC');
  });

  it('média inconnu → l’hôte', () => {
    expect(parseSourceUrl('https://blog.example.org/marches/bilan-semaine')).toMatchObject({
      host: 'blog.example.org',
      publisher: 'blog.example.org',
      title: 'Bilan semaine',
    });
  });

  it('retire l’identifiant majuscule en fin de slug (La Voix du Nord)', () => {
    expect(
      parseSourceUrl(
        'https://www.lavenir.net/regions/bruxelles/2026/11/22/chaos-au-boulevard-lambermont-LLBDRLYSXBFXNNF7VCMAOHGWEA/',
      ).title,
    ).toBe('Chaos au boulevard lambermont');
  });

  it('retire l’identifiant numérique et la date en tête du slug', () => {
    expect(
      parseSourceUrl(
        'https://www.20minutes.fr/politique/4264740-20261122-presidentielle-2027-marylise-leon-veut-eviter-second-tour',
      ).title,
    ).toBe('Presidentielle 2027 marylise leon veut eviter second tour');
  });

  it('retire l’identifiant numérique préfixé par un underscore', () => {
    expect(
      parseSourceUrl('https://www.frandroid.com/marques/nvidia/3333723_nvidia-et-maintenant-la-sec-enquete').title,
    ).toBe('Nvidia et maintenant la sec enquete');
  });

  it('retire l’identifiant numérique en tête (journaldunet)', () => {
    expect(
      parseSourceUrl('https://www.journaldunet.com/cybersecurite/1558081-post-quantique-de-l-evaluation/').title,
    ).toBe('Post quantique de l evaluation');
  });

  it('URL invalide → entrée brute partout, sans lever', () => {
    expect(parseSourceUrl('pas une url')).toEqual({
      url: 'pas une url',
      host: 'pas une url',
      publisher: 'pas une url',
      title: 'pas une url',
    });
  });

  it('schéma non http(s) → traité comme invalide', () => {
    expect(parseSourceUrl('javascript:alert(1)')).toMatchObject({ title: 'javascript:alert(1)' });
  });
});

describe('isHttpUrl', () => {
  it.each([
    ['https://www.lesechos.fr/a', true],
    ['http://example.com', true],
    ['javascript:alert(1)', false],
    ['data:text/html,hello', false],
    ['pas une url', false],
  ])('%s → %s', (url, expected) => {
    expect(isHttpUrl(url)).toBe(expected);
  });
});
