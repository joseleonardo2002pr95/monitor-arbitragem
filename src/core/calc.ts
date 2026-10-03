import { sellIntoBids } from './depth';
import type { BookQuote, Fill, FundingEvent, Operation } from './types';

export const totalQty = (fills: Fill[]) => fills.reduce((s, f) => s + f.qty, 0);
export const totalCost = (fills: Fill[]) => fills.reduce((s, f) => s + f.price * f.qty, 0);

/** Preço médio ponderado pela quantidade. */
export function avgPrice(fills: Fill[]): number {
  const q = totalQty(fills);
  return q > 0 ? totalCost(fills) / q : 0;
}

/** Diferença percentual do futuro sobre o spot. */
export const spreadPct = (spot: number, fut: number) => (spot > 0 ? ((fut - spot) / spot) * 100 : 0);

/**
 * Funding recebido pelo vendido (short). Taxa positiva = short recebe.
 * Para cada evento, usa a quantidade vendida que já estava aberta naquele momento.
 */
export function fundingFromHistory(events: FundingEvent[], futFills: Fill[], fallbackPrice: number): number {
  let sum = 0;
  for (const ev of events) {
    const openQty = futFills.filter((f) => f.time <= ev.time).reduce((s, f) => s + f.qty, 0);
    if (openQty <= 0) continue;
    sum += ev.rate * openQty * (ev.markPrice ?? fallbackPrice);
  }
  return sum;
}

/**
 * Preço de liquidação ESTIMADO de um short isolado (contrato linear em USDT).
 * liq = entrada × (1 + 1/alavancagem) / (1 + margem de manutenção)
 * A corretora usa faixas de risco; o valor real pode ser diferente.
 */
export function estimateShortLiqPrice(entry: number, leverage: number, mmr: number): number {
  if (entry <= 0 || leverage <= 0) return 0;
  return (entry * (1 + 1 / leverage)) / (1 + mmr);
}

export interface Snapshot {
  qtySpot: number;
  qtyFut: number;
  avgSpot: number;
  avgFut: number;
  notional: number; // USDT investidos no spot
  entrySpreadPct: number;
  /** Spread que você trava se FECHAR agora: vende spot no bid, recompra futuro no ask. */
  exitSpreadPct: number;
  /** Spread que você pega se ABRIR/AUMENTAR agora: compra spot no ask, vende futuro no bid. */
  openSpreadPct: number;
  spotPnl: number; // bruto
  futPnl: number; // bruto
  entryFees: number;
  exitFees: number;
  funding: number;
  netPnl: number;
  netPnlPct: number; // sobre o notional
  /** Spread de saída em que o resultado fica zero (aproximado). */
  breakevenExitSpreadPct: number;
  liqPrice: number;
  liqEstimated: boolean;
  /** Quanto o preço do futuro precisa SUBIR (%) para liquidar. */
  liqDistancePct: number;
  /** Quantidade que ficou desequilibrada entre as pontas. */
  qtyMismatch: number;
  /** Largura do livro (ask − bid) em %. Livro largo = pouca liquidez. */
  spotBookPct: number;
  futBookPct: number;
  /** Venda do spot a mercado com a quantidade inteira (profundidade do livro). */
  spotSellAvg: number;
  spotSellLevels: number;
  spotSellComplete: boolean;
  /** Usou vários níveis do livro do spot (cálculo real). */
  spotDepthUsed: boolean;
  /** Spread de saída com o preço MÉDIO real de venda do spot. */
  realExitSpreadPct: number;
}

export function computeSnapshot(
  op: Operation,
  spot: BookQuote,
  fut: BookQuote,
  funding: number,
  markPrice?: number,
): Snapshot {
  const qtySpot = totalQty(op.spotFills);
  const qtyFut = totalQty(op.futFills);
  const avgSpot = avgPrice(op.spotFills);
  const avgFut = avgPrice(op.futFills);
  const notional = avgSpot * qtySpot;

  // Ponta spot: com profundidade, usa o preço médio real de vender TUDO a mercado.
  const spotDepthUsed = (spot.bids?.length ?? 0) > 1;
  const spotSell = spotDepthUsed ? sellIntoBids(spot.bids!, qtySpot) : undefined;
  const spotSellAvg = spotSell ? spotSell.avgPrice : spot.bid;
  const spotPnl = (spotSellAvg - avgSpot) * qtySpot;
  const futPnl = (avgFut - fut.ask) * qtyFut;
  const entryFees = totalCost(op.spotFills) * op.spotFeeRate + totalCost(op.futFills) * op.futFeeRate;
  const exitFees = spotSellAvg * qtySpot * op.spotFeeRate + fut.ask * qtyFut * op.futFeeRate;
  const netPnl = spotPnl + futPnl - entryFees - exitFees + funding;

  const entrySpreadPct = spreadPct(avgSpot, avgFut);
  const costPct = notional > 0 ? ((entryFees + exitFees - funding) / notional) * 100 : 0;

  const liqEstimated = !(op.liqPriceManual && op.liqPriceManual > 0);
  const liqPrice = liqEstimated
    ? estimateShortLiqPrice(avgFut, op.leverage, op.maintMarginRate)
    : (op.liqPriceManual as number);
  const ref = markPrice ?? fut.ask;
  const liqDistancePct = ref > 0 && liqPrice > 0 ? ((liqPrice - ref) / ref) * 100 : 0;

  return {
    qtySpot,
    qtyFut,
    avgSpot,
    avgFut,
    notional,
    entrySpreadPct,
    exitSpreadPct: spreadPct(spot.bid, fut.ask),
    openSpreadPct: spreadPct(spot.ask, fut.bid),
    spotPnl,
    futPnl,
    entryFees,
    exitFees,
    funding,
    netPnl,
    netPnlPct: notional > 0 ? (netPnl / notional) * 100 : 0,
    breakevenExitSpreadPct: entrySpreadPct - costPct,
    liqPrice,
    liqEstimated,
    liqDistancePct,
    qtyMismatch: qtySpot - qtyFut,
    spotBookPct: spreadPct(spot.bid, spot.ask),
    futBookPct: spreadPct(fut.bid, fut.ask),
    spotSellAvg,
    spotSellLevels: spotSell?.levelsUsed ?? 1,
    spotSellComplete: spotSell?.complete ?? true,
    spotDepthUsed,
    realExitSpreadPct: spreadPct(spotSellAvg, fut.ask),
  };
}

export interface DcaResult {
  newAvgSpot: number;
  newAvgFut: number;
  newQty: number;
  newEntrySpreadPct: number;
  newNotional: number;
  newLiqPrice: number;
  /** Preço de recompra do futuro para sair no spread-alvo, com o spot no bid atual. */
  futExitLimitPrice: number;
}

/** Simula comprar `addQty` no spot (ask) e vender `addQty` no futuro (bid) agora. */
export function simulateDca(op: Operation, spot: BookQuote, fut: BookQuote, addQty: number): DcaResult {
  const now = Date.now();
  const spotFills = [...op.spotFills, { price: spot.ask, qty: addQty, time: now }];
  const futFills = [...op.futFills, { price: fut.bid, qty: addQty, time: now }];
  const newAvgSpot = avgPrice(spotFills);
  const newAvgFut = avgPrice(futFills);
  return {
    newAvgSpot,
    newAvgFut,
    newQty: totalQty(spotFills),
    newEntrySpreadPct: spreadPct(newAvgSpot, newAvgFut),
    newNotional: newAvgSpot * totalQty(spotFills),
    newLiqPrice: estimateShortLiqPrice(newAvgFut, op.leverage, op.maintMarginRate),
    futExitLimitPrice: futExitLimitPrice(spot.bid, op.targetExitSpreadPct),
  };
}

/** Preço da ordem limite de recompra no futuro que trava o spread-alvo, dado o spot. */
export const futExitLimitPrice = (spotBid: number, targetSpreadPct: number) => spotBid * (1 + targetSpreadPct / 100);
