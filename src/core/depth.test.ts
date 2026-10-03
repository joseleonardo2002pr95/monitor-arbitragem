import { describe, expect, it } from 'vitest';
import { buyWithUsdt, sellIntoBids } from './depth';
import { analyzeOpportunity, findBestSize, positionNow, spotSpotSignal } from './spotspot';
import type { BookQuote, Level, SpotSpotOp } from './types';

// Livro de compradores da Gate às 23:12:48 (02/10/2026), reconstruído das negociações públicas.
const gateBids: Level[] = [
  [0.000001362, 3475606],
  [0.000001288, 2871666],
  [0.000001282, 3900156],
  [0.000001281, 6245120],
  [0.00000128, 4541863],
];
const book = (bids: Level[], asks: Level[]): BookQuote => ({
  bid: bids[0][0],
  ask: asks[0][0],
  bidQty: bids[0][1],
  askQty: asks[0][1],
  bids,
  asks,
  ts: 0,
});

// Operação real #2 de José: 21.229.308 VON a 0,000001316 na LBank → Gate.
const op: SpotSpotOp = {
  id: 'von2',
  createdAt: 0,
  stage: 'observando',
  base: 'VON',
  quote: 'USDT',
  buyExchange: 'lbank',
  sellExchange: 'gate',
  plannedUsdt: 27.9378,
  buyFeeRate: 0.002,
  sellFeeRate: 0.002,
  buyFeeInCoin: true,
  withdrawFeeCoins: 152439.0243,
  targetNetPct: 2,
};
const lbank = book(
  [[0.000001306, 5e7]],
  [
    [0.000001316, 5e7],
    [0.00000132, 5e7],
  ],
);
const gate = book(gateBids, [
  [0.00000137, 1e7],
  [0.00000138, 1e7],
]);

describe('execução a mercado nível por nível', () => {
  it('vender 21.034.411 VON no livro da Gate dá $27,25 (igual à venda real)', () => {
    const e = sellIntoBids(gateBids, 21034411);
    expect(e.usdt).toBeCloseTo(27.246, 2);
    expect(e.levelsUsed).toBe(5);
    expect(e.complete).toBe(true);
    expect((1 - e.avgPrice / 0.000001362) * 100).toBeCloseTo(4.9, 1);
  });
  it('livro curto: marca como incompleto', () => {
    expect(sellIntoBids(gateBids, 5e7).complete).toBe(false);
  });
  it('comprar com USDT percorre os vendedores', () => {
    const e = buyWithUsdt(
      [
        [1, 10],
        [2, 10],
      ],
      30,
    );
    expect(e.coins).toBeCloseTo(20, 6);
    expect(e.avgPrice).toBeCloseTo(1.5, 6);
  });
});

describe('operação real VON #2 com profundidade', () => {
  it('pelo melhor preço parecia lucro, com profundidade é prejuízo', () => {
    const o = analyzeOpportunity(op, lbank, gate, 27.9378);
    expect(o.depthUsed).toBe(true);
    expect(o.topNetUsdt).toBeGreaterThan(0.5); // o que "parecia": ~+$0,65
    expect(o.netUsdt).toBeLessThan(-0.6); // o real: ~−$0,75
    const sig = spotSpotSignal(op, o, undefined);
    expect(sig.level).toBe('vermelho');
    expect(sig.title).toContain('Parece lucro');
  });
  it('com as moedas na Gate: vender tudo agora = −$0,75', () => {
    const held = { ...op, stage: 'na corretora de venda' as const, buy: { price: 0.000001316, qty: 21229308, time: 0 }, received: { qty: 21034411, time: 0 } };
    const p = positionNow(held, lbank, gate)!;
    expect(p.netSell).toBeCloseTo(-0.746, 2);
    expect(p.topNetSell).toBeGreaterThan(0.6);
    expect(spotSpotSignal(held, analyzeOpportunity(held, lbank, gate, 27.9), p).level).toBe('vermelho');
  });
  it('melhor tamanho: valor pequeno cabe no topo do livro da Gate', () => {
    const best = findBestSize(op, lbank, gate, 30);
    // No topo da Gate cabem ~3,48 mi VON ≈ $4,6; abaixo de ~$1 a taxa de saque come tudo.
    expect(best.bestUsdt).toBeLessThan(10);
    expect(best.bestUsdt).toBeGreaterThan(1);
  });
});
