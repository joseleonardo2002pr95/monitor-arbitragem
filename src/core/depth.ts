import type { Level } from './types';

/**
 * Executar uma ordem A MERCADO "come" o livro nível por nível.
 * Estas funções calculam o preço médio REAL que você receberia/pagaria.
 */
export interface Execution {
  /** Moedas executadas. */
  coins: number;
  /** USDT pagos (compra) ou recebidos (venda), antes da taxa. */
  usdt: number;
  avgPrice: number;
  /** Pior preço atingido (o último nível usado). */
  worstPrice: number;
  levelsUsed: number;
  /** false = o livro carregado não tinha quantidade suficiente. O que faltou foi estimado no pior preço. */
  complete: boolean;
}

/** Vende `coins` nos compradores (bids, melhor primeiro). */
export function sellIntoBids(bids: Level[], coins: number): Execution {
  let left = coins;
  let usdt = 0;
  let worst = bids[0]?.[0] ?? 0;
  let used = 0;
  for (const [p, q] of bids) {
    if (left <= 0) break;
    const take = Math.min(q, left);
    usdt += take * p;
    left -= take;
    worst = p;
    used++;
  }
  const complete = left <= 1e-9;
  if (!complete) usdt += left * worst; // otimista: o real seria pior
  return { coins, usdt, avgPrice: coins > 0 ? usdt / coins : 0, worstPrice: worst, levelsUsed: used, complete };
}

/** Compra gastando `usdt` nos vendedores (asks, melhor primeiro). */
export function buyWithUsdt(asks: Level[], usdt: number): Execution {
  let left = usdt;
  let coins = 0;
  let worst = asks[0]?.[0] ?? 0;
  let used = 0;
  for (const [p, q] of asks) {
    if (left <= 0) break;
    const cost = Math.min(q * p, left);
    coins += cost / p;
    left -= cost;
    worst = p;
    used++;
  }
  const complete = left <= 1e-9;
  if (!complete && worst > 0) coins += left / worst; // otimista: o real seria pior
  return { coins, usdt, avgPrice: coins > 0 ? usdt / coins : 0, worstPrice: worst, levelsUsed: used, complete };
}

/** Total disponível no livro carregado. */
export const bookCoins = (levels: Level[]) => levels.reduce((s, [, q]) => s + q, 0);
export const bookUsdt = (levels: Level[]) => levels.reduce((s, [p, q]) => s + p * q, 0);
