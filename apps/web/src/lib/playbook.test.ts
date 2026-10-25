// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildPlaybook } from './playbook';

const empty = { entry: null, stop: null, target: null, smaShort: null, smaLong: null };

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

  it('reprend le stop et l’objectif du plan de risque, sans pourcentage fixe', () => {
    const p = buildPlaybook({ horizon: 'short', ...empty, entry: 98, stop: 94, target: 106, smaShort: 98 });
    expect(p.entryWindow).toContain('98,00');
    expect(p.exitConditions.join(' ')).toContain('94,00');
    expect(p.exitConditions.join(' ')).toContain('106,00');
    expect(p.exitConditions.join(' ')).not.toMatch(/15\s?%/);
  });

  it('présente la cassure de la SMA200 comme une réévaluation, pas comme un stop chiffré', () => {
    const p = buildPlaybook({ horizon: 'medium', ...empty, smaLong: 150 });
    const sma200 = p.exitConditions.find((c) => c.includes('SMA200'));
    expect(sma200).toMatch(/^Réévaluer la tendance/);
  });
});
