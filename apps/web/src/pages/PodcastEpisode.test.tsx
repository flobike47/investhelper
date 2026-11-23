import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/hooks/test-utils';
import { player } from '@/hooks/usePlayer';
import { ApiError, type PodcastEpisodeDto } from '@/services/api';
import PodcastEpisode from './PodcastEpisode';

const m = vi.hoisted(() => ({
  eps: {
    episodes: [] as PodcastEpisodeDto[],
    loading: false,
    error: null as Error | null,
  },
}));

vi.mock('@/hooks/usePodcast', () => ({
  usePodcastEpisodes: () => ({ ...m.eps }),
}));
// En-tête mobile : l'avatar de compte lit l'utilisateur connecté.
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', user_metadata: {} } }) }));

const SCRIPT = 'Alex: texte secret du script, jamais affiché sur la page détail.';

const episode = (overrides: Partial<PodcastEpisodeDto> = {}): PodcastEpisodeDto => ({
  id: 'e1',
  date: '2026-10-20',
  categories: ['Macro / banques centrales', 'Tech & IA'],
  script: SCRIPT,
  sources: [
    'https://www.lesechos.fr/finance-marches/marches-financiers/fed-les-minutes-revelent-un-comite-divise-sur-decembre-2101234',
    'https://www.reuters.com/markets/us/treasury-yields-ease-after-fed-minutes-2026-11-22/',
  ],
  durationEstimateSec: 125,
  createdAt: '2026-10-20T08:00:00Z',
  ...overrides,
});

function renderDetail(id = 'e1') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/podcast/${id}`]}>
      <Routes>
        <Route path="/podcast/:id" element={<PodcastEpisode />} />
        <Route path="/podcast" element={<p>Liste des épisodes</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PodcastEpisode', () => {
  beforeEach(() => {
    Object.assign(m.eps, { episodes: [episode()], loading: false, error: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    player.close();
  });

  it("affiche l'en-tête de l'épisode avec son titre, sa durée et ses catégories", () => {
    renderDetail();
    expect(screen.getByRole('heading', { level: 1, name: 'Brief du 20 octobre' })).toBeInTheDocument();
    expect(screen.getByText('2 min 05 · Alex & Sophie · 2 sources')).toBeInTheDocument();
    const categories = screen.getByRole('list', { name: 'Catégories' });
    expect(categories).toHaveTextContent('Macro / banques centrales');
    expect(categories).toHaveTextContent('Tech & IA');
  });

  it('liste les sources avec un titre lisible, le média et un lien externe', () => {
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Sources (2)' })).toBeInTheDocument();

    const lemonde = screen.getByRole('link', { name: /Fed les minutes revelent un comite divise sur decembre/ });
    expect(lemonde).toHaveAttribute('href', episode().sources[0]);
    expect(lemonde).toHaveAttribute('target', '_blank');
    expect(lemonde).toHaveAttribute('rel', 'noreferrer');
    expect(lemonde).toHaveTextContent('Les Echos · lesechos.fr');

    expect(screen.getByRole('link', { name: /Treasury yields ease after fed minutes/ })).toHaveTextContent(
      'Reuters · reuters.com',
    );
  });

  it("n'affiche jamais le script", () => {
    renderDetail();
    expect(screen.queryByText(/texte secret du script/)).not.toBeInTheDocument();
  });

  it("ne rend pas un lien pour une source qui n'est pas une URL http(s)", () => {
    Object.assign(m.eps, { episodes: [episode({ sources: ['javascript:alert(1)'] })] });
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Sources (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /javascript/ })).not.toBeInTheDocument();
  });

  it("indique l'absence de source sans lien", () => {
    Object.assign(m.eps, { episodes: [episode({ sources: [] })] });
    renderDetail();
    expect(screen.getByText('Aucune source pour cet épisode.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Fed|Treasury/ })).not.toBeInTheDocument();
  });

  it("épisode introuvable → message et lien de retour vers le podcast", () => {
    renderDetail('inconnu');
    expect(screen.getByText("Cet épisode n'existe pas ou a été supprimé.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour au podcast' })).toHaveAttribute('href', '/podcast');
    expect(screen.getByRole('link', { name: 'Podcast' })).toHaveAttribute('href', '/podcast');
  });

  it('affiche le squelette pendant le chargement, sans état « introuvable »', () => {
    Object.assign(m.eps, { episodes: [], loading: true });
    const { container } = renderDetail();
    expect(container.querySelector('.ant-skeleton')).not.toBeNull();
    expect(screen.queryByText(/n'existe pas/)).not.toBeInTheDocument();
  });

  it("affiche l'erreur de chargement", () => {
    Object.assign(m.eps, { episodes: [], error: new ApiError('Épisodes indisponibles', 503, 'r1') });
    renderDetail();
    expect(screen.getByText('Épisodes indisponibles')).toBeInTheDocument();
    expect(screen.queryByText(/n'existe pas/)).not.toBeInTheDocument();
  });

  it("le bouton Écouter charge l'épisode dans le lecteur global", () => {
    const load = vi.spyOn(player, 'load').mockImplementation(() => {});
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Écouter Brief du 20 octobre' }));
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1', title: 'Brief du 20 octobre' }));
  });

  it('le bouton retour ramène au podcast', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('link', { name: 'Podcast' }));
    expect(screen.getByText('Liste des épisodes')).toBeInTheDocument();
  });
});

describe('PodcastEpisode — sujets et sources', () => {
  const FED = 'https://www.lesechos.fr/finance-marches/fed-les-minutes-2101234';
  const REUTERS = 'https://www.reuters.com/markets/us/treasury-yields-ease-after-fed-minutes-2026-11-22/';
  const BOURSO = 'https://www.boursorama.com/bourse/actualites/la-bce-temporise-7d1a2c';
  const SOLO = 'https://www.lemonde.fr/economie/inflation-6543210.html';

  const withTopics = (overrides: Partial<PodcastEpisodeDto> = {}) =>
    episode({
      sources: [FED, REUTERS, BOURSO, SOLO],
      sourceDetails: [
        { url: FED, title: 'Fed divisée', publisher: 'Les Echos', category: 'Macro', publishedAt: null },
        { url: REUTERS, title: 'Treasury yields', publisher: 'Reuters', category: 'Macro', publishedAt: null },
        { url: BOURSO, title: 'La BCE temporise', publisher: 'Boursorama', category: 'Macro', publishedAt: null },
        { url: SOLO, title: 'Inflation', publisher: 'Le Monde', category: 'Inflation', publishedAt: null },
      ],
      topics: [
        { title: 'Banques centrales', summary: 'La Fed hésite.', category: 'Macro', startRatio: 0.5 },
        { title: 'Pétrole', summary: 'Le baril se stabilise.', category: 'Énergie', startRatio: 0.8 },
      ],
      ...overrides,
    });

  beforeEach(() => {
    Object.assign(m.eps, { episodes: [withTopics()], loading: false, error: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    player.close();
  });

  it('affiche « Dans cet épisode » avec le badge IA et le moment de début de chaque sujet', () => {
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Dans cet épisode' })).toBeInTheDocument();
    expect(screen.getByText('IA')).toBeInTheDocument();
    // 0.5 × 125 s = 62,5 s → 1:03 ; 0.8 × 125 s = 100 s → 1:40
    expect(screen.getByRole('button', { name: 'Écouter Banques centrales à partir de 1:03' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Écouter Pétrole à partir de 1:40' })).toBeInTheDocument();
    expect(screen.getByText('La Fed hésite.')).toBeInTheDocument();
  });

  it("range les sources sous leur sujet et les autres dans « Autres sources »", () => {
    renderDetail();
    const topic = screen.getByRole('button', { name: /Banques centrales/ }).closest('article') as HTMLElement;
    expect(within(topic).getByRole('link', { name: /Fed divisée/ })).toBeInTheDocument();
    expect(within(topic).getByRole('link', { name: /Treasury yields/ })).toBeInTheDocument();
    expect(within(topic).queryByRole('link', { name: /La BCE temporise/ })).not.toBeInTheDocument();

    const others = screen.getByRole('heading', { name: 'Autres sources' }).closest('section') as HTMLElement;
    expect(within(others).getByRole('link', { name: /Inflation/ })).toBeInTheDocument();
  });

  it('n\'affiche que deux sources par sujet, puis déplie et replie les autres', () => {
    Object.assign(m.eps, {
      episodes: [
        withTopics({
          sources: [FED, REUTERS, BOURSO],
          sourceDetails: [
            { url: FED, title: 'Fed divisée', publisher: 'Les Echos', category: 'Macro', publishedAt: null },
            { url: REUTERS, title: 'Treasury yields', publisher: 'Reuters', category: 'Macro', publishedAt: null },
            { url: BOURSO, title: 'La BCE temporise', publisher: 'Boursorama', category: 'Macro', publishedAt: null },
          ],
        }),
      ],
    });
    renderDetail();
    const topic = screen.getByRole('button', { name: /Banques centrales/ }).closest('article') as HTMLElement;
    expect(within(topic).queryByRole('link', { name: /La BCE temporise/ })).not.toBeInTheDocument();

    fireEvent.click(within(topic).getByRole('button', { name: 'Voir 1 autre source' }));
    expect(within(topic).getByRole('link', { name: /La BCE temporise/ })).toBeInTheDocument();
    fireEvent.click(within(topic).getByRole('button', { name: 'Voir moins' }));
    expect(within(topic).queryByRole('link', { name: /La BCE temporise/ })).not.toBeInTheDocument();
  });

  it('toucher un sujet le fait écouter à partir de son moment de début', () => {
    const seek = vi.spyOn(player, 'seekTo');
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Écouter Pétrole à partir de 1:40' }));
    expect(seek).toHaveBeenCalledWith(0.8, expect.objectContaining({ id: 'e1' }));
    expect(player.getState().episode?.id).toBe('e1');
  });

  it('affiche la mention de non-conseil', () => {
    renderDetail();
    expect(
      screen.getByText("Résumé généré par IA à partir du script. Ce n'est pas un conseil en investissement."),
    ).toBeInTheDocument();
  });

  it("garde la liste plate pour un ancien épisode sans sujets", () => {
    Object.assign(m.eps, { episodes: [episode({ sourceDetails: null, topics: null })] });
    renderDetail();
    expect(screen.queryByRole('heading', { name: 'Dans cet épisode' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sources (2)' })).toBeInTheDocument();
  });
});
