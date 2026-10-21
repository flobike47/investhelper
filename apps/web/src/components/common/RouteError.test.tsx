import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RouteError } from './RouteError';

function Boom(): never {
  throw new Error('graphique cassé');
}

function renderFailingRoute() {
  const router = createMemoryRouter([
    { path: '/', element: <Boom />, errorElement: <RouteError fullPage /> },
  ]);
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  // React et le routeur journalisent l'exception attendue : on les fait taire.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(cleanup);

describe('RouteError', () => {
  it('remplace la page blanche par un message clair et le détail de l’erreur', () => {
    renderFailingRoute();

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Cette page a rencontré un problème')).toBeTruthy();
    expect(screen.getByText('graphique cassé')).toBeTruthy();
  });

  it('recharge la page au clic sur « Recharger »', () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    renderFailingRoute();

    fireEvent.click(screen.getByRole('button', { name: /Recharger/ }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
