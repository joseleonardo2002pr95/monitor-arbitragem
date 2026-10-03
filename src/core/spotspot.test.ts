import { describe, expect, it } from 'vitest';
import { analyzeOpportunity, coinsAfterBuy, positionNow, spotSpotSignal } from './spotspot';
import type { SpotSpotOp } from './types';

// Operação real de José (02/10/2026): VON comprado na LBank, transferido pela BSC, vendido na Gate.
const op: SpotSpotOp = {
  id: 'von',
  createdAt: 0,
  stage: 'na corretora de venda',
  base: 'VON',
  quote: 'USDT',
  buyExchange: 'lbank',
  sellExchange: 'gate',
  plannedUsdt: 8.98,
  buyFeeRate: 0.002,
  sellFeeRate: 0,
  buyFeeInCoin: true,
  withdrawFeeCoins: 152439.0243,
  targetNetPct: 1,
  buy: { price: 8.98 / 6814905, qty: 6814905, time: 0 },
};

describe('operação real VON (LBank → Gate)', () => {
  it('taxa de compra em moedas: sobra 6.801.275,19 VON', () => {
    expect(coinsAfterBuy(6814905, op)).toBeCloseTo(6801275.19, 1);
  });
  it('chegam 6.648.836,17 VON na Gate (igual ao "Creditado")', () => {
    const p = positionNow(op, { bid: 1, ask: 1, ts: 0 }, { bid: 1, ask: 1, ts: 0 })!;
    expect(p.coins).toBeCloseTo(6648836.17, 1);
  });
  it('vendendo por 9,19 USDT no total: lucro de +$0,21 (+2,34%)', () => {
    const price = 9.19 / 6648836.1657;
    const p = positionNow(op, { bid: 1, ask: 1, ts: 0 }, { bid: price, ask: price, ts: 0 })!;
    expect(p.netSell).toBeCloseTo(0.21, 3);
    expect(p.netSellPct).toBeCloseTo(2.34, 1);
    expect(spotSpotSignal(op, analyzeOpportunity(op, { bid: 1, ask: 1, ts: 0 }, { bid: price, ask: price, ts: 0 }, 9), p).level).toBe('verde');
  });
  it('taxa de saque ≈ $0,20 ao preço de compra', () => {
    expect(op.withdrawFeeCoins * op.buy!.price).toBeCloseTo(0.2, 2);
  });
});

describe('análise de oportunidade', () => {
  const a = { bid: 1.297e-6, ask: 1.307e-6, ts: 0, askQty: 261553 };
  const b = { bid: 1.362e-6, ask: 1.371e-6, ts: 0, bidQty: 2537917 };
  it('diferença bruta de ~4,2% (dados ao vivo 03/10)', () => {
    expect(analyzeOpportunity(op, a, b, 9).grossPct).toBeCloseTo(4.21, 1);
  });
  it('taxa fixa pesa menos com valor maior', () => {
    expect(analyzeOpportunity(op, a, b, 100).netPct).toBeGreaterThan(analyzeOpportunity(op, a, b, 9).netPct);
  });
  it('tamanho mínimo: no mínimo o lucro é zero', () => {
    const o = analyzeOpportunity(op, a, b, 9);
    expect(analyzeOpportunity(op, a, b, o.minSizeUsdt).netUsdt).toBeCloseTo(0, 6);
  });
  it('avisa quando o melhor preço do livro não tem quantidade suficiente', () => {
    const o = analyzeOpportunity(op, a, b, 9);
    expect(o.buyDepthCover).toBeLessThan(0.1); // só 261 mil VON no melhor ask
  });
  it('livro fino (só 3% cabe no melhor preço) → amarelo, não verde', () => {
    const o = analyzeOpportunity(op, a, b, 10);
    expect(spotSpotSignal({ ...op, stage: 'observando', buy: undefined, targetNetPct: 1 }, o, undefined).level).toBe('amarelo');
  });
  it('livro com quantidade suficiente → verde', () => {
    const o = analyzeOpportunity(op, { ...a, askQty: 1e9 }, { ...b, bidQty: 1e9 }, 10);
    expect(spotSpotSignal({ ...op, stage: 'observando', buy: undefined, targetNetPct: 1 }, o, undefined).level).toBe('verde');
  });
  it('sem diferença → vermelho "não compensa"', () => {
    const o = analyzeOpportunity({ ...op }, a, { ...b, bid: a.ask }, 9);
    expect(spotSpotSignal({ ...op, stage: 'observando', buy: undefined }, o, undefined).level).toBe('vermelho');
  });
  it('taxa de compra em USDT custa igual à taxa em moedas', () => {
    const inCoin = analyzeOpportunity(op, a, b, 100).netUsdt;
    const inUsdt = analyzeOpportunity({ ...op, buyFeeInCoin: false }, a, b, 100).netUsdt;
    expect(Math.abs(inCoin - inUsdt)).toBeLessThan(0.01);
  });
});
