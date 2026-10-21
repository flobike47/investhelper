import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderPage } from '@/hooks/test-utils';
import { player } from '@/hooks/usePlayer';
import { ApiError, type PodcastDuration, type PodcastEpisodeDto } from '@/services/api';
import Podcast from './Podcast';

const m = vi.hoisted(() => ({
  settings: { podcastDuration: 'auto' as PodcastDuration },
  cats: {
    categories: [] as string[],
    loading: false,
    error: null as Error | null,
    adding: false,
    addAsync: vi.fn<(name: string) => Promise<unknown>>(),
    remove: vi.fn(),
  },
  eps: {
    episodes: [] as PodcastEpisodeDto[],
    loading: false,
    error: null as Error | null,
    add: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@/hooks/useUserSettings', () => ({ useUserSettings: () => ({ ...m.settings }) }));
vi.mock('@/hooks/usePodcast', () => ({
  usePodcastCategories: () => ({ ...m.cats }),
  usePodcastEpisodes: () => ({ ...m.eps }),
  usePodcastScript: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', user_metadata: {} } }) }));

const episode = (id: string, createdAt: string): PodcastEpisodeDto => ({
  id,
  date: createdAt.slice(0, 10),
  categories: ['Tech & IA'],
  script: `Alex: épisode ${id}.`,
  sources: ['https://example.com'],
  durationEstimateSec: 125,
  createdAt,
});

const checked = (label: string) => (screen.getByRole('radio', { name: label }) as HTMLInputElement).checked;

describe('Podcast', () => {
  beforeEach(() => {
    m.settings.podcastDuration = 'auto';
    Object.assign(m.cats, { categories: [], loading: false, error: null, adding: false });
    Object.assign(m.eps, { episodes: [], loading: false, error: null });
    m.cats.addAsync.mockReset();
  });
  afterEach(() => player.close());

  it("la durée suit le réglage utilisateur tant qu'on ne l'a pas changée sur la page", () => {
    m.settings.podcastDuration = '2';
    const { rerender } = renderPage(<Podcast />);
    expect(checked('2 min')).toBe(true);

    // Les réglages serveur arrivent / changent après le montage
    m.settings.podcastDuration = '8';
    rerender(<Podcast />);
    expect(checked('8 min')).toBe(true);

    // Choix explicite : il n'est plus écrasé par le réglage
    fireEvent.click(screen.getByRole('radio', { name: '4 min' }));
    m.settings.podcastDuration = '2';
    rerender(<Podcast />);
    expect(checked('4 min')).toBe(true);
  });

  it("n'affiche pas les états vides pendant le chargement", () => {
    m.cats.loading = true;
    m.eps.loading = true;
    renderPage(<Podcast />);
    expect(screen.queryByText(/Choisis les thèmes/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pas encore d'épisode/)).not.toBeInTheDocument();
  });

  it('affiche les erreurs de chargement', () => {
    m.cats.error = new ApiError('Catégories indisponibles', 503, 'r1');
    m.eps.error = new ApiError('Épisodes indisponibles', 503, 'r2');
    renderPage(<Podcast />);
    expect(screen.getByText('Catégories indisponibles')).toBeInTheDocument();
    expect(screen.getByText('Épisodes indisponibles')).toBeInTheDocument();
    expect(screen.queryByText(/Pas encore d'épisode/)).not.toBeInTheDocument();
  });

  it("annonce l'ajout d'une catégorie suggérée seulement après confirmation", async () => {
    let confirm!: () => void;
    m.cats.addAsync.mockReturnValue(new Promise<void>((r) => (confirm = r)));
    renderPage(<Podcast />);

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la catégorie Crypto' }));
    expect(m.cats.addAsync).toHaveBeenCalledWith('Crypto');
    expect(screen.queryByText('« Crypto » ajoutée.')).not.toBeInTheDocument();

    confirm();
    expect(await screen.findByText('« Crypto » ajoutée.')).toBeInTheDocument();
  });

  it("rend la saisie si l'ajout d'une catégorie échoue", async () => {
    m.cats.addAsync.mockRejectedValue(new ApiError('Trop de catégories (max 20)', 400, 'r'));
    renderPage(<Podcast />);
    const input = screen.getByRole('searchbox', { name: 'Nouvelle catégorie' });
    fireEvent.change(input, { target: { value: 'Inflation' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });

    expect(m.cats.addAsync).toHaveBeenCalledWith('Inflation');
    await screen.findByDisplayValue('Inflation');
    expect(screen.queryByText('« Inflation » ajoutée.')).not.toBeInTheDocument();
  });

  it("un seul épisode à la fois dans le lecteur global, qui remplace l'épisode en cours", () => {
    m.eps.episodes = [episode('e1', '2026-10-20T08:00:00Z'), episode('e2', '2026-10-21T08:00:00Z')];
    renderPage(<Podcast />);
    expect(screen.queryByRole('region', { name: /^Brief du/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Écouter Brief du 20 octobre' }));
    expect(screen.getByRole('region', { name: 'Brief du 20 octobre' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Écouter Brief du 21 octobre' }));
    expect(screen.getAllByRole('region', { name: /^Brief du/ })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Brief du 21 octobre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Écouter Brief du 21 octobre' })).toHaveAttribute('aria-current', 'true');
  });

  it('donne un libellé explicite aux boutons icônes', () => {
    m.eps.episodes = [episode('e1', '2026-10-20T08:00:00Z')];
    m.cats.categories = ['Luxe'];
    renderPage(<Podcast />);
    expect(screen.getByRole('button', { name: 'Partager Brief du 20 octobre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Plus d'actions pour Brief du 20 octobre" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer la catégorie Luxe' })).toBeInTheDocument();
  });
});
