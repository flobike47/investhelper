import { describe, expect, it } from 'vitest';
import { describeRouteError, isChunkLoadError } from './routeError';

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x/assets/News-abc.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
  ])('reconnaît « %s »', (msg) => {
    expect(isChunkLoadError(new TypeError(msg))).toBe(true);
  });

  it('ignore les autres erreurs et les valeurs non-Error', () => {
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('describeRouteError', () => {
  it('propose de recharger quand un chunk a disparu après déploiement', () => {
    const view = describeRouteError(new TypeError('Importing a module script failed.'));
    expect(view.status).toBe('warning');
    expect(view.title).toMatch(/nouvelle version/);
  });

  it('distingue une réponse 404 du routeur', () => {
    const view = describeRouteError({ status: 404, statusText: 'Not Found', internal: true, data: '' });
    expect(view.status).toBe('404');
  });

  it('garde un message clair et expose le détail technique et le reqId', () => {
    const err = Object.assign(new Error('Quota dépassé'), { reqId: 'req-42' });
    const view = describeRouteError(err);
    expect(view).toMatchObject({ status: 'error', detail: 'Quota dépassé', reqId: 'req-42' });
    expect(view.subTitle).not.toContain('Quota');
  });

  it('gère une valeur jetée qui n’est pas une Error', () => {
    const view = describeRouteError('oups');
    expect(view.status).toBe('error');
    expect(view.detail).toBeUndefined();
  });
});
