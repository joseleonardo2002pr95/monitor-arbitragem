import type { BookQuote, ExchangeId, Level } from '../core/types';
import { openWs, type Conn, type FeedStatus } from './ws';

/*
 * SPOT: livro de ofertas com VÁRIOS níveis (profundidade), não só o melhor preço.
 * Em moeda de pouca liquidez o melhor preço vale para pouca quantidade; o resto sai pior.
 * Conferido em 03/10/2026. LBank, MEXC e KuCoin passam pelo proxy local (vite.config.ts) por falta de CORS.
 */

type QuoteCb = (q: BookQuote) => void;
type StatusCb = (s: FeedStatus) => void;

const DEPTH = 50;
/** Sem novidade no WebSocket por esse tempo → consulta o REST. */
const QUIET_MS = 5000;

const toLevels = (arr: unknown): Level[] =>
  (Array.isArray(arr) ? arr : [])
    .map((x: any) => [Number(x[0]), Number(x[1])] as Level)
    .filter(([p, q]) => p > 0 && q > 0);

/** Monta o BookQuote a partir das listas de níveis (ordena: melhor preço primeiro). */
export function makeBook(bids: unknown, asks: unknown): BookQuote | undefined {
  const b = toLevels(bids).sort((x, y) => y[0] - x[0]);
  const a = toLevels(asks).sort((x, y) => x[0] - y[0]);
  if (!b.length || !a.length) return undefined;
  return { bid: b[0][0], ask: a[0][0], bidQty: b[0][1], askQty: a[0][1], bids: b, asks: a, ts: Date.now() };
}

// ---------- REST (foto do livro) ----------

async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export async function fetchSpotDepth(ex: ExchangeId, symbol: string): Promise<BookQuote | undefined> {
  switch (ex) {
    case 'binance': {
      const d = await json(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${DEPTH}`);
      return makeBook(d.bids, d.asks);
    }
    case 'gate': {
      const d = await json(`https://api.gateio.ws/api/v4/spot/order_book?currency_pair=${symbol}&limit=${DEPTH}`);
      return makeBook(d.bids, d.asks);
    }
    case 'bybit': {
      const d = (await json(`https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=${DEPTH}`))?.result;
      return makeBook(d?.b, d?.a);
    }
    case 'okx': {
      const d = (await json(`https://www.okx.com/api/v5/market/books?instId=${symbol}&sz=${DEPTH}`))?.data?.[0];
      return makeBook(d?.bids, d?.asks);
    }
    case 'lbank': {
      const d = (await json(`/proxy/lbank/v2/depth.do?symbol=${symbol}&size=${DEPTH}`))?.data;
      return makeBook(d?.bids, d?.asks);
    }
    case 'mexc': {
      const d = await json(`/proxy/mexc/api/v3/depth?symbol=${symbol}&limit=${DEPTH}`);
      return makeBook(d.bids, d.asks);
    }
    case 'kucoin': {
      const d = (await json(`/proxy/kucoin/api/v1/market/orderbook/level2_100?symbol=${symbol}`))?.data;
      return makeBook(d?.bids, d?.asks);
    }
    case 'weex': {
      const d = (await json(`https://api-spot.weex.com/api/v2/market/depth?symbol=${symbol}&limit=${DEPTH}`))?.data;
      return makeBook(d?.bids, d?.asks);
    }
    case 'bitget': {
      const d = (await json(`https://api.bitget.com/api/v2/spot/market/orderbook?symbol=${symbol}&limit=${DEPTH}`))?.data;
      return makeBook(d?.bids, d?.asks);
    }
  }
}

/**
 * Livro da WEEX (spot e futuros): primeiro um "SNAPSHOT", depois só as mudanças ("CHANGED").
 * Níveis vêm como {price, size}; size 0 = remover.
 */
export function weexBook() {
  const bids = new Map<string, string>();
  const asks = new Map<string, string>();
  const put = (m: Map<string, string>, rows: { price: string; size: string }[] = []) =>
    rows.forEach((r) => (+r.size === 0 ? m.delete(r.price) : m.set(r.price, r.size)));
  return {
    reset() {
      bids.clear();
      asks.clear();
    },
    apply(x: any, snapshot: boolean): BookQuote | undefined {
      if (!x) return undefined;
      if (snapshot) this.reset();
      put(bids, x.bids);
      put(asks, x.asks);
      return makeBook([...bids], [...asks]);
    },
  };
}

// ---------- AO VIVO ----------

/**
 * Spot ao vivo com profundidade. O WebSocket de várias corretoras só manda quando o livro MUDA
 * (moedas paradas podem ficar minutos sem mensagem) → foto via REST no início e sempre que ficar 5 s quieto.
 */
export function subscribeSpot(ex: ExchangeId, symbol: string, onQuote: QuoteCb, onStatus: StatusCb): Conn {
  let last = 0;
  let stop = false;
  const emit = (q: BookQuote | undefined) => {
    if (!q || stop) return;
    last = Date.now();
    onQuote(q);
  };
  const ws = subscribeSpotWs(ex, symbol, emit, onStatus);
  const refresh = () => {
    if (stop || Date.now() - last < QUIET_MS) return;
    fetchSpotDepth(ex, symbol)
      .then((q) => Date.now() - last >= QUIET_MS && emit(q))
      .catch(() => undefined);
  };
  refresh();
  const t = setInterval(refresh, QUIET_MS);
  return {
    close() {
      stop = true;
      clearInterval(t);
      ws.close();
    },
  };
}

const now = () => Math.floor(Date.now() / 1000);

function subscribeSpotWs(ex: ExchangeId, symbol: string, emit: (q: BookQuote | undefined) => void, onStatus: StatusCb): Conn {
  switch (ex) {
    case 'binance':
      // depth20@100ms = foto dos 20 melhores níveis a cada 100 ms
      return openWs(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth20@100ms`, {
        onStatus,
        onMessage: (d: any) => d?.bids && emit(makeBook(d.bids, d.asks)),
      });
    case 'gate':
      return openWs('wss://api.gateio.ws/ws/v4/', {
        onStatus,
        onOpen: (ws) => ws.send(JSON.stringify({ time: now(), channel: 'spot.order_book', event: 'subscribe', payload: [symbol, '20', '100ms'] })),
        ping: () => JSON.stringify({ time: now(), channel: 'spot.ping' }),
        onMessage: (d: any) => d?.event === 'update' && d.result?.bids && emit(makeBook(d.result.bids, d.result.asks)),
      });
    case 'bybit': {
      // orderbook.50: um "snapshot" e depois só as mudanças ("delta"; quantidade 0 = remover o nível)
      const bids = new Map<string, string>();
      const asks = new Map<string, string>();
      const apply = (m: Map<string, string>, rows: string[][] = []) => rows.forEach(([p, q]) => (+q === 0 ? m.delete(p) : m.set(p, q)));
      return openWs('wss://stream.bybit.com/v5/public/spot', {
        onStatus,
        onOpen: (ws) => {
          bids.clear();
          asks.clear();
          ws.send(JSON.stringify({ op: 'subscribe', args: [`orderbook.50.${symbol}`] }));
        },
        ping: () => JSON.stringify({ op: 'ping' }),
        onMessage: (d: any) => {
          if (!d?.topic?.startsWith('orderbook.')) return;
          if (d.type === 'snapshot') {
            bids.clear();
            asks.clear();
          }
          apply(bids, d.data?.b);
          apply(asks, d.data?.a);
          emit(makeBook([...bids], [...asks]));
        },
      });
    }
    case 'okx':
      // books5 = 5 melhores níveis (o livro completo da OKX exige checksum; 5 níveis bastam para moedas líquidas)
      return openWs('wss://ws.okx.com:8443/ws/v5/public', {
        onStatus,
        onOpen: (ws) => ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'books5', instId: symbol }] })),
        ping: () => 'ping',
        pingMs: 25000,
        onMessage: (d: any) => {
          const t = d?.data?.[0];
          if (t?.bids) emit(makeBook(t.bids, t.asks));
        },
      });
    case 'lbank':
      // Via proxy local: o WS direto do navegador não abre. A LBank manda {"action":"ping"} e espera "pong".
      return openWs(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/proxy/lbank-ws`, {
        onStatus,
        onOpen: (ws) => ws.send(JSON.stringify({ action: 'subscribe', subscribe: 'depth', depth: String(DEPTH), pair: symbol })),
        ping: () => JSON.stringify({ action: 'ping', ping: String(Date.now()) }),
        onMessage: (d: any, _raw, ws) => {
          if (d?.action === 'ping') return ws.send(JSON.stringify({ action: 'pong', pong: d.ping }));
          if (d?.depth) emit(makeBook(d.depth.bids, d.depth.asks));
        },
      });
    case 'mexc':
      // O WS de spot da MEXC usa protobuf → consulta o REST de profundidade a cada 1 s.
      return poll(() => fetchSpotDepth('mexc', symbol), 1000, onStatus, emit);
    case 'kucoin':
      return kucoinWs(symbol, emit, onStatus);
    case 'bitget':
      // books15 = foto dos 15 melhores níveis em cada mensagem (não precisa juntar mudanças).
      return openWs('wss://ws.bitget.com/v2/ws/public', {
        onStatus,
        onOpen: (ws) => ws.send(JSON.stringify({ op: 'subscribe', args: [{ instType: 'SPOT', channel: 'books15', instId: symbol }] })),
        ping: () => 'ping',
        pingMs: 25000,
        onMessage: (d: any) => {
          const x = d?.data?.[0];
          if (x?.bids) emit(makeBook(x.bids, x.asks));
        },
      });
    case 'weex': {
      const book = weexBook();
      return openWs('wss://ws-spot.weex.com/v2/ws/public', {
        onStatus,
        onOpen: (ws) => {
          book.reset();
          ws.send(JSON.stringify({ event: 'subscribe', channel: `depth.${symbol}.15` }));
        },
        onMessage: (d: any, _raw, ws) => {
          if (d?.event === 'ping') return ws.send(JSON.stringify({ event: 'pong', time: d.time }));
          if (d?.event === 'payload') emit(book.apply(d.data?.[0], d.type === 'snapshot' || d.data?.[0]?.depthType === 'SNAPSHOT'));
        },
      });
    }
  }
}

/** KuCoin: pede um token público (REST, via proxy) e então conecta no servidor de WebSocket indicado. */
function kucoinWs(symbol: string, emit: (q: BookQuote | undefined) => void, onStatus: StatusCb): Conn {
  let conn: Conn | undefined;
  let stop = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const start = async () => {
    try {
      const d = (await json('/proxy/kucoin/api/v1/bullet-public', { method: 'POST' }))?.data;
      const srv = d?.instanceServers?.[0];
      if (!srv || stop) throw new Error('sem servidor');
      conn = openWs(`${srv.endpoint}?token=${d.token}&connectId=${Date.now()}`, {
        onStatus,
        onMessage: (m: any, _raw, ws) => {
          if (m?.type === 'welcome')
            ws.send(JSON.stringify({ id: String(Date.now()), type: 'subscribe', topic: `/spotMarket/level2Depth50:${symbol}`, response: true }));
          if (m?.type === 'message' && m.data?.bids) emit(makeBook(m.data.bids, m.data.asks));
        },
        ping: () => JSON.stringify({ id: String(Date.now()), type: 'ping' }),
        pingMs: srv.pingInterval ?? 18000,
      });
    } catch {
      onStatus('reconectando');
      if (!stop) retry = setTimeout(start, 5000);
    }
  };
  onStatus('conectando');
  start();
  return {
    close() {
      stop = true;
      clearTimeout(retry);
      conn?.close();
      onStatus('parado');
    },
  };
}

/** Consulta periódica de REST com o mesmo formato de status dos WebSockets. */
function poll<T>(get: () => Promise<T>, ms: number, onStatus: StatusCb, onData: (d: T) => void): Conn {
  let stop = false;
  let fails = 0;
  onStatus('conectando');
  const tick = async () => {
    if (stop) return;
    try {
      onData(await get());
      fails = 0;
      onStatus('ao vivo');
    } catch {
      fails++;
      onStatus('reconectando');
    }
    if (!stop) setTimeout(tick, fails ? Math.min(30000, ms * 2 ** fails) : ms);
  };
  tick();
  return {
    close() {
      stop = true;
      onStatus('parado');
    },
  };
}

// ---------- TAXA DE SAQUE ----------

export interface WithdrawOption {
  chain: string;
  fee: number;
  min: number;
}

/**
 * Taxa de saque em moedas, por rede. LBank e KuCoin (via proxy local), WEEX e Bitget publicam isso sem login.
 * Nas outras corretoras o usuário digita o valor que aparece na tela de saque.
 */
export async function fetchWithdrawFee(ex: ExchangeId, base: string): Promise<WithdrawOption[]> {
  if (ex === 'lbank') {
    const d = await json(`/proxy/lbank/v2/withdrawConfigs.do?assetCode=${base.toLowerCase()}`);
    return (d.data ?? []).filter((c: any) => c.canWithDraw).map((c: any) => ({ chain: String(c.chain).toUpperCase(), fee: +c.fee, min: +c.min }));
  }
  if (ex === 'kucoin') {
    const d = await json(`/proxy/kucoin/api/v3/currencies/${base.toUpperCase()}`);
    return (d.data?.chains ?? [])
      .filter((c: any) => c.isWithdrawEnabled)
      .map((c: any) => ({ chain: String(c.chainName).toUpperCase(), fee: +c.withdrawalMinFee, min: +c.withdrawalMinSize }));
  }
  if (ex === 'weex') {
    // A lista vem com TODAS as moedas (~460 KB); filtramos aqui.
    const d = await json('https://api-spot.weex.com/api/v2/public/currencies');
    const coin = (d.data ?? []).find((c: any) => String(c.coinName).toUpperCase() === base.toUpperCase());
    return (coin?.chains ?? [])
      .filter((c: any) => c.withdrawable === 'true')
      .map((c: any) => ({ chain: String(c.chain).toUpperCase(), fee: +c.withdrawFee, min: +(c.minWithdrawAmount ?? 0) }));
  }
  if (ex === 'bitget') {
    const d = await json(`https://api.bitget.com/api/v2/spot/public/coins?coin=${base.toUpperCase()}`);
    return (d.data?.[0]?.chains ?? [])
      .filter((c: any) => c.withdrawable === 'true')
      .map((c: any) => ({ chain: String(c.chain).toUpperCase(), fee: +c.withdrawFee, min: +(c.minWithdrawAmount ?? 0) }));
  }
  return [];
}

export const HAS_WITHDRAW_FEE_API: ExchangeId[] = ['lbank', 'kucoin', 'weex', 'bitget'];
