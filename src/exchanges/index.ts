import type { BookQuote, ExchangeId, FundingEvent, FuturesInfo, Market } from '../core/types';
import { openWs, type Conn, type FeedStatus } from './ws';

/*
 * Adaptadores das corretoras. Só dados PÚBLICOS (sem chave de API).
 * Formatos conferidos em 02/10/2026. Ver docs/ARQUITETURA.md → "Endpoints".
 */

export interface ExchangeMeta {
  id: ExchangeId;
  name: string;
  /** Tem futuros perpétuos implementados no app. */
  hasFutures: boolean;
  /** Taxa taker padrão (fração), editável pelo usuário. */
  spotFee: number;
  futFee: number;
}

export const EXCHANGES: Record<ExchangeId, ExchangeMeta> = {
  binance: { id: 'binance', name: 'Binance', hasFutures: true, spotFee: 0.001, futFee: 0.0005 },
  gate: { id: 'gate', name: 'Gate', hasFutures: true, spotFee: 0.002, futFee: 0.0005 },
  bybit: { id: 'bybit', name: 'Bybit', hasFutures: true, spotFee: 0.001, futFee: 0.00055 },
  okx: { id: 'okx', name: 'OKX', hasFutures: true, spotFee: 0.001, futFee: 0.0005 },
  lbank: { id: 'lbank', name: 'LBank', hasFutures: false, spotFee: 0.002, futFee: 0 },
  mexc: { id: 'mexc', name: 'MEXC', hasFutures: false, spotFee: 0.0005, futFee: 0 },
  kucoin: { id: 'kucoin', name: 'KuCoin', hasFutures: false, spotFee: 0.001, futFee: 0 },
  weex: { id: 'weex', name: 'WEEX', hasFutures: true, spotFee: 0.001, futFee: 0.0006 },
  bitget: { id: 'bitget', name: 'Bitget', hasFutures: true, spotFee: 0.001, futFee: 0.0006 },
};

export const ALL_EXCHANGES = Object.keys(EXCHANGES) as ExchangeId[];
export const FUTURES_EXCHANGES = ALL_EXCHANGES.filter((id) => EXCHANGES[id].hasFutures);

export function symbolFor(ex: ExchangeId, market: Market, base: string, quote: string): string {
  const b = base.trim().toUpperCase();
  const q = quote.trim().toUpperCase();
  switch (ex) {
    case 'binance':
    case 'bybit':
    case 'mexc':
    case 'bitget':
      return b + q;
    case 'lbank':
      return `${b}_${q}`.toLowerCase();
    case 'gate':
      return `${b}_${q}`;
    case 'okx':
      return market === 'spot' ? `${b}-${q}` : `${b}-${q}-SWAP`;
    case 'kucoin':
      return `${b}-${q}`;
    case 'weex':
      return market === 'spot' ? `${b}${q}_SPBL` : `cmt_${b}${q}`.toLowerCase();
  }
}

type QuoteCb = (q: BookQuote) => void;
type InfoCb = (i: Partial<FuturesInfo>) => void;
type StatusCb = (s: FeedStatus) => void;

const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
const multi = (conns: Conn[]): Conn => ({ close: () => conns.forEach((c) => c.close()) });

// ---------- SPOT (com profundidade) → ./spot.ts ----------
export { fetchSpotDepth, fetchWithdrawFee, HAS_WITHDRAW_FEE_API, subscribeSpot, type WithdrawOption } from './spot';
import { makeBook, weexBook } from './spot';

// ---------- FUTUROS PERPÉTUOS ----------
export function subscribeFutures(ex: ExchangeId, symbol: string, onQuote: QuoteCb, onInfo: InfoCb, onStatus: StatusCb): Conn {
  switch (ex) {
    case 'binance': {
      // Desde 2026 a Binance separa: book em /public, mark/funding em /market (o caminho antigo fica mudo).
      const s = symbol.toLowerCase();
      return multi([
        openWs(`wss://fstream.binance.com/public/ws/${s}@bookTicker`, {
          onStatus,
          onMessage: (d: any) => d?.b && onQuote({ bid: +d.b, ask: +d.a, ts: d.T ?? Date.now() }),
        }),
        openWs(`wss://fstream.binance.com/market/ws/${s}@markPrice@1s`, {
          onMessage: (d: any) =>
            d?.e === 'markPriceUpdate' && onInfo({ mark: +d.p, index: +d.i, fundingRate: +d.r, nextFundingTime: +d.T }),
        }),
      ]);
    }
    case 'gate':
      return openWs('wss://fx-ws.gateio.ws/v4/ws/usdt', {
        onStatus,
        onOpen: (ws) => {
          ws.send(JSON.stringify({ time: now(), channel: 'futures.book_ticker', event: 'subscribe', payload: [symbol] }));
          ws.send(JSON.stringify({ time: now(), channel: 'futures.tickers', event: 'subscribe', payload: [symbol] }));
        },
        ping: () => JSON.stringify({ time: now(), channel: 'futures.ping' }),
        onMessage: (d: any) => {
          if (d?.event !== 'update') return;
          if (d.channel === 'futures.book_ticker' && d.result?.b) onQuote({ bid: +d.result.b, ask: +d.result.a, ts: d.result.t });
          if (d.channel === 'futures.tickers') {
            const t = d.result?.[0];
            if (t)
              onInfo({
                mark: num(t.mark_price),
                index: num(t.index_price),
                fundingRate: num(t.funding_rate),
                nextFundingTime: t.funding_next_apply ? t.funding_next_apply * 1000 : undefined,
              });
          }
        },
      });
    case 'bybit': {
      // tickers manda um "snapshot" e depois só os campos que mudaram ("delta").
      const st: Record<string, string> = {};
      return openWs('wss://stream.bybit.com/v5/public/linear', {
        onStatus,
        onOpen: (ws) => ws.send(JSON.stringify({ op: 'subscribe', args: [`tickers.${symbol}`] })),
        ping: () => JSON.stringify({ op: 'ping' }),
        onMessage: (d: any) => {
          if (!d?.topic?.startsWith('tickers.')) return;
          Object.assign(st, d.data);
          if (st.bid1Price && st.ask1Price) onQuote({ bid: +st.bid1Price, ask: +st.ask1Price, ts: d.ts ?? Date.now() });
          onInfo({
            mark: num(st.markPrice),
            index: num(st.indexPrice),
            fundingRate: num(st.fundingRate),
            nextFundingTime: num(st.nextFundingTime),
          });
        },
      });
    }
    case 'okx':
      return openWs('wss://ws.okx.com:8443/ws/v5/public', {
        onStatus,
        onOpen: (ws) =>
          ws.send(
            JSON.stringify({
              op: 'subscribe',
              args: ['tickers', 'mark-price', 'funding-rate'].map((channel) => ({ channel, instId: symbol })),
            }),
          ),
        ping: () => 'ping',
        pingMs: 25000,
        onMessage: (d: any) => {
          const t = d?.data?.[0];
          if (!t) return;
          const ch = d.arg?.channel;
          if (ch === 'tickers' && t.bidPx) onQuote({ bid: +t.bidPx, ask: +t.askPx, ts: +t.ts });
          if (ch === 'mark-price') onInfo({ mark: +t.markPx });
          // Na OKX, fundingTime é o PRÓXIMO pagamento e fundingRate é a taxa desse período.
          if (ch === 'funding-rate') onInfo({ fundingRate: +t.fundingRate, nextFundingTime: +t.fundingTime });
        },
      });
    case 'weex':
      return weexFutures(symbol, onQuote, onInfo, onStatus);
    case 'bitget':
      // books15 = foto dos 15 melhores níveis a cada mensagem; ticker traz mark, índice, funding e o próximo pagamento.
      return openWs('wss://ws.bitget.com/v2/ws/public', {
        onStatus,
        onOpen: (ws) =>
          ws.send(
            JSON.stringify({
              op: 'subscribe',
              args: ['books15', 'ticker'].map((channel) => ({ instType: 'USDT-FUTURES', channel, instId: symbol })),
            }),
          ),
        ping: () => 'ping',
        pingMs: 25000,
        onMessage: (d: any) => {
          const x = d?.data?.[0];
          if (!x) return;
          if (d.arg?.channel === 'books15') {
            const q = makeBook(x.bids, x.asks);
            if (q) onQuote(q);
          } else if (d.arg?.channel === 'ticker')
            onInfo({ mark: num(x.markPrice), index: num(x.indexPrice), fundingRate: num(x.fundingRate), nextFundingTime: num(x.nextFundingTime) });
        },
      });
    case 'lbank':
    case 'mexc':
    case 'kucoin':
      onStatus('parado');
      return { close() {} };
  }
}

/**
 * WEEX perpétuo: livro e mark/índice por WebSocket; o funding vem por REST (consultado a cada 60 s).
 * `currentFundRate.timestamp` é o ÚLTIMO pagamento; o próximo = último + collectCycle (minutos).
 */
function weexFutures(symbol: string, onQuote: QuoteCb, onInfo: InfoCb, onStatus: StatusCb): Conn {
  const book = weexBook();
  let stop = false;
  const funding = async () => {
    try {
      const r = await fetch(`https://api-contract.weex.com/capi/v2/market/currentFundRate?symbol=${symbol}`);
      const d = (await r.json())?.[0];
      if (d && !stop) {
        const cycle = (+d.collectCycle || 480) * 60000;
        let next = +d.timestamp + cycle;
        while (next < Date.now()) next += cycle;
        onInfo({ fundingRate: +d.fundingRate, nextFundingTime: next });
      }
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  };
  funding();
  const t = setInterval(funding, 60000);
  const ws = openWs('wss://ws-contract.weex.com/v2/ws/public', {
    onStatus,
    onOpen: (ws) => {
      book.reset();
      ws.send(JSON.stringify({ event: 'subscribe', channel: `depth.${symbol}.15` }));
      ws.send(JSON.stringify({ event: 'subscribe', channel: `ticker.${symbol}` }));
    },
    onMessage: (d: any, _raw, ws) => {
      if (d?.event === 'ping') return ws.send(JSON.stringify({ event: 'pong', time: d.time }));
      if (d?.event !== 'payload') return;
      const x = d.data?.[0];
      if (d.channel?.startsWith('depth.')) {
        const q = book.apply(x, d.type === 'snapshot' || x?.depthType === 'SNAPSHOT');
        if (q) onQuote(q);
      } else if (d.channel?.startsWith('ticker.') && x) onInfo({ mark: num(x.markPrice), index: num(x.indexPrice) });
    },
  });
  return {
    close() {
      stop = true;
      clearInterval(t);
      ws.close();
    },
  };
}

// ---------- HISTÓRICO DE FUNDING (REST) ----------
// (LBank/MEXC: só spot neste app → lista vazia.)
export async function fetchFundingHistory(ex: ExchangeId, symbol: string, sinceMs: number): Promise<FundingEvent[]> {
  const get = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${EXCHANGES[ex].name}: HTTP ${r.status}`);
    return r.json();
  };
  let events: FundingEvent[] = [];
  switch (ex) {
    case 'binance': {
      const d = await get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${sinceMs}&limit=1000`);
      events = d.map((e: any) => ({ time: e.fundingTime, rate: +e.fundingRate, markPrice: num(e.markPrice) }));
      break;
    }
    case 'gate': {
      const d = await get(`https://api.gateio.ws/api/v4/futures/usdt/funding_rate?contract=${symbol}&from=${Math.floor(sinceMs / 1000)}&limit=1000`);
      events = d.map((e: any) => ({ time: e.t * 1000, rate: +e.r }));
      break;
    }
    case 'bybit': {
      const d = await get(
        `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&startTime=${sinceMs}&endTime=${Date.now()}&limit=200`,
      );
      events = (d.result?.list ?? []).map((e: any) => ({ time: +e.fundingRateTimestamp, rate: +e.fundingRate }));
      break;
    }
    case 'okx': {
      const d = await get(`https://www.okx.com/api/v5/public/funding-rate-history?instId=${symbol}&limit=400`);
      events = (d.data ?? []).map((e: any) => ({ time: +e.fundingTime, rate: +(e.realizedRate || e.fundingRate) }));
      break;
    }
    case 'bitget': {
      const d = await get(`https://api.bitget.com/api/v2/mix/market/history-fund-rate?symbol=${symbol}&productType=usdt-futures&pageSize=100`);
      events = (d.data ?? []).map((e: any) => ({ time: +e.fundingTime, rate: +e.fundingRate }));
      break;
    }
    case 'weex': {
      const d = await get(`https://api-contract.weex.com/capi/v2/market/getHistoryFundRate?symbol=${symbol}&limit=100`);
      events = (Array.isArray(d) ? d : []).map((e: any) => ({ time: +e.fundingTime, rate: +e.fundingRate }));
      break;
    }
    case 'lbank':
    case 'mexc':
    case 'kucoin':
      return [];
  }
  return events.filter((e) => e.time > sinceMs).sort((a, b) => a.time - b.time);
}

const now = () => Math.floor(Date.now() / 1000);
