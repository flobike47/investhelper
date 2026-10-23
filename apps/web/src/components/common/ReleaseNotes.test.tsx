import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/hooks/test-utils';
import { RELEASES, type Release } from '@/constants/releases';
import { useLocalSettings } from '@/store/localSettings';
import { ReleaseNotes, ReleaseNotesOnLaunch } from './ReleaseNotes';

const auth = vi.hoisted(() => ({ user: null as { id: string; created_at: string } | null }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: auth.user }) }));

const LATEST = RELEASES[0];
const OLD_ACCOUNT = { id: 'u1', created_at: '2020-01-01T00:00:00Z' };

beforeEach(() => {
  // Le lendemain de la dernière note : le test ne périme pas quand on en ajoute
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${LATEST.id.slice(0, 10)}T12:00:00Z`).getTime() + 24 * 60 * 60 * 1000);
  localStorage.clear();
  useLocalSettings.setState({ lastSeenRelease: null });
  auth.user = OLD_ACCOUNT;
});
afterEach(() => vi.useRealTimers());

describe("Nouveautés à l'ouverture", () => {
  it("affiche les notes pas encore vues sur cet appareil", async () => {
    renderWithProviders(<ReleaseNotesOnLaunch />);
    expect(await screen.findByText('Nouveautés')).toBeInTheDocument();
    // Première ligne de la dernière note, quelle que soit sa section
    const firstLine = [...(LATEST.added ?? []), ...(LATEST.fixed ?? []), ...(LATEST.improved ?? [])][0];
    expect(screen.getByText(firstLine)).toBeInTheDocument();
  });

  it("« C'est noté » enregistre la dernière note et ferme", async () => {
    renderWithProviders(<ReleaseNotesOnLaunch />);
    fireEvent.click(await screen.findByRole('button', { name: "C'est noté" }));
    expect(useLocalSettings.getState().lastSeenRelease).toBe(LATEST.id);
    // Le tiroir fermé reste monté, masqué par le CSS d'antd (absent des tests, cf. test-utils)
    await waitFor(() => expect(document.querySelector('.ant-drawer-open')).toBeNull());
  });

  it("ne réaffiche pas une note déjà vue", () => {
    useLocalSettings.setState({ lastSeenRelease: LATEST.id });
    renderWithProviders(<ReleaseNotesOnLaunch />);
    expect(screen.queryByText('Nouveautés')).not.toBeInTheDocument();
  });

  it("ne montre pas l'historique à un compte créé après la dernière note", () => {
    auth.user = { id: 'u2', created_at: new Date().toISOString() };
    renderWithProviders(<ReleaseNotesOnLaunch />);
    expect(screen.queryByText('Nouveautés')).not.toBeInTheDocument();
  });

  it('ne montre rien sans utilisateur connecté', () => {
    auth.user = null;
    renderWithProviders(<ReleaseNotesOnLaunch />);
    expect(screen.queryByText('Nouveautés')).not.toBeInTheDocument();
  });
});

describe('ReleaseNotes', () => {
  it("n'affiche que les sections remplies, et la date en toutes lettres", async () => {
    const onlyFix: Release = { id: '2026-10-21', fixed: ['La lecture ne se coupe plus.'] };
    renderWithProviders(<ReleaseNotes releases={[onlyFix]} open onClose={() => {}} />);
    expect(await screen.findByRole('region', { name: 'Corrigé' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ajouté' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Revu' })).not.toBeInTheDocument();
    expect(screen.getByText('Mise à jour du 21 octobre 2026')).toBeInTheDocument();
  });

  it('date chaque note quand il y en a plusieurs', async () => {
    const two: Release[] = [
      { id: '2026-10-23', added: ['Rappel du podcast.'] },
      { id: '2026-10-21', added: ['Nouvelle interface.'] },
    ];
    renderWithProviders(<ReleaseNotes releases={two} open onClose={() => {}} />);
    expect(await screen.findByRole('heading', { name: '23 octobre 2026' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '21 octobre 2026' })).toBeInTheDocument();
  });
});
