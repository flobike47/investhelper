import { useEffect, useRef } from 'react';
import { releaseVelocity, shouldDismiss, type DragSample } from '@/lib/sheetGesture';

/** Durée de la sortie après un glissé validé (ms). */
const DISMISS_MS = 220;
/** Retour en place : ressort court, sans rebond (courbe des feuilles iOS). */
const SNAP_BACK = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';

/** Le doigt est-il posé dans une zone déjà défilée ? Alors il fait défiler. */
function insideScrolled(target: EventTarget | null, sheet: HTMLElement): boolean {
  for (let node = target instanceof Element ? target : null; node && node !== sheet; node = node.parentElement) {
    if (node.scrollTop > 0) return true;
  }
  return false;
}

/**
 * « Tirer vers le bas pour fermer » sur un panneau du bas. Le panneau suit
 * le doigt 1:1, puis se ferme ou revient en place selon la distance et
 * l'élan au lâcher (lib/sheetGesture.ts).
 *
 * Écouteurs touch et non Pointer Events : le navigateur envoie
 * `pointercancel` dès qu'il commence à faire défiler le corps, alors qu'on
 * doit justement lui reprendre la main quand le corps est tout en haut.
 * `touchmove` n'est pas passif pour pouvoir annuler ce défilement, mais
 * n'appelle `preventDefault` que pendant un glissé du panneau.
 */
export function useSheetDrag(
  sheet: HTMLElement | null,
  { open, onDismiss, reducedMotion }: { open: boolean; onDismiss: () => void; reducedMotion: boolean },
) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!sheet || !open) return;
    // Un panneau gardé monté (fermé puis rouvert) repart de sa place.
    sheet.style.transform = '';
    sheet.style.transition = '';
    const mask = sheet.closest('.ant-drawer')?.querySelector<HTMLElement>('.ant-drawer-mask') ?? null;
    if (mask) mask.style.opacity = '';

    // pending : doigt posé, direction pas encore connue ; drag : le panneau
    // suit le doigt ; scroll : le geste appartient au défilement du corps.
    let mode: null | 'pending' | 'drag' | 'scroll' = null;
    let startX = 0;
    let startY = 0;
    let offset = 0;
    let height = 0;
    let samples: DragSample[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const moveTo = (y: number, transition: string) => {
      sheet.style.transition = transition;
      sheet.style.transform = y > 0 ? `translateY(${y}px)` : '';
      if (mask) {
        mask.style.transition = transition.replace('transform', 'opacity');
        mask.style.opacity = y > 0 ? String(Math.max(0, 1 - y / height)) : '';
      }
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        mode = null;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      offset = 0;
      // jsdom (et un panneau pas encore mesuré) : hauteur nulle → l'écran.
      height = sheet.offsetHeight || window.innerHeight;
      samples = [{ y: t.clientY, t: e.timeStamp }];
      mode = insideScrolled(e.target, sheet) ? 'scroll' : 'pending';
    };

    const onMove = (e: TouchEvent) => {
      if (mode === null || mode === 'scroll') return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      if (mode === 'pending') {
        const dx = t.clientX - startX;
        if (dy === 0 && dx === 0) return;
        // Décidé dès le premier mouvement : si on attendait, iOS aurait déjà
        // lancé le défilement et ne laisserait plus l'annuler.
        mode = dy > 0 && dy >= Math.abs(dx) ? 'drag' : 'scroll';
        if (mode === 'scroll') return;
      }
      if (e.cancelable) e.preventDefault();
      offset = Math.max(0, dy);
      samples.push({ y: t.clientY, t: e.timeStamp });
      if (samples.length > 20) samples = samples.slice(-20);
      moveTo(offset, 'none');
    };

    const onEnd = () => {
      if (mode !== 'drag') {
        mode = null;
        return;
      }
      mode = null;
      if (shouldDismiss({ offset, velocity: releaseVelocity(samples), height })) {
        if (reducedMotion) {
          onDismissRef.current();
          return;
        }
        moveTo(height, `transform ${DISMISS_MS}ms ease-out`);
        timer = setTimeout(() => onDismissRef.current(), DISMISS_MS);
      } else {
        moveTo(0, reducedMotion ? 'none' : SNAP_BACK);
      }
    };

    const onCancel = () => {
      if (mode === 'drag') moveTo(0, reducedMotion ? 'none' : SNAP_BACK);
      mode = null;
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onCancel);
    return () => {
      clearTimeout(timer);
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onCancel);
    };
  }, [sheet, open, reducedMotion]);
}
