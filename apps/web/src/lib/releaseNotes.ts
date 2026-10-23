/**
 * Quelles notes de mise à jour montrer à l'ouverture de l'app. Fonctions
 * pures, `now` injecté : testables sans horloge ni stockage.
 */
import dayjs from 'dayjs';
import type { Release } from '@/constants/releases';

/** Au-delà, une note n'est plus « nouvelle » (stockage purgé par iOS, longue absence). */
export const MAX_AGE_DAYS = 60;
/** Au plus 3 notes d'un coup : au-delà, plus personne ne lit. */
export const MAX_SHOWN = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeenState {
  /** Dernière note marquée comme vue sur cet appareil, ou null. */
  lastSeenId: string | null;
  /** Date de création du compte (ISO) : un nouveau compte ne voit pas l'historique. */
  accountCreatedAt: string | null | undefined;
  now: Date;
}

/** Jour (YYYY-MM-DD) d'une date ISO, ou null si illisible. */
function isoDay(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Les notes à montrer, de la plus récente à la plus ancienne. */
export function unseenReleases(releases: Release[], { lastSeenId, accountCreatedAt, now }: SeenState): Release[] {
  const threshold = lastSeenId ?? (accountCreatedAt ? isoDay(accountCreatedAt) : null);
  // Seuil inconnu : dans le doute, on ne montre rien plutôt que tout l'historique
  if (!threshold) return [];
  const oldest = new Date(now.getTime() - MAX_AGE_DAYS * DAY_MS).toISOString().slice(0, 10);
  return releases.filter((r) => r.id > threshold && r.id >= oldest).slice(0, MAX_SHOWN);
}

/** Identifiant de la note la plus récente (les notes sont triées du plus récent au plus ancien). */
export function latestReleaseId(releases: Release[]): string | null {
  return releases[0]?.id ?? null;
}

/** Date d'une note pour l'affichage : l'identifiant sans son suffixe éventuel (.2). */
export function releaseDate(release: Release): string {
  return release.id.slice(0, 10);
}

/** Date d'une note en toutes lettres, dans la locale de l'app : « 21 octobre 2026 ». */
export function formatReleaseDate(release: Release): string {
  return dayjs(releaseDate(release)).format('D MMMM YYYY');
}
