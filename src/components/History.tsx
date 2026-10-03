import { avgPrice, spreadPct, totalQty } from '../core/calc';
import type { Operation } from '../core/types';
import { EXCHANGES } from '../exchanges';
import { fmtDate, fmtDuration, fmtNum, fmtPct, fmtUsd } from '../format';

export function History({ ops, onReopen, onDelete }: { ops: Operation[]; onReopen: (op: Operation) => void; onDelete: (id: string) => void }) {
  if (ops.length === 0) return null;
  const total = ops.reduce((s, o) => s + (o.closed?.netPnl ?? 0), 0);
  const wins = ops.filter((o) => (o.closed?.netPnl ?? 0) > 0).length;
  return (
    <section className="card">
      <h2>Histórico de operações encerradas</h2>
      <p>
        {ops.length} operação(ões) · {wins} com lucro · resultado total <b className={total >= 0 ? 'pos' : 'neg'}>{fmtUsd(total)}</b>
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Par</th>
              <th>Corretoras</th>
              <th>Qtd</th>
              <th>Entrada</th>
              <th>Saída</th>
              <th>Funding</th>
              <th>Resultado</th>
              <th>Duração</th>
              <th>Fechada em</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ops.map((o) => {
              const c = o.closed!;
              const opened = Math.min(...o.spotFills.map((f) => f.time));
              return (
                <tr key={o.id}>
                  <td>{o.base}/{o.quote}</td>
                  <td>{EXCHANGES[o.spotExchange].name} → {EXCHANGES[o.futExchange].name}</td>
                  <td>{fmtNum(totalQty(o.spotFills))}</td>
                  <td>{fmtPct(spreadPct(avgPrice(o.spotFills), avgPrice(o.futFills)))}</td>
                  <td>{fmtPct(c.exitSpreadPct)}</td>
                  <td>{fmtUsd(c.funding)}</td>
                  <td className={c.netPnl >= 0 ? 'pos' : 'neg'}>{fmtUsd(c.netPnl)}</td>
                  <td>{fmtDuration(c.time - opened)}</td>
                  <td>{fmtDate(c.time)}</td>
                  <td>
                    <button className="small" onClick={() => onReopen(o)}>reabrir</button>{' '}
                    <button className="small danger" onClick={() => confirm('Excluir do histórico?') && onDelete(o.id)}>excluir</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
