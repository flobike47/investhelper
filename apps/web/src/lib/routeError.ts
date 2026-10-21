/**
 * Traduit une erreur attrapée par le routeur (exception de rendu, échec de
 * chargement d'un chunk lazy, réponse 404…) en contenu affichable.
 * Logique pure, sans React : testable unitairement.
 */

export interface RouteErrorView {
  status: 'error' | '404' | 'warning';
  title: string;
  subTitle: string;
  /** Message technique brut, affiché en discret pour le support. */
  detail?: string;
  /** Identifiant de requête BFF (ApiError.reqId), utile au support. */
  reqId?: string;
}

/**
 * Après un déploiement, les anciens chunks n'existent plus : l'import
 * dynamique d'une page échoue. Les messages varient selon le navigateur.
 */
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chrome
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite
];

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(error.message));
}

function isRouteErrorResponseLike(
  error: unknown,
): error is { status: number; statusText: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    'statusText' in error &&
    'internal' in error
  );
}

export function describeRouteError(error: unknown): RouteErrorView {
  if (isChunkLoadError(error)) {
    return {
      status: 'warning',
      title: 'Une nouvelle version est disponible',
      subTitle: "Cette page n'a pas pu être chargée. Recharge pour obtenir la dernière version.",
    };
  }

  if (isRouteErrorResponseLike(error) && error.status === 404) {
    return {
      status: '404',
      title: 'Page introuvable',
      subTitle: "Cette adresse ne correspond à aucune page d'InvestHelper.",
    };
  }

  const reqId =
    error instanceof Error && 'reqId' in error && typeof error.reqId === 'string'
      ? error.reqId
      : undefined;

  return {
    status: 'error',
    title: 'Cette page a rencontré un problème',
    subTitle: 'Une erreur inattendue est survenue. Recharger la page suffit généralement.',
    detail: error instanceof Error && error.message ? error.message : undefined,
    reqId,
  };
}
