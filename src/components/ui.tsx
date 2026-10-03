import { useEffect, useRef } from 'react';
import { beep, notify } from '../alerts';
import { Help } from './Help';

/** Formato comum aos sinais de spot x futuros e spot x spot. */
export interface AnySignal {
  level: 'verde' | 'amarelo' | 'azul' | 'vermelho';
  title: string;
  message: string;
  reasons: string[];
}

export function useSignalAlert(label: string, signal: AnySignal | undefined, on: boolean) {
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!signal) return;
    const key = signal.level + signal.title;
    if (last.current !== undefined && last.current !== key && on && signal.level !== 'amarelo') {
      beep(signal.level === 'vermelho' ? 3 : 2);
      notify(`${label}: ${signal.title}`, signal.message);
    }
    last.current = key;
  }, [signal?.level, signal?.title, on]); // eslint-disable-line react-hooks/exhaustive-deps
}


export const cls = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

export function Status({ s }: { s: string }) {
  return <span className={`status status-${s.replace(' ', '-')}`}>● {s}</span>;
}

export function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="box">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Row({ l, r, help, cls: c = '', strong }: { l: string; r: string; help?: Parameters<typeof Help>[0]['k']; cls?: string; strong?: boolean }) {
  return (
    <div className={`kv ${strong ? 'strong' : ''}`}>
      <span>
        {l} {help && <Help k={help} />}
      </span>
      <span className={c}>{r}</span>
    </div>
  );
}

export function SignalCard({ s }: { s: AnySignal }) {
  const icon = { verde: '🟢', amarelo: '🟡', azul: '🔵', vermelho: '🔴' }[s.level];
  return (
    <div className={`signal signal-${s.level}`} key={s.level}>
      <div className="signal-title">
        {icon} {s.title}
      </div>
      <div>{s.message}</div>
      {s.reasons.length > 0 && (
        <ul>
          {s.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

