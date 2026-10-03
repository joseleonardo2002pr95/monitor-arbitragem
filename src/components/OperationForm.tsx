import { useState } from 'react';
import { spreadPct } from '../core/calc';
import type { ExchangeId, Operation } from '../core/types';
import { ALL_EXCHANGES, EXCHANGES, FUTURES_EXCHANGES } from '../exchanges';
import { fmtPct, parseNum } from '../format';
import { Help } from './Help';


const toLocalInput = (t: number) => {
  const d = new Date(t - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

interface Props {
  initial?: Operation; // presente = editar configurações
  onSave: (op: Operation) => void;
  onCancel: () => void;
}

export function OperationForm({ initial, onSave, onCancel }: Props) {
  const editing = !!initial;
  const [f, setF] = useState(() => ({
    base: initial?.base ?? '',
    quote: initial?.quote ?? 'USDT',
    spotExchange: initial?.spotExchange ?? ('gate' as ExchangeId),
    futExchange: initial?.futExchange ?? ('binance' as ExchangeId),
    spotSymbolOverride: initial?.spotSymbolOverride ?? '',
    futSymbolOverride: initial?.futSymbolOverride ?? '',
    spotPrice: '',
    futPrice: '',
    amount: '',
    amountMode: 'moedas' as 'moedas' | 'usdt',
    entryTime: toLocalInput(Date.now()),
    leverage: initial?.leverage ?? 2,
    spotFeePct: String(((initial?.spotFeeRate ?? EXCHANGES.gate.spotFee) * 100).toFixed(3)),
    futFeePct: String(((initial?.futFeeRate ?? EXCHANGES.binance.futFee) * 100).toFixed(3)),
    targetExitSpreadPct: String(initial?.targetExitSpreadPct ?? 0.1),
    widenAlertPp: String(initial?.widenAlertPp ?? 0.5),
    maxDcaCount: String(initial?.maxDcaCount ?? 2),
    liqPriceManual: initial?.liqPriceManual ? String(initial.liqPriceManual) : '',
    maintMarginPct: String(((initial?.maintMarginRate ?? 0.01) * 100).toFixed(2)),
    fundingManual: initial?.fundingManual !== undefined ? String(initial.fundingManual) : '',
    notes: initial?.notes ?? '',
  }));
  const [error, setError] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const setExchange = (side: 'spot' | 'fut', id: ExchangeId) => {
    if (side === 'spot') setF((s) => ({ ...s, spotExchange: id, spotFeePct: (EXCHANGES[id].spotFee * 100).toFixed(3) }));
    else setF((s) => ({ ...s, futExchange: id, futFeePct: (EXCHANGES[id].futFee * 100).toFixed(3) }));
  };

  const sp = parseNum(f.spotPrice);
  const fp = parseNum(f.futPrice);
  const grossSpread = sp > 0 && fp > 0 ? spreadPct(sp, fp) : undefined;
  const roundTripFeesPct = 2 * (parseNum(f.spotFeePct) + parseNum(f.futFeePct));
  const netSpread = grossSpread !== undefined ? grossSpread - roundTripFeesPct : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const common = {
      base: f.base.trim().toUpperCase(),
      quote: f.quote.trim().toUpperCase(),
      spotExchange: f.spotExchange,
      futExchange: f.futExchange,
      spotSymbolOverride: f.spotSymbolOverride.trim() || undefined,
      futSymbolOverride: f.futSymbolOverride.trim() || undefined,
      leverage: f.leverage,
      spotFeeRate: parseNum(f.spotFeePct) / 100,
      futFeeRate: parseNum(f.futFeePct) / 100,
      targetExitSpreadPct: parseNum(f.targetExitSpreadPct),
      widenAlertPp: parseNum(f.widenAlertPp),
      maxDcaCount: Math.max(0, Math.round(parseNum(f.maxDcaCount))),
      liqPriceManual: f.liqPriceManual ? parseNum(f.liqPriceManual) : undefined,
      maintMarginRate: parseNum(f.maintMarginPct) / 100,
      fundingManual: f.fundingManual.trim() ? parseNum(f.fundingManual) : undefined,
      notes: f.notes.trim() || undefined,
    };
    const nums = [common.spotFeeRate, common.futFeeRate, common.targetExitSpreadPct, common.widenAlertPp, common.maintMarginRate];
    if (!common.base || !common.quote) return setError('Preencha a moeda e o par (ex: PUMPBTC / USDT).');
    if (nums.some((n) => Number.isNaN(n))) return setError('Algum número está inválido. Use vírgula ou ponto.');

    if (editing) return onSave({ ...initial!, ...common });

    const amount = parseNum(f.amount);
    if (!(sp > 0) || !(fp > 0) || !(amount > 0)) return setError('Preencha os preços de entrada e a quantidade.');
    const qty = f.amountMode === 'moedas' ? amount : amount / sp;
    const time = new Date(f.entryTime).getTime() || Date.now();
    onSave({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      status: 'aberta',
      ...common,
      spotFills: [{ price: sp, qty, time }],
      futFills: [{ price: fp, qty, time }],
    });
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{editing ? 'Editar configurações' : 'Nova operação'}</h2>

      {!editing && (
        <>
          <div className="row">
            <label>
              Moeda
              <input value={f.base} onChange={(e) => set('base', e.target.value)} placeholder="PUMPBTC" />
            </label>
            <label>
              Par
              <input value={f.quote} onChange={(e) => set('quote', e.target.value)} />
            </label>
          </div>
          <div className="row">
            <label>
              Corretora do SPOT (compra)
              <select value={f.spotExchange} onChange={(e) => setExchange('spot', e.target.value as ExchangeId)}>
                {ALL_EXCHANGES.map((id) => (
                  <option key={id} value={id}>{EXCHANGES[id].name}</option>
                ))}
              </select>
            </label>
            <label>
              Corretora do FUTURO (venda / short)
              <select value={f.futExchange} onChange={(e) => setExchange('fut', e.target.value as ExchangeId)}>
                {FUTURES_EXCHANGES.map((id) => (
                  <option key={id} value={id}>{EXCHANGES[id].name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label>
              Preço de compra no spot
              <input inputMode="decimal" value={f.spotPrice} onChange={(e) => set('spotPrice', e.target.value)} placeholder="0,008311" />
            </label>
            <label>
              Preço de venda no futuro
              <input inputMode="decimal" value={f.futPrice} onChange={(e) => set('futPrice', e.target.value)} placeholder="0,008350" />
            </label>
          </div>
          <div className="row">
            <label>
              Quantidade
              <input inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="2286" />
            </label>
            <label>
              Em
              <select value={f.amountMode} onChange={(e) => set('amountMode', e.target.value as 'moedas' | 'usdt')}>
                <option value="moedas">moedas</option>
                <option value="usdt">USDT (valor investido)</option>
              </select>
            </label>
            <label>
              Data/hora da entrada
              <input type="datetime-local" value={f.entryTime} onChange={(e) => set('entryTime', e.target.value)} />
            </label>
          </div>
          <p className="hint">A mesma quantidade é usada nas duas pontas. A data serve para buscar o funding recebido desde a entrada.</p>
        </>
      )}

      <label>
        Alavancagem do futuro: <b>{f.leverage}x</b> <Help k="alavancagem" />
        <input type="range" min={1} max={10} step={1} value={f.leverage} onChange={(e) => set('leverage', Number(e.target.value))} />
      </label>

      <div className="row">
        <label>
          Taxa spot (%) <Help k="taxas" />
          <input inputMode="decimal" value={f.spotFeePct} onChange={(e) => set('spotFeePct', e.target.value)} />
        </label>
        <label>
          Taxa futuro (%)
          <input inputMode="decimal" value={f.futFeePct} onChange={(e) => set('futFeePct', e.target.value)} />
        </label>
        <div className="presets">
          <button type="button" onClick={() => setF((s) => ({ ...s, spotFeePct: (EXCHANGES[s.spotExchange].spotFee * 100).toFixed(3), futFeePct: (EXCHANGES[s.futExchange].futFee * 100).toFixed(3) }))}>
            Taker (a mercado)
          </button>
          <button type="button" onClick={() => setF((s) => ({ ...s, spotFeePct: '0.080', futFeePct: '0.020' }))}>
            Maker (limite)
          </button>
        </div>
      </div>
      <p className="hint">Confira as taxas reais da sua conta: variam com o nível VIP e com desconto em token da corretora.</p>

      {!editing && (
        <div className={`result ${netSpread !== undefined && netSpread > 0 ? 'pos' : 'neg'}`}>
          Spread bruto: <b>{fmtPct(grossSpread)}</b> · Taxas ida+volta: <b>{fmtPct(roundTripFeesPct)}</b> · Spread líquido real:{' '}
          <b>{fmtPct(netSpread)}</b> <Help k="spread" />
          {netSpread !== undefined && netSpread <= 0 && <div>As taxas comem todo o spread. Sem convergência ou funding, essa entrada perde.</div>}
        </div>
      )}

      <h3>Regras de saída e risco</h3>
      <div className="row">
        <label>
          Spread-alvo de saída (%) <Help k="spreadSaida" />
          <input inputMode="decimal" value={f.targetExitSpreadPct} onChange={(e) => set('targetExitSpreadPct', e.target.value)} />
        </label>
        <label>
          Avisar se o spread alargar (p.p.)
          <input inputMode="decimal" value={f.widenAlertPp} onChange={(e) => set('widenAlertPp', e.target.value)} />
        </label>
        <label>
          Máximo de aumentos de mão <Help k="dca" />
          <input inputMode="numeric" value={f.maxDcaCount} onChange={(e) => set('maxDcaCount', e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          Preço de liquidação da corretora (opcional) <Help k="liquidacao" />
          <input inputMode="decimal" value={f.liqPriceManual} onChange={(e) => set('liqPriceManual', e.target.value)} placeholder="deixe vazio para estimar" />
        </label>
        <label>
          Margem de manutenção p/ estimar (%)
          <input inputMode="decimal" value={f.maintMarginPct} onChange={(e) => set('maintMarginPct', e.target.value)} />
        </label>
        <label>
          Funding recebido em USDT (opcional) <Help k="funding" />
          <input inputMode="decimal" value={f.fundingManual} onChange={(e) => set('fundingManual', e.target.value)} placeholder="vazio = buscar automático" />
        </label>
      </div>

      <details>
        <summary>Avançado: símbolo manual</summary>
        <p className="hint">Use só se o preço não carregar. Ex.: alguns futuros usam prefixo 1000 (1000PEPEUSDT).</p>
        <div className="row">
          <label>
            Símbolo spot
            <input value={f.spotSymbolOverride} onChange={(e) => set('spotSymbolOverride', e.target.value)} placeholder="automático" />
          </label>
          <label>
            Símbolo futuro
            <input value={f.futSymbolOverride} onChange={(e) => set('futSymbolOverride', e.target.value)} placeholder="automático" />
          </label>
        </div>
      </details>

      <label>
        Anotações
        <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
      </label>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary">{editing ? 'Salvar' : 'Começar a acompanhar'}</button>
        <button type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
