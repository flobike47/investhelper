import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/hooks/test-utils';
import { BottomSheet } from './BottomSheet';

function renderSheet(onClose = vi.fn()) {
  renderWithProviders(
    <BottomSheet open onClose={onClose} title="Titre">
      <p>Contenu</p>
    </BottomSheet>,
  );
  // Le panneau qui se déplace : l'enveloppe posée par drawerRender
  const sheet = document.querySelector('.ant-drawer-content')?.parentElement as HTMLElement;
  return { onClose, sheet };
}

/** Glissé vertical d'un doigt, de `from` à `to` (px), en quelques étapes. */
function swipe(target: Element, from: number, to: number) {
  fireEvent.touchStart(target, { touches: [{ clientX: 100, clientY: from }] });
  for (let i = 1; i <= 4; i++) {
    fireEvent.touchMove(target, { touches: [{ clientX: 100, clientY: from + ((to - from) * i) / 4 }] });
  }
  fireEvent.touchEnd(target, { touches: [] });
}

describe('BottomSheet', () => {
  it('se ferme quand on le tire vers le bas depuis l\'en-tête', async () => {
    const { onClose, sheet } = renderSheet();
    swipe(screen.getByText('Titre'), 100, 500);
    expect(sheet.style.transform).toMatch(/translateY/);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('se ferme quand on tire le corps resté tout en haut', async () => {
    const { onClose } = renderSheet();
    swipe(screen.getByText('Contenu'), 100, 500);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('fait défiler le corps au lieu de fermer quand il est défilé', async () => {
    const { onClose, sheet } = renderSheet();
    const body = document.querySelector('.ant-drawer-body') as HTMLElement;
    body.scrollTop = 120;
    swipe(screen.getByText('Contenu'), 100, 500);
    expect(sheet.style.transform).toBe('');
    await new Promise((r) => setTimeout(r, 300));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ne ferme pas sur un geste vers le haut ni sur un simple tap', async () => {
    const { onClose, sheet } = renderSheet();
    swipe(screen.getByText('Titre'), 500, 100);
    fireEvent.touchStart(screen.getByText('Titre'), { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(screen.getByText('Titre'), { touches: [] });
    expect(sheet.style.transform).toBe('');
    await new Promise((r) => setTimeout(r, 300));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('se ferme toujours par la croix', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /close|fermer/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
