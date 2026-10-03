import { useMemo, useState } from 'react';
import { analyzeOpportunity, buyCost, coinsAfterBuy, findBestSize, positionNow, sellProceeds, spotSpotSignal, type Opportunity } from '../core/spotspot';
import type { BookQuote, Level, SpotSpotOp, SpotSpotStage } from '../core/types';
import { EXCHANGES } from '../exchanges';
import { fmtDate, fmtDuration, fmtNum, fmtPct, fmtPrice, fmtUsd, parseNum } from '../format';
import { downloadFile } from '../storage';
import { useSpotPair, type SpotPair } from '../useSpotPair';
import { Box, cls, Row, SignalCard, Status, useSignalAlert } from './ui';

const STALE_MS = 10000;
const STAGES: SpotSpotStage[] = ['observando', 'comprado', 'em trânsito', 'na corretora de venda', 'vendido'];

interface Props {
  op: SpotSpotOp;
  alertsOn: boolean;
  onChange: (op: SpotSpotOp) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function SpotSpotLive({ op, alertsOn, onChange, onEdit, onDelete }: Props) {
  const m = useSpotPair(op);
  const [size, setSize] = useState(op.plannedUsdt || 10);
  const ready = m.a && m.b;
  const opp = ready ? analyzeOpportunity(op, m.a!, m.b!, op.stage === 'observando' ? size : op.plannedUsdt) : undefined;
  const pos = ready ? positionNow(op, m.a!, m.b!) : undefined;
  const signal = opp ? spotSpotSignal(op, opp, pos) : undefined;
  useSignalAlert(op.base, signal, alertsOn);

  const now = Date.now();
  const stale = ready && (now - m.a!.ts > STALE_MS || now - m.b!.ts > STALE_MS);
  const A = EXCHANGES[op.buyExchange].name;
  const B = EXCHANGES[op.sellExchange].name;
  const simOpp = ready ? analyzeOpportunity(op, m.a!, m.b!, size) : undefined;

  return (
    <section className="card op">
      <header className="op-head">
        <div>
          <h2>
            {op.base}/{op.quote} · {A} → {B}
          </h2>
          <div className="muted">
            Compra {A} <code>{m.buySymbol}</code> <Status s={m.aStatus} /> · Venda {B} <code>{m.sellSymbol}</code> <Status s={m.bStatus} />
            {op.network && <> · rede {op.network}</>}
          </div>
        </div>
        <div className="actions">
          <button onClick={onEdit}>Editar</button>
          <button onClick={() => exportJson(op)}>Exportar JSON</button>
          <button onClick={() => printSummary(op, m)}>Imprimir / PDF</button>
          <button className="danger" onClick={onDelete}>Excluir</button>
        </div>
      </header>

      <Stepper stage={op.stage} />

      {!ready && <p className="warn">Carregando preços… Se não carregar, o par pode não existir numa das corretoras (use Editar → Avançado).</p>}
      {stale && <p className="warn">Preço sem atualizar há mais de 10 s. Reconectando automaticamente.</p>}

      {opp && signal && (
        <>
          <SignalCard s={signal} />
          <div className="grid">
            <Box title="Preços ao vivo">
              <Row l={`${A} (compra) bid / ask`} r={`${fmtPrice(m.a!.bid)} / ${fmtPrice(m.a!.ask)}`} help="bidAsk" />
              <Row l={`${B} (venda) bid / ask`} r={`${fmtPrice(m.b!.bid)} / ${fmtPrice(m.b!.ask)}`} />
              <Row l="Moedas no melhor preço de compra" r={m.a!.askQty ? fmtNum(m.a!.askQty, 0) : '—'} help="topoLivro" />
              <Row l="Moedas no melhor preço de venda" r={m.b!.bidQty ? fmtNum(m.b!.bidQty, 0) : '—'} />
              <Row
                l="Largura do livro compra / venda"
                r={`${fmtPct(opp.buyBookPct)} / ${fmtPct(opp.sellBookPct)}`}
                cls={opp.buyBookPct > 0.5 || opp.sellBookPct > 0.5 ? 'warn' : ''}
              />
            </Box>
            <Box title="Diferença entre as corretoras">
              <Row l={`Bruta ${A} → ${B}`} r={fmtPct(opp.grossPct)} cls={cls(opp.grossPct)} help="diferencaBruta" strong />
              <Row
                l={`Real p/ $${fmtNum(opp.sizeUsdt, 2)} (preço médio)`}
                r={opp.depthUsed ? fmtPct(opp.realGrossPct) : '— (sem profundidade)'}
                cls={cls(opp.realGrossPct)}
                help="precoMedio"
              />
              <Row l={`Sentido contrário ${B} → ${A}`} r={fmtPct(opp.reversePct)} cls={cls(opp.reversePct)} help="sentidoContrario" />
              <Row l="Taxa de saque (fixa)" r={`${fmtNum(op.withdrawFeeCoins)} ${op.base} ≈ $${fmtNum(opp.withdrawFeeUsdt, 4)}`} help="taxaSaque" />
              <Row l="Tamanho mínimo p/ compensar" r={isFinite(opp.minSizeUsdt) ? `$${fmtNum(opp.minSizeUsdt, 2)}` : 'nunca (diferença < taxas)'} help="tamanhoMinimo" />
            </Box>
            {pos && <PositionBox op={op} pos={pos} A={A} B={B} />}
          </div>
          <div className="grid">
            <BookTable title={`Vendedores na ${A} (você compra aqui)`} levels={m.a!.asks} qty={op.stage === 'observando' ? simOpp?.qtyBuy : undefined} />
            <BookTable title={`Compradores na ${B} (você vende aqui)`} levels={m.b!.bids} qty={pos ? pos.coins : simOpp?.coinsArriving} />
          </div>
          {simOpp && (op.stage === 'observando' || op.stage === 'comprado') && (
            <Simulator op={op} size={size} setSize={setSize} o={simOpp} a={m.a!} b={m.b!} />
          )}
        </>
      )}

      {/* key: cada etapa começa com o formulário limpo */}
      <StageActions key={op.stage} op={op} a={m.a} b={m.b} size={size} onChange={onChange} />
      {op.notes && <p className="muted">📝 {op.notes}</p>}
    </section>
  );
}

function Stepper({ stage }: { stage: SpotSpotStage }) {
  const i = STAGES.indexOf(stage);
  return (
    <div className="stepper">
      {STAGES.map((s, j) => (
        <span key={s} className={j < i ? 'done' : j === i ? 'now' : ''}>
          {j + 1}. {s}
        </span>
      ))}
    </div>
  );
}

function PositionBox({ op, pos, A, B }: { op: SpotSpotOp; pos: NonNullable<ReturnType<typeof positionNow>>; A: string; B: string }) {
  return (
    <Box title="Sua posição">
      <Row l="Custo (USDT que saiu do bolso)" r={`$${fmtNum(pos.cost, 4)}`} />
      <Row l={pos.coinsConfirmed ? `Moedas na ${B}` : `Moedas que devem chegar na ${B}`} r={`${fmtNum(pos.coins, 2)}${pos.coinsConfirmed ? '' : ' (estimado)'}`} />
      <Row l={`Vender TUDO a mercado agora na ${B}`} r={`${fmtUsd(pos.netSell)} (${fmtPct(pos.netSellPct)})`} cls={cls(pos.netSell)} strong help="precoMedio" />
      <Row l="…pelo melhor preço (o que parece)" r={fmtUsd(pos.topNetSell)} cls={cls(pos.topNetSell)} />
      <Row l="Preço médio real da venda" r={`${fmtPrice(pos.sell.avgPrice)} (${pos.sell.levelsUsed} nível${pos.sell.levelsUsed > 1 ? 'is' : ''}${pos.sell.complete ? '' : ', livro curto'})`} cls={pos.sell.complete ? '' : 'warn'} />
      {pos.coinsAtBestBid !== undefined && <Row l="Moedas que cabem no melhor preço" r={fmtNum(pos.coinsAtBestBid, 0)} help="topoLivro" />}
      {(op.stage === 'comprado' || op.stage === 'observando') && <Row l={`Se desistir e vender na ${A}`} r={fmtUsd(pos.netAbort)} cls={cls(pos.netAbort)} />}
      <Row l={`Preço médio de empate na ${B}`} r={fmtPrice(pos.breakevenSellPrice)} help="empateVenda" />
      <Row l={`Ordem limite p/ o seu alvo (${fmtPct(op.targetNetPct)})`} r={fmtPrice(pos.targetSellPrice)} />
      <Row l="Quanto o preço médio pode cair até o empate" r={fmtPct(pos.cushionPct)} cls={cls(pos.cushionPct)} help="transito" />
      {op.withdrawTime && op.stage === 'em trânsito' && <Row l="Em trânsito há" r={fmtDuration(Date.now() - op.withdrawTime)} />}
    </Box>
  );
}

function Simulator({
  op,
  size,
  setSize,
  o,
  a,
  b,
}: {
  op: SpotSpotOp;
  size: number;
  setSize: (n: number) => void;
  o: Opportunity;
  a: BookQuote;
  b: BookQuote;
}) {
  const max = Math.max(500, op.plannedUsdt * 5);
  // Recalcula o melhor tamanho no máximo 1x por segundo (o livro muda 10x/s).
  const tick = Math.floor(Date.now() / 1000);
  const best = useMemo(() => findBestSize(op, a, b, max), [op, max, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="box">
      <h3>Simulador: "e se eu fizer com $X agora?"</h3>
      <div className="row">
        <label>
          Valor (USDT): <b>${fmtNum(size, 2)}</b>
          <input type="range" min={1} max={max} step={1} value={Math.min(size, max)} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
        <label style={{ maxWidth: 160 }}>
          ou digite
          <input inputMode="decimal" value={size} onChange={(e) => setSize(parseNum(e.target.value) || 0)} />
        </label>
      </div>
      {o.depthUsed && best.bestNetUsdt > 0 && (
        <p>
          💡 Melhor valor agora: <b>${fmtNum(best.bestUsdt, 2)}</b> → {fmtUsd(best.bestNetUsdt)} ({fmtPct(best.bestNetPct)})
          {best.minProfitUsdt !== undefined && best.maxProfitUsdt !== undefined && (
            <span className="muted"> · dá lucro entre ${fmtNum(best.minProfitUsdt, 2)} e ${fmtNum(best.maxProfitUsdt, 2)}</span>
          )}{' '}
          <button className="small" onClick={() => setSize(Math.round(best.bestUsdt * 100) / 100)}>
            usar
          </button>
        </p>
      )}
      {o.depthUsed && best.bestNetUsdt <= 0 && <p className="warn">Nenhum valor dá lucro agora com o livro atual.</p>}
      <div className="kv-grid">
        <Row l="Moedas compradas" r={fmtNum(o.qtyBuy, 2)} />
        <Row l="Moedas que chegam (após taxas)" r={fmtNum(o.coinsArriving, 2)} />
        <Row
          l="Preço médio de compra"
          r={`${fmtPrice(o.buy.avgPrice)} (+${fmtPct(o.buySlipPct)}, ${o.buy.levelsUsed} nív.)`}
          cls={o.buy.complete ? (o.buySlipPct > 0.5 ? 'warn' : '') : 'neg'}
          help="precoMedio"
        />
        <Row
          l="Preço médio de venda"
          r={`${fmtPrice(o.sell.avgPrice)} (−${fmtPct(o.sellSlipPct)}, ${o.sell.levelsUsed} nív.)`}
          cls={o.sell.complete ? (o.sellSlipPct > 0.5 ? 'warn' : '') : 'neg'}
        />
        <Row l="USDT ao vender" r={`$${fmtNum(o.proceeds, 4)}`} />
        <Row l="Lucro líquido REAL" r={`${fmtUsd(o.netUsdt)} (${fmtPct(o.netPct)})`} cls={cls(o.netUsdt)} strong />
        <Row l="…pelo melhor preço (o que parece)" r={`${fmtUsd(o.topNetUsdt)} (${fmtPct(o.topNetPct)})`} cls={cls(o.topNetUsdt)} />
      </div>
      {(!o.buy.complete || !o.sell.complete) && (
        <p className="warn small">O livro carregado não tem quantidade para esse valor: o resultado real seria ainda pior.</p>
      )}
      <p className="muted small">
        {o.depthUsed
          ? 'Calcula uma ordem a mercado "comendo" o livro nível por nível nas duas corretoras. Ordem limite pode sair melhor, mas pode não executar.'
          : 'Esta corretora não mandou profundidade: o cálculo usa só o melhor preço e pode ser otimista.'}
      </p>
    </div>
  );
}

/** Mostra os primeiros níveis do livro e até onde a SUA quantidade chega. */
function BookTable({ title, levels, qty }: { title: string; levels?: Level[]; qty?: number }) {
  if (!levels?.length) return null;
  let acc = 0;
  let accUsdt = 0;
  const rows = levels.slice(0, 12).map(([p, q]) => {
    const before = acc;
    acc += q;
    accUsdt += p * q;
    const reach = qty === undefined ? 'none' : before >= qty ? 'none' : acc <= qty ? 'full' : 'part';
    return { p, q, accUsdt, reach };
  });
  return (
    <div className="box">
      <h3>{title}</h3>
      <table className="book">
        <thead>
          <tr>
            <th>Preço</th>
            <th>Moedas</th>
            <th>US$ acumulado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`reach-${r.reach}`}>
              <td>{fmtPrice(r.p)}</td>
              <td>{fmtNum(r.q, 0)}</td>
              <td>${fmtNum(r.accUsdt, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {qty !== undefined && <p className="muted small">Destacado: os níveis que a sua quantidade ({fmtNum(qty, 0)}) usaria a mercado.</p>}
    </div>
  );
}

function StageActions({ op, a, b, size, onChange }: { op: SpotSpotOp; a?: BookQuote; b?: BookQuote; size: number; onChange: (op: SpotSpotOp) => void }) {
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const field = (k: string, label: string) => (
    <label>
      {label}
      <input value={form![k]} onChange={(e) => setForm({ ...form!, [k]: e.target.value })} />
    </label>
  );
  const cancel = <button onClick={() => setForm(null)}>Cancelar</button>;

  if (op.stage === 'observando') {
    if (!form)
      return (
        <button className="primary" disabled={!a} onClick={() => setForm({ price: String(a!.ask), qty: String(+(size / a!.ask).toFixed(4)) })}>
          Registrar compra que eu fiz
        </button>
      );
    const price = parseNum(form.price);
    const qty = parseNum(form.qty);
    return (
      <div className="box">
        <h3>Registrar compra</h3>
        <div className="row">
          {field('price', 'Preço médio pago')}
          {field('qty', 'Quantidade comprada (antes da taxa)')}
        </div>
        {price > 0 && qty > 0 && (
          <p className="muted small">
            Custo: ${fmtNum(buyCost(price, qty, op), 4)} · moedas após a taxa de compra: {fmtNum(coinsAfterBuy(qty, op), 2)}
          </p>
        )}
        <div className="actions">
          <button
            className="primary"
            disabled={!(price > 0 && qty > 0)}
            onClick={() => onChange({ ...op, stage: 'comprado', plannedUsdt: buyCost(price, qty, op), buy: { price, qty, time: Date.now() } })}
          >
            Salvar
          </button>
          {cancel}
        </div>
      </div>
    );
  }

  if (op.stage === 'comprado')
    return (
      <div className="actions">
        <button className="primary" onClick={() => onChange({ ...op, stage: 'em trânsito', withdrawTime: Date.now() })}>
          Já fiz o saque (moedas em trânsito)
        </button>
        <SellButton op={op} b={a} label="Desisti: vendi de volta na corretora de compra" onChange={onChange} abort />
      </div>
    );

  if (op.stage === 'em trânsito') {
    const est = coinsAfterBuy(op.buy!.qty, op) - op.withdrawFeeCoins;
    if (!form) return <button className="primary" onClick={() => setForm({ qty: String(+est.toFixed(4)) })}>As moedas chegaram</button>;
    const qty = parseNum(form.qty);
    return (
      <div className="box">
        <h3>Moedas creditadas</h3>
        <div className="row">{field('qty', 'Quantidade creditada (veja no histórico de depósito)')}</div>
        {qty > 0 && Math.abs(qty - est) / est > 0.001 && <p className="warn small">Diferente do esperado ({fmtNum(est, 2)}). Confira a taxa de saque.</p>}
        <div className="actions">
          <button className="primary" disabled={!(qty > 0)} onClick={() => onChange({ ...op, stage: 'na corretora de venda', received: { qty, time: Date.now() } })}>
            Salvar
          </button>
          {cancel}
        </div>
      </div>
    );
  }

  if (op.stage === 'na corretora de venda') return <SellButton op={op} b={b} label="Registrar venda" onChange={onChange} />;

  // vendido
  return (
    <div className="actions">
      <button onClick={() => onChange({ ...op, stage: 'na corretora de venda', closed: undefined })}>Reabrir</button>
    </div>
  );
}

function SellButton({ op, b, label, onChange, abort }: { op: SpotSpotOp; b?: BookQuote; label: string; onChange: (op: SpotSpotOp) => void; abort?: boolean }) {
  const coinsDefault = abort ? coinsAfterBuy(op.buy!.qty, op) : op.received?.qty ?? coinsAfterBuy(op.buy!.qty, op) - op.withdrawFeeCoins;
  const feeRate = abort ? op.buyFeeRate : op.sellFeeRate;
  const [v, setV] = useState<{ price: string; qty: string; proceeds: string } | null>(null);
  if (!v)
    return (
      <button
        className={abort ? '' : 'primary'}
        onClick={() => {
          const price = b?.bid ?? 0;
          setV({ price: String(price), qty: String(+coinsDefault.toFixed(4)), proceeds: (coinsDefault * price * (1 - feeRate)).toFixed(4) });
        }}
      >
        {label}
      </button>
    );
  const proceeds = parseNum(v.proceeds);
  const cost = buyCost(op.buy!.price, op.buy!.qty, op);
  const net = proceeds - cost;
  const recalc = (price: string, qty: string) =>
    setV({ price, qty, proceeds: sellProceeds(parseNum(price), parseNum(qty), { ...op, sellFeeRate: feeRate }).toFixed(4) });
  return (
    <div className="box">
      <h3>{label}</h3>
      <div className="row">
        <label>
          Preço médio de venda
          <input value={v.price} onChange={(e) => recalc(e.target.value, v.qty)} />
        </label>
        <label>
          Moedas vendidas
          <input value={v.qty} onChange={(e) => recalc(v.price, e.target.value)} />
        </label>
        <label>
          USDT recebido (líquido)
          <input value={v.proceeds} onChange={(e) => setV({ ...v, proceeds: e.target.value })} />
        </label>
      </div>
      <p>
        Resultado: <b className={cls(net)}>{fmtUsd(net)}</b> ({fmtPct(cost > 0 ? (net / cost) * 100 : 0)})
      </p>
      <div className="actions">
        <button
          className="primary"
          disabled={!(proceeds > 0)}
          onClick={() =>
            onChange({
              ...op,
              stage: 'vendido',
              closed: { time: Date.now(), sellPrice: parseNum(v.price), qtySold: parseNum(v.qty), proceeds, netPnl: net, netPct: cost > 0 ? (net / cost) * 100 : 0 },
            })
          }
        >
          Confirmar
        </button>
        <button onClick={() => setV(null)}>Cancelar</button>
      </div>
    </div>
  );
}

function exportJson(op: SpotSpotOp) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  downloadFile(`spotspot-${op.base}-${stamp}.json`, JSON.stringify({ exportadoEm: new Date().toISOString(), operacaoSpotSpot: op }, null, 2));
}

function printSummary(op: SpotSpotOp, m: SpotPair) {
  const w = window.open('', '_blank');
  if (!w) return alert('Libere pop-ups para imprimir o resumo.');
  const rows: [string, string][] = [
    ['Moeda', `${op.base}/${op.quote}`],
    ['Compra', `${EXCHANGES[op.buyExchange].name} (${m.buySymbol})`],
    ['Venda', `${EXCHANGES[op.sellExchange].name} (${m.sellSymbol})`],
    ['Rede', op.network ?? '—'],
    ['Etapa', op.stage],
    ['Taxa de saque', `${fmtNum(op.withdrawFeeCoins)} ${op.base}`],
  ];
  if (op.buy) rows.push(['Compra registrada', `${fmtNum(op.buy.qty)} a ${fmtPrice(op.buy.price)} = $${fmtNum(buyCost(op.buy.price, op.buy.qty, op), 4)} (${fmtDate(op.buy.time)})`]);
  if (op.received) rows.push(['Moedas creditadas', fmtNum(op.received.qty, 4)]);
  if (op.closed) rows.push(['Venda', `${fmtNum(op.closed.qtySold)} a ${fmtPrice(op.closed.sellPrice)} → $${fmtNum(op.closed.proceeds, 4)}`], ['Resultado', `${fmtUsd(op.closed.netPnl)} (${fmtPct(op.closed.netPct)})`]);
  if (m.a && m.b) {
    const o = analyzeOpportunity(op, m.a, m.b, op.plannedUsdt);
    rows.push(['Diferença bruta agora', fmtPct(o.grossPct)]);
  }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Resumo ${op.base}</title>
    <style>body{font-family:system-ui;padding:24px}td{padding:6px 12px;border-bottom:1px solid #ddd}</style>
    <h1>Spot x Spot: ${op.base}</h1><p>Gerado em ${fmtDate(Date.now())}</p>
    <table>${rows.map(([a, b]) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`).join('')}</table>
    ${op.notes ? `<p>Anotações: ${op.notes.replace(/</g, '&lt;')}</p>` : ''}`);
  w.document.close();
  w.focus();
  w.print();
}
