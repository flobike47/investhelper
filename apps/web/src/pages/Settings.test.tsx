import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/hooks/test-utils';
import { ApiError, api, type UserSettings } from '@/services/api';
import { useLocalSettings } from '@/store/localSettings';
import Settings from './Settings';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.c', user_metadata: {} }, signOut: vi.fn() }),
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: { getSettings: vi.fn(), saveSettings: vi.fn(), getQuotas: vi.fn() },
  };
});

const SERVER: UserSettings = { horizon: 'long', theme: 'dark', podcastDuration: '4' };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('Settings', () => {
  beforeEach(() => {
    localStorage.clear();
    // Le store zustand vit en mémoire entre les tests : on le remet aux défauts
    useLocalSettings.setState({ horizon: 'medium', theme: 'dark' });
    vi.mocked(api.getQuotas).mockResolvedValue({ quotas: [] });
    vi.mocked(api.saveSettings).mockResolvedValue({ ok: true });
  });

  it("n'écrase pas l'horizon serveur quand on change seulement le thème", async () => {
    const pending = deferred<UserSettings>();
    vi.mocked(api.getSettings).mockReturnValue(pending.promise);
    renderWithProviders(<Settings />);

    // Pendant le chargement, aucun formulaire (donc aucun défaut enregistrable)
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();

    pending.resolve(SERVER);
    const save = await screen.findByRole('button', { name: 'Enregistrer' });
    expect(screen.getByRole('radio', { name: 'Long terme' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Clair' }));
    fireEvent.click(save);

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledTimes(1));
    expect(api.saveSettings).toHaveBeenCalledWith({ theme: 'light' });
    expect(await screen.findByText('Préférences enregistrées.')).toBeInTheDocument();
  });

  it("si les réglages n'ont pas pu être chargés, n'envoie que les champs modifiés", async () => {
    vi.mocked(api.getSettings).mockRejectedValue(new ApiError('BFF indisponible', 503, 'r1'));
    renderWithProviders(<Settings />);

    expect(await screen.findByText(/BFF indisponible/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Clair' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ theme: 'light' }));
  });

  it("n'annonce pas de succès si l'enregistrement échoue", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SERVER);
    vi.mocked(api.saveSettings).mockRejectedValue(new ApiError('Quota dépassé', 429, 'r2'));
    renderWithProviders(<Settings />);

    fireEvent.click(await screen.findByRole('radio', { name: 'Court terme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Quota dépassé')).toBeInTheDocument();
    expect(api.saveSettings).toHaveBeenCalledWith({ horizon: 'short' });
    expect(screen.queryByText('Préférences enregistrées.')).not.toBeInTheDocument();
  });
});
