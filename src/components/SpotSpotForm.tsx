import { useState } from 'react';
import type { ExchangeId, SpotSpotOp } from '../core/types';
import { ALL_EXCHANGES, EXCHANGES, fetchWithdrawFee, HAS_WITHDRAW_FEE_API } from '../exchanges';
import { fmtNum, parseNum } from '../format';
import { Help } from './Help';

interface Props {
  initial?: SpotSpotOp;
  onSave: (op: SpotSpotOp) => void;
  onCancel: () => void;
}

export function SpotSpotForm({ initial, onSave, onCancel }: Props) {
  const editing = !!initial;
  const [f, setF] = useState(() => ({
    base: initial?.base ?? '',
    quote: initial?.quote ?? 'USDT',
    buyExchange: initial?.buyExchange ?? ('lbank' as ExchangeId),
    sellExchange: initial?.sellExchange ?? ('gate' as ExchangeId),
    buySymbolOverride: initial?.buySymbolOverride ?? '',
    sellSymbolOverride: initial?.sellSymbolOverride ?? '',
    plannedUsdt: String(initial?.plannedUsdt ?? 10),
    buyFeePct: String(((initial?.buyFeeRate ?? EXCHANGES.lbank.spotFee) * 100).toFixed(3)),
    sellFeePct: String(((initial?.sellFeeRate ?? EXCHANGES.gate.spotFee) * 100).toFixed(3)),
    buyFeeInCoin: initial?.buyFeeInCoin ?? true,
    withdrawFeeCoins: initial ? String(initial.withdrawFeeCoins) : '',
    network: initial?.network ?? '',
    targetNetPct: String(initial?.targetNetPct ?? 1),
    notes: initial?.notes ?? '',
  }));
  const [feeOptions, setFeeOptions] = useState<{ chain: string; fee: number; min: number }[] | null>(null);
  const [feeMsg, setFeeMsg] = useState('');
  const [error, setError] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const lookupFee = async () => {
    setFeeMsg('Buscando…');
    try {
      const opts = await fetchWithdrawFee(f.buyExchange, f.base);
      setFeeOptions(opts);
      setFeeMsg(opts.length ? '' : 'Nenhuma rede de saque aberta encontrada para essa moeda.');
      if (opts.length === 1) setF((s) => ({ ...s, withdrawFeeCoins: String(opts[0].fee), network: opts[0].chain }));
    } catch (e) {
      setFeeMsg(`Não consegui buscar (${(e as Error).message}). Digite a taxa da tela de saque.`);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const op = {
      base: f.base.trim().toUpperCase(),
      quote: f.quote.trim().toUpperCase(),
      buyExchange: f.buyExchange,
      sellExchange: f.sellExchange,
      buySymbolOverride: f.buySymbolOverride.trim() || undefined,
      sellSymbolOverride: f.sellSymbolOverride.trim() || undefined,
      plannedUsdt: parseNum(f.plannedUsdt),
      buyFeeRate: parseNum(f.buyFeePct) / 100,
      sellFeeRate: parseNum(f.sellFeePct) / 100,
      buyFeeInCoin: f.buyFeeInCoin,
      withdrawFeeCoins: f.withdrawFeeCoins.trim() ? parseNum(f.withdrawFeeCoins) : 0,
      network: f.network.trim() || undefined,
      targetNetPct: parseNum(f.targetNetPct),
      notes: f.notes.trim() || undefined,
    };
    if (!op.base || !op.quote) return setError('Preencha a moeda e o par.');
    if (op.buyExchange === op.sellExchange) return setError('Escolha corretoras diferentes para compra e venda.');
    if ([op.plannedUsdt, op.buyFeeRate, op.sellFeeRate, op.withdrawFeeCoins, op.targetNetPct].some((n) => Number.isNaN(n)))
      return setError('Algum número está inválido. Use vírgula ou ponto.');
    onSave(editing ? { ...initial!, ...op } : { id: crypto.randomUUID(), createdAt: Date.now(), stage: 'observando', ...op });
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{editing ? 'Editar spot x spot' : 'Nova análise spot x spot'}</h2>
      <p className="hint">
        Compra numa corretora, transfere a moeda e vende em outra. Você pode só observar a diferença e depois registrar a compra.
      </p>
      <div className="row">
        <label>
          Moeda
          <input value={f.base} onChange={(e) => set('base', e.target.value)} placeholder="VON" disabled={editing} />
        </label>
        <label>
          Par
          <input value={f.quote} onChange={(e) => set('quote', e.target.value)} disabled={editing} />
        </label>
        <label>
          Valor planejado (USDT)
          <input inputMode="decimal" value={f.plannedUsdt} onChange={(e) => set('plannedUsdt', e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          COMPRAR em
          <select
            value={f.buyExchange}
            disabled={editing}
            onChange={(e) => {
              const id = e.target.value as ExchangeId;
              setF((s) => ({ ...s, buyExchange: id, buyFeePct: (EXCHANGES[id].spotFee * 100).toFixed(3), buyFeeInCoin: id === 'lbank' }));
              setFeeOptions(null);
            }}
          >
            {ALL_EXCHANGES.map((id) => (
              <option key={id} value={id}>{EXCHANGES[id].name}</option>
            ))}
          </select>
        </label>
        <label>
          VENDER em
          <select
            value={f.sellExchange}
            disabled={editing}
            onChange={(e) => {
              const id = e.target.value as ExchangeId;
              setF((s) => ({ ...s, sellExchange: id, sellFeePct: (EXCHANGES[id].spotFee * 100).toFixed(3) }));
            }}
          >
            {ALL_EXCHANGES.map((id) => (
              <option key={id} value={id}>{EXCHANGES[id].name}</option>
            ))}
          </select>
        </label>
      </div>

      <h3>Taxas</h3>
      <div className="row">
        <label>
          Taxa de compra (%) <Help k="taxas" />
          <input inputMode="decimal" value={f.buyFeePct} onChange={(e) => set('buyFeePct', e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={f.buyFeeInCoin} onChange={(e) => set('buyFeeInCoin', e.target.checked)} />
          Taxa de compra é descontada em moedas (você recebe menos moedas)
        </label>
        <label>
          Taxa de venda (%)
          <input inputMode="decimal" value={f.sellFeePct} onChange={(e) => set('sellFeePct', e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          Taxa de SAQUE (em moedas {f.base || ''}) <Help k="taxaSaque" />
          <input inputMode="decimal" value={f.withdrawFeeCoins} onChange={(e) => set('withdrawFeeCoins', e.target.value)} placeholder="ex: 152439,0243" />
        </label>
        <label>
          Rede
          <input value={f.network} onChange={(e) => set('network', e.target.value)} placeholder="ex: BEP20(BSC)" />
        </label>
        {HAS_WITHDRAW_FEE_API.includes(f.buyExchange) && (
          <div className="presets">
            <button type="button" onClick={lookupFee} disabled={!f.base.trim()}>
              Buscar taxa na {EXCHANGES[f.buyExchange].name}
            </button>
          </div>
        )}
      </div>
      {feeMsg && <p className="hint">{feeMsg}</p>}
      {feeOptions && feeOptions.length > 1 && (
        <div className="presets">
          {feeOptions.map((o) => (
            <button type="button" key={o.chain} onClick={() => setF((s) => ({ ...s, withdrawFeeCoins: String(o.fee), network: o.chain }))}>
              {o.chain}: {fmtNum(o.fee)} {f.base.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      <p className="hint">A taxa de saque é FIXA (não é %). Veja o valor na tela de saque da corretora de compra, na rede que vai usar.</p>

      <label>
        Lucro líquido mínimo para valer a pena (%)
        <input inputMode="decimal" value={f.targetNetPct} onChange={(e) => set('targetNetPct', e.target.value)} />
      </label>

      <details>
        <summary>Avançado: símbolo manual</summary>
        <div className="row">
          <label>
            Símbolo na compra
            <input value={f.buySymbolOverride} onChange={(e) => set('buySymbolOverride', e.target.value)} placeholder="automático" />
          </label>
          <label>
            Símbolo na venda
            <input value={f.sellSymbolOverride} onChange={(e) => set('sellSymbolOverride', e.target.value)} placeholder="automático" />
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
