import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/hooks/test-utils';
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

const episode = (id: string, createdAt: string): PodcastEpisodeDto => ({
  id,
  date: createdAt.slice(0, 10),
  categories: ['Tech & IA'],
  script: `Alex: épisode ${id}.`,
  sources: ['https://example.com'],
  durationEstimateSec: 125,
  createdAt,
});

const checked = (label: string) =>
  (screen.getByRole('radio', { name: label }) as HTMLInputElement).checked;

describe('Podcast', () => {
  beforeEach(() => {
    m.settings.podcastDuration = 'auto';
    Object.assign(m.cats, { categories: [], loading: false, error: null, adding: false });
    Object.assign(m.eps, { episodes: [], loading: false, error: null });
    m.cats.addAsync.mockReset();
  });

  it("la durée suit le réglage utilisateur tant qu'on ne l'a pas changée sur la page", () => {
    m.settings.podcastDuration = '2';
    const { rerender } = renderWithProviders(<Podcast />);
    expect(checked('2 min')).toBe(true);

    // Les réglages serveur arrivent / changent après le montage
    m.settings.podcastDuration = '8';
    rerender(<Podcast />);
    expect(checked('8 min')).toBe(true);
    expect(screen.getByText(/~8 minutes/)).toBeInTheDocument();

    // Choix explicite : il n'est plus écrasé par le réglage
    fireEvent.click(screen.getByRole('radio', { name: '4 min' }));
    m.settings.podcastDuration = '2';
    rerender(<Podcast />);
    expect(checked('4 min')).toBe(true);
  });

  it("n'affiche pas les états vides pendant le chargement", () => {
    m.cats.loading = true;
    m.eps.loading = true;
    renderWithProviders(<Podcast />);
    expect(screen.queryByText(/Aucune catégorie/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pas encore d'épisode/)).not.toBeInTheDocument();
  });

  it('affiche les erreurs de chargement', () => {
    m.cats.error = new ApiError('Catégories indisponibles', 503, 'r1');
    m.eps.error = new ApiError('Épisodes indisponibles', 503, 'r2');
    renderWithProviders(<Podcast />);
    expect(screen.getByText('Catégories indisponibles')).toBeInTheDocument();
    expect(screen.getByText('Épisodes indisponibles')).toBeInTheDocument();
    expect(screen.queryByText(/Pas encore d'épisode/)).not.toBeInTheDocument();
  });

  it("annonce l'ajout d'une catégorie suggérée seulement après confirmation", async () => {
    let confirm!: () => void;
    m.cats.addAsync.mockReturnValue(new Promise<void>((r) => (confirm = r)));
    renderWithProviders(<Podcast />);

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la catégorie Crypto' }));
    expect(m.cats.addAsync).toHaveBeenCalledWith('Crypto');
    expect(screen.queryByText('« Crypto » ajoutée.')).not.toBeInTheDocument();

    confirm();
    expect(await screen.findByText('« Crypto » ajoutée.')).toBeInTheDocument();
  });

  it("rend la saisie si l'ajout d'une catégorie échoue", async () => {
    m.cats.addAsync.mockRejectedValue(new ApiError('Trop de catégories (max 20)', 400, 'r'));
    renderWithProviders(<Podcast />);
    const input = screen.getByRole('textbox', { name: 'Nouvelle catégorie' });
    fireEvent.change(input, { target: { value: 'Inflation' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });

    expect(m.cats.addAsync).toHaveBeenCalledWith('Inflation');
    await screen.findByDisplayValue('Inflation');
    expect(screen.queryByText('« Inflation » ajoutée.')).not.toBeInTheDocument();
  });

  it("ne monte qu'un seul lecteur à la fois", () => {
    m.eps.episodes = [episode('e1', '2026-10-20T08:00:00Z'), episode('e2', '2026-10-21T08:00:00Z')];
    renderWithProviders(<Podcast />);
    expect(screen.queryAllByRole('region', { name: /Lecteur de l'épisode/ })).toHaveLength(0);

    const [play1, play2] = screen.getAllByRole('button', { name: /^Écouter l'épisode/ });
    fireEvent.click(play1);
    expect(screen.getAllByRole('region', { name: /Lecteur de l'épisode/ })).toHaveLength(1);

    fireEvent.click(play2);
    const players = screen.getAllByRole('region', { name: /Lecteur de l'épisode/ });
    expect(players).toHaveLength(1);
    expect(play2).toHaveAttribute('aria-expanded', 'true');
    expect(play1).toHaveAttribute('aria-expanded', 'false');
  });

  it('donne un libellé explicite aux boutons icônes des épisodes', () => {
    m.eps.episodes = [episode('e1', '2026-10-20T08:00:00Z')];
    m.cats.categories = ['Luxe'];
    renderWithProviders(<Podcast />);
    expect(screen.getByRole('button', { name: /^Supprimer l'épisode du/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Partager l'épisode du/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer la catégorie Luxe' })).toBeInTheDocument();
  });
});
