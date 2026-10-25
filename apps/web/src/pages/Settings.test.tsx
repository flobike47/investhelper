import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderPage } from '@/hooks/test-utils';
import { ApiError, api, type UserSettings } from '@/services/api';
import { useLocalSettings } from '@/store/localSettings';
import { RELEASES } from '@/constants/releases';
import Settings from './Settings';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.c', user_metadata: {} }, signOut: vi.fn() }),
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: { getSettings: vi.fn(), saveSettings: vi.fn(), getQuotas: vi.fn(), getCategories: vi.fn() },
  };
});

const SERVER: UserSettings = {
  horizon: 'long',
  theme: 'dark',
  podcastDuration: '4',
  podcastPushEnabled: false,
  podcastPushTime: '08:00',
  timezone: 'Europe/Paris',
  capitalEur: null,
  riskPerTradePct: 1,
};

// État de l'appareil (support, permission, abonnement) : piloté par chaque test
const push = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  enable: vi.fn(async () => undefined),
  disable: vi.fn(async () => undefined),
  sendTest: vi.fn(async () => ({ devices: 1, sent: 1, failures: [] as { status: number | null; reason: string }[] })),
  setTime: vi.fn(async () => undefined),
}));
vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    support: 'supported',
    permission: 'default',
    deviceSubscribed: true,
    busy: false,
    enabled: false,
    time: '08:00',
    enable: push.enable,
    disable: push.disable,
    sendTest: push.sendTest,
    setTime: push.setTime,
    ...push.state,
  }),
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const checked = (name: string) => (screen.getByRole('radio', { name }) as HTMLInputElement).checked;

describe('Settings', () => {
  beforeEach(() => {
    localStorage.clear();
    // Le store zustand vit en mémoire entre les tests : on le remet aux défauts
    useLocalSettings.setState({ horizon: 'medium', theme: 'dark' });
    vi.mocked(api.getQuotas).mockResolvedValue({ quotas: [] });
    vi.mocked(api.saveSettings).mockResolvedValue({ ok: true });
    vi.mocked(api.getCategories).mockResolvedValue({ categories: ['Bourse'] });
    push.state = {};
  });

  it('affiche les valeurs serveur, jamais des défauts modifiables pendant le chargement', async () => {
    const pending = deferred<UserSettings>();
    vi.mocked(api.getSettings).mockReturnValue(pending.promise);
    renderPage(<Settings />);

    expect(screen.queryByRole('radio', { name: 'Clair' })).not.toBeInTheDocument();

    pending.resolve(SERVER);
    await screen.findByRole('radio', { name: 'Clair' });
    await waitFor(() => expect(checked('Long')).toBe(true), { timeout: 3000 });
    expect(checked('Sombre')).toBe(true);
    expect(checked('4 min')).toBe(true);
  });

  it("enregistre immédiatement et n'envoie que le champ modifié", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SERVER);
    renderPage(<Settings />);

    fireEvent.click(await screen.findByRole('radio', { name: 'Clair' }));

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledTimes(1));
    // L'horizon « long » n'est pas renvoyé : il ne peut pas être écrasé
    expect(api.saveSettings).toHaveBeenCalledWith({ theme: 'light' });
    expect(await screen.findByText('Enregistré')).toBeInTheDocument();
  });

  it('enregistre le capital à la sortie du champ, pas à chaque frappe', async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SERVER);
    renderPage(<Settings />);

    const input = await screen.findByRole('spinbutton', { name: 'Capital en euros' });
    fireEvent.change(input, { target: { value: '15000' } });
    expect(api.saveSettings).not.toHaveBeenCalled();
    fireEvent.blur(input);

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ capitalEur: 15000 }));
  });

  it('enregistre le risque par position choisi', async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SERVER);
    renderPage(<Settings />);

    fireEvent.click(await screen.findByRole('radio', { name: '0,5 %' }));

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ riskPerTradePct: 0.5 }));
  });

  it("n'annonce pas de succès si l'enregistrement échoue", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SERVER);
    vi.mocked(api.saveSettings).mockRejectedValue(new ApiError('Quota dépassé', 429, 'r2'));
    renderPage(<Settings />);

    fireEvent.click(await screen.findByRole('radio', { name: 'Court' }));

    expect(await screen.findByText('Quota dépassé')).toBeInTheDocument();
    expect(api.saveSettings).toHaveBeenCalledWith({ horizon: 'short' });
    expect(screen.queryByText('Enregistré')).not.toBeInTheDocument();
  });

  it("affiche l'utilisation des quotas du jour", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(SERVER);
    vi.mocked(api.getQuotas).mockResolvedValue({
      quotas: [{ bucket: 'podcastScript', used: 2, limit: 20, remaining: 18, resetSec: 9 * 3600 }],
    });
    renderPage(<Settings />);

    expect(await screen.findByText('Épisodes de podcast')).toBeInTheDocument();
    expect(screen.getByText('2 / 20')).toBeInTheDocument();
    expect(screen.getByText('Remise à zéro dans 9 h')).toBeInTheDocument();
  });
});

describe('Settings — rappel du podcast', () => {
  beforeEach(() => {
    localStorage.clear();
    useLocalSettings.setState({ horizon: 'medium', theme: 'dark' });
    vi.mocked(api.getSettings).mockResolvedValue(SERVER);
    vi.mocked(api.getQuotas).mockResolvedValue({ quotas: [] });
    vi.mocked(api.getCategories).mockResolvedValue({ categories: ['Bourse'] });
    push.state = {};
    push.enable.mockClear();
    push.sendTest.mockClear();
  });

  const reminderSwitch = () => screen.findByRole('switch', { name: 'Rappel quotidien du podcast' });

  it("active le rappel sur cet appareil d'un geste", async () => {
    renderPage(<Settings />);
    fireEvent.click(await reminderSwitch());
    await waitFor(() => expect(push.enable).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Rappel activé')).toBeInTheDocument();
  });

  it("explique qu'il faut installer l'app sur iPhone", async () => {
    push.state = { support: 'needs-install' };
    renderPage(<Settings />);
    expect(await screen.findByText("Sur iPhone, installe d'abord l'app")).toBeInTheDocument();
    expect(await reminderSwitch()).toBeDisabled();
  });

  it('explique comment débloquer des notifications refusées', async () => {
    push.state = { permission: 'denied' };
    renderPage(<Settings />);
    expect(await screen.findByText('Notifications bloquées')).toBeInTheDocument();
    expect(await reminderSwitch()).toBeDisabled();
  });

  it("propose l'heure d'envoi et un test une fois activé", async () => {
    push.state = { enabled: true, time: '07:45' };
    renderPage(<Settings />);
    expect(await screen.findByRole('textbox', { name: "Heure d'envoi du rappel" })).toHaveValue('07:45');
    fireEvent.click(screen.getByRole('button', { name: /envoyer un test/i }));
    await waitFor(() => expect(push.sendTest).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Notification envoyée.')).toBeInTheDocument();
  });

  it("explique un envoi refusé par le service de notifications", async () => {
    push.state = { enabled: true };
    push.sendTest.mockResolvedValueOnce({ devices: 1, sent: 0, failures: [{ status: 400, reason: 'VapidPkHashMismatch' }] });
    renderPage(<Settings />);
    fireEvent.click(await screen.findByRole('button', { name: /envoyer un test/i }));
    expect(await screen.findByText(/a refusé l'envoi \(400 VapidPkHashMismatch\)/)).toBeInTheDocument();
  });

  it("prévient qu'aucun épisode n'est préparé sans thème", async () => {
    push.state = { enabled: true };
    vi.mocked(api.getCategories).mockResolvedValue({ categories: [] });
    renderPage(<Settings />);
    expect(await screen.findByText(/sans thème, aucun épisode/)).toBeInTheDocument();
  });

  it("signale l'appareil qui ne reçoit pas le rappel", async () => {
    push.state = { enabled: true, deviceSubscribed: false };
    renderPage(<Settings />);
    expect(await screen.findByText('Cet appareil ne reçoit pas le rappel.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activer ici' }));
    await waitFor(() => expect(push.enable).toHaveBeenCalledTimes(1));
  });
});

describe('Settings — nouveautés', () => {
  beforeEach(() => {
    vi.mocked(api.getSettings).mockResolvedValue(SERVER);
    vi.mocked(api.getQuotas).mockResolvedValue({ quotas: [] });
    vi.mocked(api.getCategories).mockResolvedValue({ categories: ['Bourse'] });
    push.state = {};
  });

  it("rouvre l'historique des notes de mise à jour", async () => {
    renderPage(<Settings />);
    fireEvent.click(await screen.findByRole('button', { name: /Nouveautés/ }));
    expect(await screen.findByText('Historique des nouveautés')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(RELEASES.length);
  });
});
