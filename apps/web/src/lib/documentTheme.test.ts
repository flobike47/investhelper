import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyDocumentTheme } from './documentTheme';

function metaContents() {
  return Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).map(
    (m) => m.content,
  );
}

beforeEach(() => {
  document.head.innerHTML = `
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#13161d" />`;
});

afterEach(() => {
  document.head.innerHTML = '';
  document.documentElement.style.colorScheme = '';
  document.body.style.backgroundColor = '';
  document.documentElement.style.removeProperty('--ih-color-border-secondary');
});

describe('applyDocumentTheme', () => {
  it('impose la couleur du thème choisi à toutes les metas theme-color', () => {
    applyDocumentTheme({
      mode: 'light',
      themeColor: '#ffffff',
      background: '#f5f5f5',
      borderSecondary: '#f0f0f0',
    });
    expect(metaContents()).toEqual(['#ffffff', '#ffffff']);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.body.style.backgroundColor).toBe('rgb(245, 245, 245)');
    expect(document.documentElement.style.getPropertyValue('--ih-color-border-secondary')).toBe(
      '#f0f0f0',
    );
  });

  it('restaure l’état précédent au cleanup', () => {
    const restore = applyDocumentTheme({
      mode: 'dark',
      themeColor: '#000000',
      background: '#000000',
      borderSecondary: '#111111',
    });
    expect(metaContents()).toEqual(['#000000', '#000000']);
    restore();
    expect(metaContents()).toEqual(['#ffffff', '#13161d']);
    expect(document.documentElement.style.colorScheme).toBe('');
    expect(document.body.style.backgroundColor).toBe('');
    expect(document.documentElement.style.getPropertyValue('--ih-color-border-secondary')).toBe('');
  });
});
