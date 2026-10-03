import { useMemo, useState } from 'react';
import { computeSnapshot, futExitLimitPrice, simulateDca, totalQty, type Snapshot } from '../core/calc';
import { computeSignal, LIQ_DANGER_PCT } from '../core/signal';
import type { BookQuote, Operation } from '../core/types';
import { EXCHANGES } from '../exchanges';
import { fmtCountdown, fmtDate, fmtDuration, fmtNum, fmtPct, fmtPrice, fmtUsd, parseNum } from '../format';
import { downloadFile } from '../storage';
import { useLiveMarket, type LiveMarket } from '../useLiveMarket';
import { Box, cls, Row, SignalCard, Status, useSignalAlert } from './ui';
import { Help } from './Help';

const STALE_MS = 10000;

interface Props {
  op: Operation;
  alertsOn: boolean;
  onChange: (op: Operation) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function LiveOperation({ op, alertsOn, onChange, onEdit, onDelete }: Props) {
  const m = useLiveMarket(op);
  const dcaCount = Math.max(0, op.spotFills.length - 1);
  const ready = m.spot && m.fut;

  const snap = ready ? computeSnapshot(op, m.spot!, m.fut!, m.funding.value, m.info.mark) : undefined;
  const signal = snap ? computeSignal(op, snap, m.info.fundingRate, dcaCount) : undefined;

  useSignalAlert(op.base, signal, alertsOn);

  const now = Date.now();
  const stale = ready && (now - m.spot!.ts > STALE_MS || now - m.fut!.ts > STALE_MS);
  const opened = Math.min(...op.spotFills.map((f) => f.time));

  return (
    <section className="card op">
      <header className="op-head">
        <div>
          <h2>
            {op.base}/{op.quote}
          </h2>
          <div className="muted">
            Spot {EXCHANGES[op.spotExchange].name} <code>{m.spotSymbol}</code> <Status s={m.spotStatus} /> · Futuro{' '}
            {EXCHANGES[op.futExchange].name} <code>{m.futSymbol}</code> <Status s={m.futStatus} /> · {op.leverage}x · aberta há{' '}
            {fmtDuration(now - opened)}
          </div>
        </div>
        <div className="actions">
          <button onClick={onEdit}>Editar</button>
          <button onClick={() => exportJson(op, snap)}>Exportar JSON</button>
          <button onClick={() => printSummary(op, snap, m)}>Imprimir / PDF</button>
          <button className="danger" onClick={onDelete}>Excluir</button>
        </div>
      </header>

      {!ready && (
        <p className="warn">
          Carregando preços… Se não carregar em alguns segundos, o símbolo pode estar diferente nessa corretora (use Editar → Avançado)
          ou o par não existe lá.
        </p>
      )}
      {stale && <p className="warn">Preço sem atualizar há mais de 10 s. A conexão pode ter caído; reconectando automaticamente.</p>}

      {snap && signal && (
        <>
          <SignalCard s={signal} />

          <div className="grid">
            <Box title="Preços ao vivo">
              <Row l="Spot bid / ask" r={`${fmtPrice(m.spot!.bid)} / ${fmtPrice(m.spot!.ask)}`} help="bidAsk" />
              <Row l="Futuro bid / ask" r={`${fmtPrice(m.fut!.bid)} / ${fmtPrice(m.fut!.ask)}`} />
              <Row l="Largura do livro spot / futuro" r={`${fmtPct(snap.spotBookPct)} / ${fmtPct(snap.futBookPct)}`} cls={snap.spotBookPct > 0.5 || snap.futBookPct > 0.5 ? 'warn' : ''} />
              <Row l="Mark / índice" r={`${fmtPrice(m.info.mark)} / ${fmtPrice(m.info.index)}`} help="mark" />
              <Row l="Preço médio spot / futuro" r={`${fmtPrice(snap.avgSpot)} / ${fmtPrice(snap.avgFut)}`} />
              <Row l="Quantidade spot / futuro" r={`${fmtNum(snap.qtySpot)} / ${fmtNum(snap.qtyFut)}`} />
            </Box>

            <Box title="Spreads">
              <Row l="Entrada (seu médio)" r={fmtPct(snap.entrySpreadPct)} help="spreadEntrada" />
              <Row l="Saída agora (melhor preço)" r={fmtPct(snap.exitSpreadPct)} help="spreadSaida" />
              {snap.spotDepthUsed && (
                <Row
                  l={`Saída REAL (spot em ${snap.spotSellLevels} nível${snap.spotSellLevels > 1 ? 'is' : ''})`}
                  r={fmtPct(snap.realExitSpreadPct)}
                  help="precoMedio"
                  cls={snap.spotSellComplete ? '' : 'warn'}
                  strong
                />
              )}
              <Row
                l="Variação desde a entrada"
                r={`${snap.exitSpreadPct - snap.entrySpreadPct >= 0 ? '+' : ''}${fmtNum(snap.exitSpreadPct - snap.entrySpreadPct, 3)} p.p.`}
                cls={snap.exitSpreadPct > snap.entrySpreadPct ? 'neg' : 'pos'}
              />
              <Row l="Empate (zero a zero)" r={fmtPct(snap.breakevenExitSpreadPct)} help="empate" />
              <Row l="Seu alvo" r={fmtPct(op.targetExitSpreadPct)} />
              <Row l="Abrir/aumentar agora" r={fmtPct(snap.openSpreadPct)} help="spreadAbertura" />
            </Box>

            <Box title="Resultado se fechar agora">
              <Row l="Ponta spot" r={fmtUsd(snap.spotPnl)} cls={cls(snap.spotPnl)} help="pnl" />
              <Row l="Ponta futuro" r={fmtUsd(snap.futPnl)} cls={cls(snap.futPnl)} />
              <Row l="Taxas (entrada + saída)" r={fmtUsd(-(snap.entryFees + snap.exitFees))} cls="neg" help="taxas" />
              <Row l={`Funding (${m.funding.source})`} r={fmtUsd(snap.funding)} cls={cls(snap.funding)} help="funding" />
              <Row l="LÍQUIDO" r={`${fmtUsd(snap.netPnl)} (${fmtPct(snap.netPnlPct)})`} cls={cls(snap.netPnl)} strong />
              <Row l="Valor investido no spot" r={`$${fmtNum(snap.notional, 2)}`} />
            </Box>

            <FundingBox op={op} m={m} snap={snap} />
          </div>

          <ExitHelper op={op} spot={m.spot!} />
          <LiquidationBar snap={snap} leverage={op.leverage} />
          <DcaSimulator op={op} spot={m.spot!} fut={m.fut!} snap={snap} dcaCount={dcaCount} onChange={onChange} />
        </>
      )}

      <Fills op={op} onChange={onChange} />
      {op.notes && <p className="muted">📝 {op.notes}</p>}
      <CloseOperation op={op} spot={m.spot} fut={m.fut} funding={m.funding.value} mark={m.info.mark} onChange={onChange} />
    </section>
  );
}

// ---------------------------------------------------------------------------

function FundingBox({ op, m, snap }: { op: Operation; m: LiveMarket; snap: Snapshot }) {
  const rate = m.info.fundingRate;
  const nextPay = rate !== undefined && m.info.mark ? rate * snap.qtyFut * m.info.mark : undefined;
  const intervals = m.funding.events.length >= 2 ? m.funding.events[m.funding.events.length - 1].time - m.funding.events[m.funding.events.length - 2].time : undefined;
  return (
    <Box title="Funding">
      <Row l="Taxa do período atual" r={rate !== undefined ? fmtPct(rate * 100, 4) : '—'} cls={rate !== undefined ? cls(rate) : ''} help="funding" />
      <Row l="Próximo pagamento (estimado)" r={nextPay !== undefined ? fmtUsd(nextPay) : '—'} cls={nextPay !== undefined ? cls(nextPay) : ''} />
      <Row l="Em" r={m.info.nextFundingTime ? fmtCountdown(m.info.nextFundingTime - Date.now()) : '—'} />
      {intervals && <Row l="Intervalo" r={`a cada ${Math.round(intervals / 3600000)}h`} />}
      <Row l="Pagamentos desde a entrada" r={String(m.funding.events.length)} />
      <Row l="Acumulado" r={fmtUsd(m.funding.value)} cls={cls(m.funding.value)} />
      {m.funding.source === 'indisponível' && (
        <p className="warn small">
          Não consegui buscar o histórico ({m.funding.error}). Digite o funding recebido em Editar.
        </p>
      )}
      {m.funding.source === 'manual' && <p className="muted small">Usando o valor digitado por você.</p>}
      {op.fundingManual === undefined && (
        <button className="small" onClick={m.refreshFunding}>
          Atualizar histórico
        </button>
      )}
    </Box>
  );
}

function ExitHelper({ op, spot }: { op: Operation; spot: BookQuote }) {
  const limit = futExitLimitPrice(spot.bid, op.targetExitSpreadPct);
  return (
    <div className="box">
      <h3>Saída com ordem limite</h3>
      <p>
        Com o spot em <b>{fmtPrice(spot.bid)}</b> (bid), para sair no seu alvo de {fmtPct(op.targetExitSpreadPct)}, a recompra do futuro na{' '}
        {EXCHANGES[op.futExchange].name} precisa ser em até <b>{fmtPrice(limit)}</b>.
      </p>
      <p className="muted small">
        O alvo se move junto com o spot. Feche as duas pontas juntas. Ordem a mercado em moeda de pouca liquidez escorrega (slippage).
      </p>
    </div>
  );
}

function LiquidationBar({ snap, leverage }: { snap: Snapshot; leverage: number }) {
  // 100% = distância "cheia" que a alavancagem permite (≈ 1/alavancagem).
  const full = 100 / leverage;
  const safety = Math.max(0, Math.min(100, (snap.liqDistancePct / full) * 100));
  const level = snap.liqDistancePct < LIQ_DANGER_PCT ? 'danger' : safety < 60 ? 'warn' : 'ok';
  return (
    <div className="box">
      <h3>
        Escudo anti-liquidação <Help k="liquidacao" />
      </h3>
      <div className="bar">
        <div className={`bar-fill bar-${level}`} style={{ width: `${safety}%` }} />
      </div>
      <p>
        Liquidação {snap.liqEstimated ? 'estimada' : 'informada'} em <b>{fmtPrice(snap.liqPrice)}</b>: o futuro precisa subir{' '}
        <b>{fmtPct(snap.liqDistancePct, 1)}</b> para liquidar.
      </p>
      {snap.liqEstimated && <p className="muted small">Estimativa simplificada. Para precisão, copie o preço de liquidação da corretora em Editar.</p>}
    </div>
  );
}

function DcaSimulator({
  op,
  spot,
  fut,
  snap,
  dcaCount,
  onChange,
}: {
  op: Operation;
  spot: BookQuote;
  fut: BookQuote;
  snap: Snapshot;
  dcaCount: number;
  onChange: (op: Operation) => void;
}) {
  const [pct, setPct] = useState(50);
  const [rec, setRec] = useState<{ sp: string; fp: string; q: string } | null>(null);
  const addQty = (snap.qtySpot * pct) / 100;
  const r = useMemo(() => simulateDca(op, spot, fut, addQty), [op, spot, fut, addQty]);

  const register = () => {
    const sp = parseNum(rec!.sp);
    const fp = parseNum(rec!.fp);
    const q = parseNum(rec!.q);
    if (!(sp > 0 && fp > 0 && q > 0)) return;
    const time = Date.now();
    onChange({
      ...op,
      spotFills: [...op.spotFills, { price: sp, qty: q, time }],
      futFills: [...op.futFills, { price: fp, qty: q, time }],
    });
    setRec(null);
  };

  return (
    <div className="box">
      <h3>
        Simulador: "e se eu aumentar a mão agora?" <Help k="dca" />
      </h3>
      <label>
        Aumentar <b>{pct}%</b> da posição ({fmtNum(addQty)} moedas ≈ ${fmtNum(addQty * spot.ask, 2)})
        <input type="range" min={0} max={200} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
      </label>
      <div className="kv-grid">
        <Row l="Novo médio spot" r={fmtPrice(r.newAvgSpot)} />
        <Row l="Novo médio futuro" r={fmtPrice(r.newAvgFut)} />
        <Row l="Novo spread de entrada" r={`${fmtPct(r.newEntrySpreadPct)} (era ${fmtPct(snap.entrySpreadPct)})`} />
        <Row l="Nova quantidade" r={fmtNum(r.newQty)} />
        <Row l="Novo valor investido" r={`$${fmtNum(r.newNotional, 2)}`} />
        <Row l="Nova liquidação (estimada)" r={fmtPrice(r.newLiqPrice)} />
      </div>
      <p className="muted small">
        Usa os preços que você conseguiria agora: compra spot no ask ({fmtPrice(spot.ask)}) e venda do futuro no bid ({fmtPrice(fut.bid)}).
        Aumentos feitos: {dcaCount} de {op.maxDcaCount}.
      </p>
      {!rec ? (
        <button onClick={() => setRec({ sp: String(spot.ask), fp: String(fut.bid), q: String(+addQty.toFixed(6)) })}>
          Registrar aumento que eu fiz
        </button>
      ) : (
        <div className="row">
          <label>
            Preço spot pago
            <input value={rec.sp} onChange={(e) => setRec({ ...rec, sp: e.target.value })} />
          </label>
          <label>
            Preço futuro vendido
            <input value={rec.fp} onChange={(e) => setRec({ ...rec, fp: e.target.value })} />
          </label>
          <label>
            Quantidade (moedas)
            <input value={rec.q} onChange={(e) => setRec({ ...rec, q: e.target.value })} />
          </label>
          <div className="actions">
            <button className="primary" onClick={register}>
              Salvar
            </button>
            <button onClick={() => setRec(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Fills({ op, onChange }: { op: Operation; onChange: (op: Operation) => void }) {
  const remove = (i: number) => {
    if (op.spotFills.length <= 1) return;
    if (!confirm('Remover esta execução das duas pontas?')) return;
    onChange({ ...op, spotFills: op.spotFills.filter((_, j) => j !== i), futFills: op.futFills.filter((_, j) => j !== i) });
  };
  return (
    <details className="box">
      <summary>Execuções ({op.spotFills.length})</summary>
      <table>
        <thead>
          <tr>
            <th>Quando</th>
            <th>Spot (compra)</th>
            <th>Futuro (venda)</th>
            <th>Qtd</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {op.spotFills.map((f, i) => (
            <tr key={i}>
              <td>{fmtDate(f.time)}</td>
              <td>{fmtPrice(f.price)}</td>
              <td>{fmtPrice(op.futFills[i]?.price)}</td>
              <td>{fmtNum(f.qty)}</td>
              <td>{i > 0 && <button className="small" onClick={() => remove(i)}>remover</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function CloseOperation({
  op,
  spot,
  fut,
  funding,
  mark,
  onChange,
}: {
  op: Operation;
  spot?: BookQuote;
  fut?: BookQuote;
  funding: number;
  mark?: number;
  onChange: (op: Operation) => void;
}) {
  const [v, setV] = useState<{ sp: string; fp: string; fu: string } | null>(null);
  if (!v)
    return (
      <button className="primary" onClick={() => setV({ sp: spot ? String(spot.bid) : '', fp: fut ? String(fut.ask) : '', fu: funding.toFixed(4) })}>
        Encerrar operação (registrar saída)
      </button>
    );
  const sp = parseNum(v.sp);
  const fp = parseNum(v.fp);
  const fu = parseNum(v.fu) || 0;
  const s = sp > 0 && fp > 0 ? computeSnapshot(op, { bid: sp, ask: sp, ts: 0 }, { bid: fp, ask: fp, ts: 0 }, fu, mark) : undefined;
  const save = () => {
    if (!s) return;
    onChange({
      ...op,
      status: 'fechada',
      closed: { time: Date.now(), spotPrice: sp, futPrice: fp, funding: fu, netPnl: s.netPnl, exitSpreadPct: s.exitSpreadPct },
    });
  };
  return (
    <div className="box">
      <h3>Encerrar operação</h3>
      <p className="muted small">Digite os preços REAIS em que você fechou cada ponta.</p>
      <div className="row">
        <label>
          Venda do spot
          <input value={v.sp} onChange={(e) => setV({ ...v, sp: e.target.value })} />
        </label>
        <label>
          Recompra do futuro
          <input value={v.fp} onChange={(e) => setV({ ...v, fp: e.target.value })} />
        </label>
        <label>
          Funding total (USDT)
          <input value={v.fu} onChange={(e) => setV({ ...v, fu: e.target.value })} />
        </label>
      </div>
      {s && (
        <p>
          Resultado: <b className={cls(s.netPnl)}>{fmtUsd(s.netPnl)}</b> · spread de saída {fmtPct(s.exitSpreadPct)} (entrada {fmtPct(s.entrySpreadPct)})
        </p>
      )}
      <div className="actions">
        <button className="primary" onClick={save} disabled={!s}>
          Confirmar encerramento
        </button>
        <button onClick={() => setV(null)}>Cancelar</button>
      </div>
    </div>
  );
}

// ---------- exportar ----------

function exportJson(op: Operation, snap?: Snapshot) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  downloadFile(`operacao-${op.base}-${stamp}.json`, JSON.stringify({ exportadoEm: new Date().toISOString(), operacao: op, retrato: snap }, null, 2));
}

function printSummary(op: Operation, snap: Snapshot | undefined, m: LiveMarket) {
  const w = window.open('', '_blank');
  if (!w) return alert('Libere pop-ups para imprimir o resumo.');
  const rows: [string, string][] = [
    ['Par', `${op.base}/${op.quote}`],
    ['Spot', `${EXCHANGES[op.spotExchange].name} (${m.spotSymbol})`],
    ['Futuro', `${EXCHANGES[op.futExchange].name} (${m.futSymbol}) · ${op.leverage}x`],
    ['Quantidade', fmtNum(totalQty(op.spotFills))],
    ['Execuções', String(op.spotFills.length)],
    ['Status', op.status],
  ];
  if (snap)
    rows.push(
      ['Preço médio spot / futuro', `${fmtPrice(snap.avgSpot)} / ${fmtPrice(snap.avgFut)}`],
      ['Spread de entrada', fmtPct(snap.entrySpreadPct)],
      ['Spread de saída (agora)', fmtPct(snap.exitSpreadPct)],
      ['PnL spot / futuro', `${fmtUsd(snap.spotPnl)} / ${fmtUsd(snap.futPnl)}`],
      ['Taxas', fmtUsd(-(snap.entryFees + snap.exitFees))],
      ['Funding', fmtUsd(snap.funding)],
      ['Resultado líquido', `${fmtUsd(snap.netPnl)} (${fmtPct(snap.netPnlPct)})`],
      ['Liquidação', `${fmtPrice(snap.liqPrice)} (${snap.liqEstimated ? 'estimada' : 'informada'})`],
    );
  if (op.closed) rows.push(['Encerrada em', fmtDate(op.closed.time)], ['Resultado final', fmtUsd(op.closed.netPnl)]);
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Resumo ${op.base}</title>
    <style>body{font-family:system-ui;padding:24px}td{padding:6px 12px;border-bottom:1px solid #ddd}</style>
    <h1>Resumo da operação ${op.base}/${op.quote}</h1><p>Gerado em ${fmtDate(Date.now())}</p>
    <table>${rows.map(([a, b]) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`).join('')}</table>
    ${op.notes ? `<p>Anotações: ${op.notes.replace(/</g, '&lt;')}</p>` : ''}`);
  w.document.close();
  w.focus();
  w.print();
}
