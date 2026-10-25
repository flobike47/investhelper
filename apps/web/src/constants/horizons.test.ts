// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HORIZON_LIST, analogBarsFor, type HorizonConfig } from './horizons';

/** Nombre de bougies réellement demandé à Twelve Data (même calcul que le BFF, providers/twelvedata.ts). */
function barsRequested(h: HorizonConfig): number {
  return h.candleResolution === 'D'
    ? h.lookbackDays
    : h.candleResolution === 'W'
      ? Math.ceil(h.lookbackDays / 7)
      : Math.ceil(h.lookbackDays / 30);
}

describe('HORIZONS', () => {
  it.each(HORIZON_LIST.map((h) => [h.id, h] as const))(
    'horizon %s : assez de bougies pour la moyenne longue',
    (_id, h) => {
      expect(barsRequested(h)).toBeGreaterThanOrEqual(h.smaLong);
    },
  );

  it.each(HORIZON_LIST.map((h) => [h.id, h] as const))(
    "horizon %s : assez de bougies pour mesurer l'analogue historique",
    (_id, h) => {
      // RSI (période + 1 bougies) + au moins 2 fenêtres complètes d'analogue.
      expect(barsRequested(h)).toBeGreaterThanOrEqual(h.rsiPeriod + 1 + 2 * analogBarsFor(h.id));
    },
  );
});
