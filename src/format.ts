/** Preço com casas suficientes para moedas baratas (ex: 0,008311). */
export function fmtPrice(v: number | undefined): string {
  if (v === undefined || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  // Moedas muito baratas (ex.: 0,000001307): mostra 4 algarismos significativos.
  if (abs > 0 && abs < 0.01) return v.toLocaleString('pt-BR', { maximumSignificantDigits: 4, minimumSignificantDigits: 4 });
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits });
}

export const fmtUsd = (v: number | undefined) =>
  v === undefined || !isFinite(v) ? '—' : `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export const fmtPct = (v: number | undefined, d = 3) =>
  v === undefined || !isFinite(v) ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d })}%`;

export const fmtNum = (v: number, d = 4) => v.toLocaleString('pt-BR', { maximumFractionDigits: d });

export function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'agora';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
}

export function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

export const fmtDate = (t: number) => new Date(t).toLocaleString('pt-BR');

/** Aceita vírgula ou ponto como separador decimal. */
export const parseNum = (s: string) => Number(String(s).trim().replace(/\s/g, '').replace(',', '.'));
