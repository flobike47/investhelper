/**
 * Calcul du geste « tirer vers le bas pour fermer » d'un panneau du bas
 * (components/common/BottomSheet.tsx). Sans DOM ni React : testable seul.
 */

/** En deçà (px), le doigt a tremblé sur un tap : ce n'est pas un glissé. */
export const DRAG_SLOP = 10;

/** Fenêtre (ms) sur laquelle on mesure la vitesse au lâcher. */
const VELOCITY_WINDOW_MS = 100;

/** Décélération du défilement iOS : la projection imite un panneau « lancé ». */
const DECELERATION_RATE = 0.998;

export interface DragSample {
  /** Position verticale du doigt (px). */
  y: number;
  /** Horodatage (ms). */
  t: number;
}

/**
 * Vitesse (px/ms, positive vers le bas) sur les derniers instants du geste :
 * un doigt qui s'arrête avant de lâcher a une vitesse nulle, même s'il a
 * glissé vite au début.
 */
export function releaseVelocity(samples: DragSample[]): number {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

/** Position où le panneau s'arrêterait s'il continuait sur son élan. */
export function projectOffset(offset: number, velocity: number): number {
  return offset + (velocity * DECELERATION_RATE) / (1 - DECELERATION_RATE);
}

/**
 * Fermer si le panneau est descendu d'un quart de sa hauteur, ou si son élan
 * l'emmène au-delà de la moitié (petit glissé mais rapide). Un geste qui
 * remonte au lâcher ne ferme jamais : l'utilisateur a changé d'avis. Un
 * tremblé de quelques pixels non plus.
 */
export function shouldDismiss({ offset, velocity, height }: { offset: number; velocity: number; height: number }): boolean {
  if (offset < DRAG_SLOP || velocity < 0 || height <= 0) return false;
  return offset > height * 0.25 || projectOffset(offset, velocity) > height * 0.5;
}
