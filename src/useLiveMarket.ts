import { useCallback, useEffect, useRef, useState } from 'react';
import { fundingFromHistory } from './core/calc';
import type { BookQuote, FundingEvent, FuturesInfo, Operation } from './core/types';
import { fetchFundingHistory, subscribeFutures, subscribeSpot, symbolFor } from './exchanges';
import type { FeedStatus } from './exchanges/ws';

/** Frequência máxima de atualização da tela (as corretoras mandam bem mais rápido). */
const RENDER_MS = 250;
const FUNDING_REFRESH_MS = 5 * 60 * 1000;

export interface LiveMarket {
  spotSymbol: string;
  futSymbol: string;
  spot?: BookQuote;
  fut?: BookQuote;
  info: FuturesInfo;
  spotStatus: FeedStatus;
  futStatus: FeedStatus;
  funding: { value: number; source: 'manual' | 'histórico' | 'indisponível'; events: FundingEvent[]; error?: string };
  refreshFunding: () => void;
}

export function useLiveMarket(op: Operation): LiveMarket {
  const spotSymbol = op.spotSymbolOverride?.trim() || symbolFor(op.spotExchange, 'spot', op.base, op.quote);
  const futSymbol = op.futSymbolOverride?.trim() || symbolFor(op.futExchange, 'futures', op.base, op.quote);

  const latest = useRef<{ spot?: BookQuote; fut?: BookQuote; info: FuturesInfo }>({ info: { ts: 0 } });
  const [view, setView] = useState<{ spot?: BookQuote; fut?: BookQuote; info: FuturesInfo }>({ info: { ts: 0 } });
  const [spotStatus, setSpotStatus] = useState<FeedStatus>('conectando');
  const [futStatus, setFutStatus] = useState<FeedStatus>('conectando');
  const [events, setEvents] = useState<FundingEvent[]>([]);
  const [fundingError, setFundingError] = useState<string>();
  const live = op.status === 'aberta';

  useEffect(() => {
    if (!live) return;
    latest.current = { info: { ts: 0 } };
    // ts = hora em que CHEGOU aqui (evita diferença de relógio com a corretora).
    const a = subscribeSpot(op.spotExchange, spotSymbol, (q) => (latest.current.spot = { ...q, ts: Date.now() }), setSpotStatus);
    const b = subscribeFutures(
      op.futExchange,
      futSymbol,
      (q) => (latest.current.fut = { ...q, ts: Date.now() }),
      (i) => (latest.current.info = { ...latest.current.info, ...stripUndef(i), ts: Date.now() }),
      setFutStatus,
    );
    const t = setInterval(() => setView({ ...latest.current }), RENDER_MS);
    return () => {
      a.close();
      b.close();
      clearInterval(t);
    };
  }, [live, op.spotExchange, op.futExchange, spotSymbol, futSymbol]);

  const firstFill = op.futFills.length ? Math.min(...op.futFills.map((f) => f.time)) : op.createdAt;

  const refreshFunding = useCallback(() => {
    fetchFundingHistory(op.futExchange, futSymbol, firstFill)
      .then((ev) => {
        setEvents(ev);
        setFundingError(undefined);
      })
      .catch((e) => setFundingError(String(e.message ?? e)));
  }, [op.futExchange, futSymbol, firstFill]);

  useEffect(() => {
    if (!live) return;
    refreshFunding();
    const t = setInterval(refreshFunding, FUNDING_REFRESH_MS);
    return () => clearInterval(t);
  }, [live, refreshFunding]);

  const manual = op.fundingManual !== undefined && op.fundingManual !== null && !Number.isNaN(op.fundingManual);
  const fallbackPrice = view.info.mark ?? view.fut?.ask ?? 0;
  const funding = manual
    ? { value: op.fundingManual as number, source: 'manual' as const, events }
    : fundingError
      ? { value: 0, source: 'indisponível' as const, events, error: fundingError }
      : { value: fundingFromHistory(events, op.futFills, fallbackPrice), source: 'histórico' as const, events };

  return { spotSymbol, futSymbol, ...view, spotStatus, futStatus, funding, refreshFunding };
}

function stripUndef<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !Number.isNaN(v))) as Partial<T>;
}
