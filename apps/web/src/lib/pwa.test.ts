// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  isIos,
  isIosSafari,
  isStandalone,
  registerServiceWorker,
  shouldShowIosInstallHint,
} from './pwa';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
};
const noStandalone = { matchMedia: () => ({ matches: false }) };

describe('détection iOS', () => {
  it('reconnaît iPhone, et iPad qui se présente comme un Mac tactile', () => {
    expect(isIos({ userAgent: UA.iphoneSafari })).toBe(true);
    expect(isIos({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toBe(false);
    expect(isIos({ userAgent: UA.android })).toBe(false);
  });

  it("n'affiche l'aide d'installation que dans Safari iOS hors app installée", () => {
    expect(shouldShowIosInstallHint({ userAgent: UA.iphoneSafari }, noStandalone)).toBe(true);
    // Chrome iOS ne sait pas installer de PWA
    expect(isIosSafari({ userAgent: UA.iphoneChrome })).toBe(false);
    expect(shouldShowIosInstallHint({ userAgent: UA.iphoneChrome }, noStandalone)).toBe(false);
    // Déjà installée
    expect(shouldShowIosInstallHint({ userAgent: UA.iphoneSafari, standalone: true }, noStandalone)).toBe(false);
    expect(
      isStandalone({ userAgent: UA.android }, { matchMedia: () => ({ matches: true }) }),
    ).toBe(true);
  });
});

describe('registerServiceWorker', () => {
  it('enregistre sw.js relativement au base href (compatible BASE_PATH)', () => {
    const register = vi.fn(() => Promise.resolve());
    registerServiceWorker(
      { userAgent: '', serviceWorker: { register } },
      'https://exemple.fr/investhelper/podcast',
    );
    expect(register).toHaveBeenCalledWith('https://exemple.fr/investhelper/sw.js', {
      scope: '/investhelper/',
    });
  });

  it('ne fait rien sans support des service workers', () => {
    expect(() => registerServiceWorker({ userAgent: '' }, 'https://exemple.fr/')).not.toThrow();
  });
});

describe('manifeste PWA', () => {
  const pub = join(__dirname, '..', '..', 'public');
  const manifest = JSON.parse(readFileSync(join(pub, 'manifest.webmanifest'), 'utf8'));

  it('est installable : standalone, chemins relatifs, icônes 192 et 512', () => {
    expect(manifest.display).toBe('standalone');
    // Relatifs : l'app peut être servie sous un sous-chemin
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });

  it('référence des icônes qui existent, comme apple-touch-icon', () => {
    for (const icon of manifest.icons) expect(existsSync(join(pub, icon.src))).toBe(true);
    expect(existsSync(join(pub, 'icons', 'apple-touch-icon.png'))).toBe(true);
    expect(existsSync(join(pub, 'sw.js'))).toBe(true);
  });
});
