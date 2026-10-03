import { spreadPct } from './calc';
import { buyWithUsdt, sellIntoBids, type Execution } from './depth';
import type { BookQuote, Level, SpotSpotOp } from './types';

/*
 * Spot x Spot: compra na corretora A, transfere a moeda e vende na corretora B.
 * Custos: taxa de compra (em USDT ou em moedas), taxa de saque FIXA em moedas e taxa de venda.
 * Não há proteção: durante a transferência você fica exposto ao preço.
 *
 * PROFUNDIDADE: quando o livro tem vários níveis, os cálculos usam o PREÇO MÉDIO REAL de uma ordem a mercado
 * (que "come" nível por nível). Caso real 02/10: o melhor bid da Gate cabia 16% das moedas e a venda saiu 4,9% pior.
 */

type Fees = Pick<SpotSpotOp, 'buyFeeRate' | 'sellFeeRate' | 'buyFeeInCoin' | 'withdrawFeeCoins'>;

/** Moedas que você fica depois de comprar `qty` (se a taxa sai em moedas, recebe menos). */
export const coinsAfterBuy = (qty: number, f: Fees) => (f.buyFeeInCoin ? qty * (1 - f.buyFeeRate) : qty);

/** USDT que saiu do bolso para comprar `qty` a `price`. */
export const buyCost = (price: number, qty: number, f: Fees) => price * qty * (f.buyFeeInCoin ? 1 : 1 + f.buyFeeRate);

/** USDT líquido ao vender `coins` a `price`. */
export const sellProceeds = (price: number, coins: number, f: Fees) => Math.max(0, coins) * price * (1 - f.sellFeeRate);

/** Livro com profundidade ou, se não houver, só o melhor nível. */
const asksOf = (q: BookQuote): Level[] => (q.asks?.length ? q.asks : [[q.ask, q.askQty ?? Infinity]]);
const bidsOf = (q: BookQuote): Level[] => (q.bids?.length ? q.bids : [[q.bid, q.bidQty ?? Infinity]]);

export interface Opportunity {
  /** Diferença bruta: vender no bid de B vs comprar no ask de A (melhor preço). */
  grossPct: number;
  /** Mesmo cálculo no sentido contrário (comprar em B, vender em A). */
  reversePct: number;
  /** Diferença usando os preços MÉDIOS reais para o seu tamanho. */
  realGrossPct: number;
  sizeUsdt: number;
  qtyBuy: number;
  coinsArriving: number;
  proceeds: number;
  /** Resultado REAL (com profundidade do livro). */
  netUsdt: number;
  netPct: number;
  /** Resultado se tudo saísse no melhor preço (o que parecia antes). */
  topNetUsdt: number;
  topNetPct: number;
  buy: Execution;
  sell: Execution;
  /** Quanto o preço médio piora em relação ao melhor preço (%). */
  buySlipPct: number;
  sellSlipPct: number;
  /** Os dois livros têm vários níveis (cálculo real). false = só o melhor preço. */
  depthUsed: boolean;
  /** Custo da taxa de saque em USDT (ao preço de venda). */
  withdrawFeeUsdt: number;
  /** Tamanho mínimo da operação para a taxa fixa de saque não comer o lucro (pelo melhor preço). Infinity = nunca compensa. */
  minSizeUsdt: number;
  /** Fração do tamanho desejado que existe no melhor preço do livro (1 = cabe tudo). */
  buyDepthCover?: number;
  sellDepthCover?: number;
  buyBookPct: number;
  sellBookPct: number;
}

/** Analisa uma entrada AGORA de `sizeUsdt`: compra a mercado em A, vende a mercado em B. */
export function analyzeOpportunity(f: Fees, a: BookQuote, b: BookQuote, sizeUsdt: number): Opportunity {
  // Taxa em USDT: parte do valor paga a taxa, o resto compra moedas.
  const spend = f.buyFeeInCoin ? sizeUsdt : sizeUsdt / (1 + f.buyFeeRate);
  const buy = buyWithUsdt(asksOf(a), spend);
  const qtyBuy = buy.coins;
  const coinsArriving = coinsAfterBuy(qtyBuy, f) - f.withdrawFeeCoins;
  const sell = sellIntoBids(bidsOf(b), Math.max(0, coinsArriving));
  const proceeds = sell.usdt * (1 - f.sellFeeRate);
  const netUsdt = proceeds - sizeUsdt;

  // Pelo melhor preço (como era antes): net(S) = S·k − fixo  →  S mínimo = fixo / k
  const coinsPerUsdt = f.buyFeeInCoin ? (1 - f.buyFeeRate) / a.ask : 1 / (a.ask * (1 + f.buyFeeRate));
  const k = coinsPerUsdt * b.bid * (1 - f.sellFeeRate) - 1;
  const fixed = f.withdrawFeeCoins * b.bid * (1 - f.sellFeeRate);
  const topNetUsdt = sizeUsdt * k - fixed;

  const topQty = spend / a.ask;
  return {
    grossPct: spreadPct(a.ask, b.bid),
    reversePct: spreadPct(b.ask, a.bid),
    realGrossPct: spreadPct(buy.avgPrice, sell.avgPrice),
    sizeUsdt,
    qtyBuy,
    coinsArriving,
    proceeds,
    netUsdt,
    netPct: sizeUsdt > 0 ? (netUsdt / sizeUsdt) * 100 : 0,
    topNetUsdt,
    topNetPct: sizeUsdt > 0 ? (topNetUsdt / sizeUsdt) * 100 : 0,
    buy,
    sell,
    buySlipPct: a.ask > 0 ? (buy.avgPrice / a.ask - 1) * 100 : 0,
    sellSlipPct: b.bid > 0 ? (1 - sell.avgPrice / b.bid) * 100 : 0,
    // Importa o lado usado: vendedores de A (compra) e compradores de B (venda).
    depthUsed: (a.asks?.length ?? 0) > 1 && (b.bids?.length ?? 0) > 1,
    withdrawFeeUsdt: f.withdrawFeeCoins * b.bid,
    minSizeUsdt: k > 0 ? fixed / k : Infinity,
    buyDepthCover: a.askQty ? Math.min(1, a.askQty / topQty) : undefined,
    sellDepthCover: b.bidQty ? Math.min(1, b.bidQty / Math.max(coinsArriving, 1e-12)) : undefined,
    buyBookPct: spreadPct(a.bid, a.ask),
    sellBookPct: spreadPct(b.bid, b.ask),
  };
}

export interface BestSize {
  /** Valor (USDT) que dá o MAIOR lucro em dólar agora. */
  bestUsdt: number;
  bestNetUsdt: number;
  bestNetPct: number;
  /** Faixa de valores com lucro > 0 (aproximada). */
  minProfitUsdt?: number;
  maxProfitUsdt?: number;
}

/**
 * Procura o melhor tamanho: valores pequenos sofrem com a taxa fixa de saque,
 * valores grandes sofrem com a profundidade do livro. O ponto ótimo fica no meio.
 */
export function findBestSize(f: Fees, a: BookQuote, b: BookQuote, maxUsdt: number): BestSize {
  const N = 60;
  let best = { bestUsdt: 0, bestNetUsdt: -Infinity, bestNetPct: 0 };
  let minP: number | undefined;
  let maxP: number | undefined;
  for (let i = 0; i <= N; i++) {
    const s = Math.exp(Math.log(1) + ((Math.log(Math.max(maxUsdt, 2)) - Math.log(1)) * i) / N);
    const o = analyzeOpportunity(f, a, b, s);
    if (!o.buy.complete || !o.sell.complete) continue; // além do livro carregado, não dá para afirmar
    if (o.netUsdt > best.bestNetUsdt) best = { bestUsdt: s, bestNetUsdt: o.netUsdt, bestNetPct: o.netPct };
    if (o.netUsdt > 0) {
      minP ??= s;
      maxP = s;
    }
  }
  return { ...best, minProfitUsdt: minP, maxProfitUsdt: maxP };
}

export interface Position {
  cost: number;
  /** Moedas que tem (ou vai ter) na corretora de venda. */
  coins: number;
  /** As moedas já chegaram e o número é o real (não estimado). */
  coinsConfirmed: boolean;
  /** Se vender TUDO a mercado agora na corretora B (com profundidade). */
  sell: Execution;
  proceedsSell: number;
  netSell: number;
  netSellPct: number;
  /** Se tudo saísse no melhor preço (o que "parece"). */
  topNetSell: number;
  /** Se desistir e vender de volta na corretora A (com profundidade). */
  netAbort: number;
  /** Preço MÉDIO de venda em B que zera o resultado. */
  breakevenSellPrice: number;
  /** Preço médio de venda em B para atingir o alvo. */
  targetSellPrice: number;
  /** Quanto o preço médio real ainda pode cair (%) antes de virar prejuízo. Negativo = já está abaixo. */
  cushionPct: number;
  /** Moedas que cabem no melhor preço de B. */
  coinsAtBestBid?: number;
}

export function positionNow(op: SpotSpotOp, a: BookQuote, b: BookQuote): Position | undefined {
  if (!op.buy) return undefined;
  const cost = buyCost(op.buy.price, op.buy.qty, op);
  const held = coinsAfterBuy(op.buy.qty, op);
  const coins = op.received ? op.received.qty : held - op.withdrawFeeCoins;
  const sell = sellIntoBids(bidsOf(b), Math.max(0, coins));
  const proceedsSell = sell.usdt * (1 - op.sellFeeRate);
  const netSell = proceedsSell - cost;
  const per = coins * (1 - op.sellFeeRate);
  const breakevenSellPrice = per > 0 ? cost / per : 0;
  const abort = sellIntoBids(bidsOf(a), held);
  return {
    cost,
    coins,
    coinsConfirmed: !!op.received,
    sell,
    proceedsSell,
    netSell,
    netSellPct: cost > 0 ? (netSell / cost) * 100 : 0,
    topNetSell: sellProceeds(b.bid, coins, op) - cost,
    netAbort: abort.usdt * (1 - op.buyFeeRate) - cost,
    breakevenSellPrice,
    targetSellPrice: breakevenSellPrice * (1 + op.targetNetPct / 100),
    cushionPct: sell.avgPrice > 0 ? ((sell.avgPrice - breakevenSellPrice) / sell.avgPrice) * 100 : 0,
    coinsAtBestBid: b.bidQty,
  };
}

// ---------------- Sinal ----------------

export type SSLevel = 'verde' | 'amarelo' | 'azul' | 'vermelho';
export interface SSSignal {
  level: SSLevel;
  title: string;
  message: string;
  reasons: string[];
}

const pct = (v: number, d = 2) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const usd = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const WIDE_BOOK = 0.5;
const fmt2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function spotSpotSignal(op: SpotSpotOp, o: Opportunity, p: Position | undefined): SSSignal {
  const reasons: string[] = [];
  if (o.buyBookPct > WIDE_BOOK || o.sellBookPct > WIDE_BOOK)
    reasons.push(`Livro largo (compra ${pct(o.buyBookPct)}, venda ${pct(o.sellBookPct)}): pouca liquidez, prefira ordem limite.`);

  // ---- Antes de comprar: é oportunidade?
  if (op.stage === 'observando' || !p) {
    if (o.buyDepthCover !== undefined && o.buyDepthCover < 1)
      reasons.push(`No melhor preço de compra só cabem ${pct(o.buyDepthCover * 100, 0)} do seu tamanho. O resto sai mais caro.`);
    if (o.sellDepthCover !== undefined && o.sellDepthCover < 1)
      reasons.push(`No melhor preço de venda só cabem ${pct(o.sellDepthCover * 100, 0)} das suas moedas. O resto sai mais barato.`);
    if (isFinite(o.minSizeUsdt) && o.minSizeUsdt > o.sizeUsdt)
      reasons.push(`Com essa diferença, a taxa fixa de saque só compensa acima de ~$${o.minSizeUsdt.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}.`);
    reasons.push('Antes de comprar: confira se o SAQUE na corretora de compra e o DEPÓSITO na de venda estão abertos, na mesma rede.');
    reasons.push('Durante a transferência você fica sem proteção: se o preço cair, o lucro some.');

    // Com profundidade: o resultado mostrado já é o REAL para o seu tamanho.
    if (o.depthUsed) {
      if (o.buy.levelsUsed > 1 || o.sell.levelsUsed > 1)
        reasons.unshift(
          `Para $${fmt2(o.sizeUsdt)}, a compra a mercado sai ${pct(o.buySlipPct)} acima do melhor preço (${o.buy.levelsUsed} níveis) e a venda ${pct(o.sellSlipPct)} abaixo (${o.sell.levelsUsed} níveis).`,
        );
      const incomplete = !o.buy.complete || !o.sell.complete;
      if (incomplete) reasons.unshift('O livro carregado não tem moedas suficientes para o seu tamanho: o resultado real é PIOR que o mostrado.');

      if (o.topNetUsdt > 0 && o.netUsdt <= 0)
        return {
          level: 'vermelho',
          title: 'Parece lucro, mas o livro não aguenta',
          message: `Pelo melhor preço daria ${usd(o.topNetUsdt)}, mas vendendo a sua quantidade inteira o resultado real é ${usd(o.netUsdt)} (${pct(o.netPct)}). Reduza o valor ou use ordens limite.`,
          reasons,
        };
      if (o.netPct >= op.targetNetPct && !incomplete)
        return {
          level: 'verde',
          title: 'Oportunidade: a diferença paga as taxas',
          message: `Com $${fmt2(o.sizeUsdt)}: diferença real ${pct(o.realGrossPct)}, lucro líquido estimado ${usd(o.netUsdt)} (${pct(o.netPct)}), já com a profundidade do livro.`,
          reasons,
        };
      if (o.netUsdt > 0)
        return {
          level: 'amarelo',
          title: incomplete ? 'Lucro incerto: livro curto' : 'Lucro pequeno: abaixo do seu alvo',
          message: `Líquido estimado ${usd(o.netUsdt)} (${pct(o.netPct)}); o seu alvo é ${pct(op.targetNetPct)}.`,
          reasons,
        };
      return {
        level: 'vermelho',
        title: 'Não compensa agora',
        message: `Diferença no melhor preço ${pct(o.grossPct)}, mas com taxas e profundidade o resultado seria ${usd(o.netUsdt)} (${pct(o.netPct)}).`,
        reasons,
      };
    }

    // Sem profundidade (só o melhor preço): ser conservador quando o topo do livro é pequeno.
    const thin = (o.buyDepthCover ?? 1) < 0.5 || (o.sellDepthCover ?? 1) < 0.5;
    if (o.netPct >= op.targetNetPct && thin)
      return {
        level: 'amarelo',
        title: 'Diferença boa, mas o livro é fino',
        message: `Pelo melhor preço daria ${usd(o.netUsdt)} (${pct(o.netPct)}), mas a maior parte do seu tamanho não cabe nele. Use ordens limite ou reduza o valor.`,
        reasons,
      };
    if (o.netPct >= op.targetNetPct)
      return {
        level: 'verde',
        title: 'Oportunidade: a diferença paga as taxas',
        message: `Com $${fmt2(o.sizeUsdt)}: diferença bruta ${pct(o.grossPct)}, lucro líquido estimado ${usd(o.netUsdt)} (${pct(o.netPct)}).`,
        reasons,
      };
    if (o.netUsdt > 0)
      return {
        level: 'amarelo',
        title: 'Lucro pequeno: abaixo do seu alvo',
        message: `Líquido estimado ${usd(o.netUsdt)} (${pct(o.netPct)}); o seu alvo é ${pct(op.targetNetPct)}.`,
        reasons,
      };
    return {
      level: 'vermelho',
      title: 'Não compensa agora',
      message: `Diferença bruta ${pct(o.grossPct)}, mas depois das taxas o resultado seria ${usd(o.netUsdt)} (${pct(o.netPct)}).`,
      reasons,
    };
  }

  // ---- Já comprou
  if (p.sell.levelsUsed > 1)
    reasons.unshift(
      `Vender TUDO a mercado agora usaria ${p.sell.levelsUsed} níveis do livro (preço médio ${p.sell.avgPrice.toLocaleString('pt-BR', { maximumSignificantDigits: 4 })}). No melhor preço cabem ${p.coinsAtBestBid ? p.coinsAtBestBid.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '?'} moedas: considere ordem limite.`,
    );
  if (!p.sell.complete) reasons.unshift('O livro do destino não tem compradores suficientes para todas as suas moedas: vender tudo agora sairia ainda pior.');
  if (op.stage === 'comprado') {
    reasons.push(`Se desistir e vender de volta na corretora de compra: ${usd(p.netAbort)}.`);
    if (p.netSell <= 0)
      return {
        level: 'vermelho',
        title: 'A diferença fechou: transferir hoje daria prejuízo',
        message: `Vendendo no destino agora: ${usd(p.netSell)} (${pct(p.netSellPct)}). Avalie esperar ou desistir antes de sacar.`,
        reasons,
      };
    return {
      level: 'amarelo',
      title: 'Comprado: transfira para a corretora de venda',
      message: `Se as moedas chegassem agora, o resultado seria ${usd(p.netSell)} (${pct(p.netSellPct)}).`,
      reasons,
    };
  }

  if (op.stage === 'em trânsito') {
    const level: SSLevel = p.netSell > 0 ? 'amarelo' : 'vermelho';
    return {
      level,
      title: p.netSell > 0 ? 'Em trânsito: lucro ainda de pé' : 'Em trânsito: abaixo do empate',
      message: `Se vendesse ao chegar agora: ${usd(p.netSell)} (${pct(p.netSellPct)}). Margem antes do prejuízo: ${pct(p.cushionPct)}.`,
      reasons: [...reasons, 'Confira o TxID no histórico de saque se demorar mais que o normal.'],
    };
  }

  // ---- Moedas na corretora de venda
  if (p.netSellPct >= op.targetNetPct)
    return {
      level: 'verde',
      title: 'Hora de vender',
      message: `Vendendo agora: ${usd(p.netSell)} (${pct(p.netSellPct)}), acima do seu alvo de ${pct(op.targetNetPct)}.`,
      reasons: [...reasons, 'Ordem limite no preço-alvo evita escorregar o preço.'],
    };
  if (p.netSell > 0)
    return {
      level: 'amarelo',
      title: 'Lucro abaixo do alvo',
      message: `Vendendo agora: ${usd(p.netSell)} (${pct(p.netSellPct)}). Preço-alvo de venda: ${p.targetSellPrice.toLocaleString('pt-BR', { maximumSignificantDigits: 6 })}.`,
      reasons,
    };
  return {
    level: 'vermelho',
    title: 'Abaixo do empate',
    message: `Vendendo agora: ${usd(p.netSell)}. Para empatar, precisa vender a ${p.breakevenSellPrice.toLocaleString('pt-BR', { maximumSignificantDigits: 6 })} ou mais.`,
    reasons: [...reasons, 'Sem proteção, esperar é apostar que o preço sobe. Defina até quanto você aceita perder.'],
  };
}
