export type FeedStatus = 'conectando' | 'ao vivo' | 'reconectando' | 'parado';

export interface Conn {
  close(): void;
}

interface Opts {
  onOpen?: (ws: WebSocket) => void;
  onMessage: (data: unknown, raw: string, ws: WebSocket) => void;
  onStatus?: (s: FeedStatus) => void;
  /** Mensagem de ping enviada periodicamente (algumas corretoras exigem). */
  ping?: () => string;
  pingMs?: number;
  /** Sem mensagens por esse tempo → reconecta. */
  staleMs?: number;
}

/** WebSocket com reconexão automática (espera crescente até 30 s) e detecção de conexão muda. */
export function openWs(url: string, o: Opts): Conn {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let lastMsg = Date.now();
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let staleTimer: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let openTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => {
    clearInterval(pingTimer);
    clearInterval(staleTimer);
  };

  const connect = () => {
    if (closed) return;
    o.onStatus?.(retry === 0 ? 'conectando' : 'reconectando');
    const sock = new WebSocket(url);
    ws = sock;
    // Aperto de mão travado (acontece com proxy/rede ruim): desiste em 10 s e tenta de novo.
    openTimer = setTimeout(() => sock.readyState === WebSocket.CONNECTING && sock.close(), 10000);
    ws.onopen = () => {
      clearTimeout(openTimer);
      lastMsg = Date.now();
      retry = 0;
      o.onStatus?.('ao vivo');
      o.onOpen?.(ws!);
      if (o.ping) pingTimer = setInterval(() => ws?.readyState === 1 && ws.send(o.ping!()), o.pingMs ?? 20000);
      staleTimer = setInterval(() => {
        if (Date.now() - lastMsg > (o.staleMs ?? 30000)) ws?.close();
      }, 5000);
    };
    ws.onmessage = (e) => {
      lastMsg = Date.now();
      const raw = String(e.data);
      let data: unknown = raw;
      try {
        data = JSON.parse(raw);
      } catch {
        /* ex: "pong" da OKX */
      }
      o.onMessage(data, raw, ws!);
    };
    ws.onclose = () => {
      clearTimers();
      clearTimeout(openTimer);
      if (closed) return;
      retry++;
      o.onStatus?.('reconectando');
      retryTimer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(retry, 5)));
    };
    ws.onerror = () => ws?.close();
  };

  connect();
  return {
    close() {
      closed = true;
      clearTimers();
      clearTimeout(retryTimer);
      clearTimeout(openTimer);
      ws?.close();
      o.onStatus?.('parado');
    },
  };
}
