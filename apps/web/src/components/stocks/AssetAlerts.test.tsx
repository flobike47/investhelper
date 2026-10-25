import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderPage } from '@/hooks/test-utils';
import { api, type PriceAlert } from '@/services/api';
import { AssetAlerts } from './AssetAlerts';

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: { getAlerts: vi.fn(), createAlert: vi.fn(), deleteAlert: vi.fn() } };
});

const push = vi.hoisted(() => ({ state: { support: 'supported', deviceSubscribed: true } as Record<string, unknown> }));
vi.mock('@/hooks/usePushNotifications', () => ({ usePushNotifications: () => push.state }));

const STOP_ALERT: PriceAlert = {
  id: 'a1',
  symbol: 'MC.PA',
  direction: 'below',
  threshold: 360,
  currency: 'EUR',
  kind: 'stop',
  createdAt: '2026-10-25T10:00:00Z',
  triggeredAt: null,
  triggeredPrice: null,
};

const renderAlerts = () =>
  renderPage(<AssetAlerts symbol="MC.PA" currency="EUR" price={383} stop={360} target={420} />);

beforeEach(() => {
  vi.mocked(api.getAlerts).mockResolvedValue({ alerts: [] });
  vi.mocked(api.createAlert).mockResolvedValue(STOP_ALERT);
  vi.mocked(api.deleteAlert).mockResolvedValue({ ok: true });
  push.state = { support: 'supported', deviceSubscribed: true };
});

describe('AssetAlerts', () => {
  it('crée une alerte au stop du plan, à la baisse', async () => {
    renderAlerts();
    fireEvent.click(await screen.findByRole('button', { name: /Alerte au stop/ }));
    await waitFor(() =>
      expect(api.createAlert).toHaveBeenCalledWith({ symbol: 'MC.PA', direction: 'below', threshold: 360, kind: 'stop' }),
    );
  });

  it("déduit le sens d'une alerte libre du cours actuel", async () => {
    renderAlerts();
    const input = await screen.findByRole('spinbutton', { name: "Prix d'alerte en EUR" });
    fireEvent.change(input, { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(api.createAlert).toHaveBeenCalledWith({ symbol: 'MC.PA', direction: 'above', threshold: 400, kind: 'price' }),
    );
  });

  it("liste l'alerte active, ne propose plus d'en créer une au stop, et permet de la supprimer", async () => {
    vi.mocked(api.getAlerts).mockResolvedValue({ alerts: [STOP_ALERT] });
    renderAlerts();
    const del = await screen.findByRole('button', { name: /Supprimer l'alerte stop/ });
    expect(screen.queryByRole('button', { name: /Alerte au stop/ })).not.toBeInTheDocument();
    fireEvent.click(del);
    await waitFor(() => expect(api.deleteAlert).toHaveBeenCalledWith('a1'));
  });

  it("explique comment recevoir les alertes quand l'appareil n'est pas abonné", async () => {
    push.state = { support: 'supported', deviceSubscribed: false };
    renderAlerts();
    expect(await screen.findByRole('link', { name: 'réglages' })).toHaveAttribute('href', '/settings');
  });
});
