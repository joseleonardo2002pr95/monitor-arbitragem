import { describe, expect, it } from 'vitest';
import { avgPrice, computeSnapshot, estimateShortLiqPrice, fundingFromHistory, simulateDca, spreadPct } from './calc';
import { computeSignal } from './signal';
import type { Operation } from './types';

// Operação real de José (02/10/2026): PUMPBTC, spot Gate x short Binance.
const base: Operation = {
  id: 't',
  createdAt: 0,
  status: 'aberta',
  base: 'PUMPBTC',
  quote: 'USDT',
  spotExchange: 'gate',
  futExchange: 'binance',
  spotFills: [{ price: 0.008311, qty: 2286, time: 1000 }],
  futFills: [{ price: 0.00835, qty: 2286, time: 1000 }],
  leverage: 2,
  spotFeeRate: 0,
  futFeeRate: 0,
  maintMarginRate: 0.01,
  targetExitSpreadPct: 0.1,
  widenAlertPp: 0.5,
  maxDcaCount: 2,
};

describe('cálculos básicos', () => {
  it('preço médio ponderado', () => {
    expect(avgPrice([{ price: 10, qty: 1, time: 0 }, { price: 20, qty: 3, time: 0 }])).toBe(17.5);
  });
  it('spread de entrada da operação real ≈ 0,47%', () => {
    expect(spreadPct(0.008311, 0.00835)).toBeCloseTo(0.469, 2);
  });
});

describe('operação real PUMPBTC', () => {
  const snap = computeSnapshot(base, { bid: 0.008228, ask: 0.008229, ts: 0 }, { bid: 0.008309, ask: 0.00831, ts: 0 }, 0);
  it('PnL de cada ponta bate com o resultado real', () => {
    expect(snap.spotPnl).toBeCloseTo(-0.1897, 3);
    expect(snap.futPnl).toBeCloseTo(0.0914, 3);
    expect(snap.netPnl).toBeCloseTo(-0.0983, 3);
  });
  it('spread de saída ≈ 0,99% (alargou)', () => {
    expect(snap.exitSpreadPct).toBeCloseTo(0.997, 2);
  });
  it('sem taxas e sem funding, o empate é sair no mesmo spread da entrada', () => {
    expect(snap.breakevenExitSpreadPct).toBeCloseTo(snap.entrySpreadPct, 6);
  });
  it('alargou 0,53 p.p. → sinal não fica verde', () => {
    const sig = computeSignal(base, snap, 0.004, 0);
    expect(sig.level).toBe('azul');
  });
  it('funding negativo + spread pior → vermelho', () => {
    expect(computeSignal(base, snap, -0.0001, 0).level).toBe('vermelho');
  });
  it('livro largo (caso real ao vivo 02/10): saída alargou mas NÃO sugere aumentar', () => {
    const s = computeSnapshot(base, { bid: 0.008304, ask: 0.008418, ts: 0 }, { bid: 0.00846, ask: 0.00848, ts: 0 }, 0.15);
    const sig = computeSignal(base, s, 0.0034, 0);
    expect(s.spotBookPct).toBeGreaterThan(1);
    expect(sig.level).toBe('amarelo');
    expect(sig.title).toContain('saída alargou');
    expect(sig.reasons.join(' ')).toContain('Livro largo');
  });
  it('limite de aumentos atingido → amarelo (não aumentar)', () => {
    expect(computeSignal(base, snap, 0.004, 2).level).toBe('amarelo');
  });
});

describe('taxas e funding', () => {
  const op = { ...base, spotFeeRate: 0.001, futFeeRate: 0.0005 };
  it('taxas reduzem o resultado e sobem a exigência de saída', () => {
    const s = computeSnapshot(op, { bid: 0.008311, ask: 0.008312, ts: 0 }, { bid: 0.00835, ask: 0.00835, ts: 0 }, 0);
    expect(s.netPnl).toBeLessThan(0);
    expect(s.breakevenExitSpreadPct).toBeLessThan(s.entrySpreadPct);
  });
  it('funding positivo é somado só para a quantidade já aberta', () => {
    const fills = [
      { price: 1, qty: 100, time: 1000 },
      { price: 1, qty: 100, time: 5000 },
    ];
    const f = fundingFromHistory(
      [
        { time: 2000, rate: 0.001, markPrice: 1 },
        { time: 6000, rate: 0.001, markPrice: 1 },
      ],
      fills,
      1,
    );
    expect(f).toBeCloseTo(0.1 + 0.2, 6);
  });
  it('funding recebido melhora o empate', () => {
    const s = computeSnapshot(base, { bid: 0.0083, ask: 0.0083, ts: 0 }, { bid: 0.0083, ask: 0.0083, ts: 0 }, 0.5);
    expect(s.breakevenExitSpreadPct).toBeGreaterThan(s.entrySpreadPct);
  });
});

describe('liquidação e DCA', () => {
  it('short 2x isolado liquida ~48% acima com mmr 1%', () => {
    expect(estimateShortLiqPrice(100, 2, 0.01)).toBeCloseTo(148.51, 1);
  });
  it('liquidação digitada pelo usuário tem prioridade', () => {
    const s = computeSnapshot({ ...base, liqPriceManual: 0.0095 }, { bid: 0.0083, ask: 0.0083, ts: 0 }, { bid: 0.0083, ask: 0.0083, ts: 0 }, 0);
    expect(s.liqPrice).toBe(0.0095);
    expect(s.liqEstimated).toBe(false);
  });
  it('aumentar a mão com spread maior melhora o spread médio', () => {
    const r = simulateDca(base, { bid: 0.0082, ask: 0.0082, ts: 0 }, { bid: 0.00829, ask: 0.00829, ts: 0 }, 2286);
    expect(r.newQty).toBe(4572);
    expect(r.newEntrySpreadPct).toBeGreaterThan(spreadPct(0.008311, 0.00835));
  });
});
