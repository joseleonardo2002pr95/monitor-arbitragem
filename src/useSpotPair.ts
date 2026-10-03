import { useEffect, useRef, useState } from 'react';
import type { BookQuote, SpotSpotOp } from './core/types';
import { subscribeSpot, symbolFor } from './exchanges';
import type { FeedStatus } from './exchanges/ws';

const RENDER_MS = 250;

export interface SpotPair {
  buySymbol: string;
  sellSymbol: string;
  a?: BookQuote; // corretora de compra
  b?: BookQuote; // corretora de venda
  aStatus: FeedStatus;
  bStatus: FeedStatus;
}

/** Assina o spot das duas corretoras e entrega à tela no máximo 4x por segundo. */
export function useSpotPair(op: SpotSpotOp): SpotPair {
  const buySymbol = op.buySymbolOverride?.trim() || symbolFor(op.buyExchange, 'spot', op.base, op.quote);
  const sellSymbol = op.sellSymbolOverride?.trim() || symbolFor(op.sellExchange, 'spot', op.base, op.quote);
  const latest = useRef<{ a?: BookQuote; b?: BookQuote }>({});
  const [view, setView] = useState<{ a?: BookQuote; b?: BookQuote }>({});
  const [aStatus, setA] = useState<FeedStatus>('conectando');
  const [bStatus, setB] = useState<FeedStatus>('conectando');
  const live = op.stage !== 'vendido';

  useEffect(() => {
    if (!live) return;
    latest.current = {};
    const x = subscribeSpot(op.buyExchange, buySymbol, (q) => (latest.current.a = { ...q, ts: Date.now() }), setA);
    const y = subscribeSpot(op.sellExchange, sellSymbol, (q) => (latest.current.b = { ...q, ts: Date.now() }), setB);
    const t = setInterval(() => setView({ ...latest.current }), RENDER_MS);
    return () => {
      x.close();
      y.close();
      clearInterval(t);
    };
  }, [live, op.buyExchange, op.sellExchange, buySymbol, sellSymbol]);

  return { buySymbol, sellSymbol, ...view, aStatus, bStatus };
}
