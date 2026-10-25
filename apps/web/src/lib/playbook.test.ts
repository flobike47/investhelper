// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildPlaybook } from './playbook';

const empty = { currentPrice: null, entry: null, exit: null, smaShort: null, smaLong: null, targetMean: null };

describe('buildPlaybook', () => {
  it.each(['short', 'medium', 'long'] as const)('donne une durée de détention et un risque pour l’horizon %s', (horizon) => {
    const p = buildPlaybook({ horizon, ...empty });
    expect(p.holdingPeriod).not.toBe('');
    expect(p.risk).not.toBe('');
    expect(p.exitConditions.length).toBeGreaterThan(0);
  });

  it('se rabat sur des conditions sans chiffre quand les niveaux manquent', () => {
    const p = buildPlaybook({ horizon: 'short', ...empty });
    expect(p.entryWindow).toBe("Attendre un repli technique avant d'entrer.");
    expect(p.exitConditions.join(' ')).not.toMatch(/€/);
  });

  it("chiffre l'entrée et le stop à partir de la moyenne courte", () => {
    const p = buildPlaybook({ horizon: 'short', ...empty, currentPrice: 100, entry: 98, smaShort: 98 });
    expect(p.entryWindow).toContain('98,00');
    expect(p.exitConditions.join(' ')).toContain('95,06'); // 98 × 0,97
  });
});
