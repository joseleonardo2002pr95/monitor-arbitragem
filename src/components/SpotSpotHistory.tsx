import { buyCost } from '../core/spotspot';
import type { SpotSpotOp } from '../core/types';
import { EXCHANGES } from '../exchanges';
import { fmtDate, fmtDuration, fmtNum, fmtPct, fmtUsd } from '../format';

export function SpotSpotHistory({ ops, onReopen, onDelete }: { ops: SpotSpotOp[]; onReopen: (op: SpotSpotOp) => void; onDelete: (id: string) => void }) {
  if (ops.length === 0) return null;
  const total = ops.reduce((s, o) => s + (o.closed?.netPnl ?? 0), 0);
  return (
    <section className="card">
      <h2>Histórico spot x spot</h2>
      <p>
        {ops.length} operação(ões) · {ops.filter((o) => (o.closed?.netPnl ?? 0) > 0).length} com lucro · total{' '}
        <b className={total >= 0 ? 'pos' : 'neg'}>{fmtUsd(total)}</b>
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Moeda</th>
              <th>Caminho</th>
              <th>Custo</th>
              <th>Recebido</th>
              <th>Resultado</th>
              <th>Duração</th>
              <th>Vendida em</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ops.map((o) => {
              const c = o.closed!;
              return (
                <tr key={o.id}>
                  <td>{o.base}</td>
                  <td>{EXCHANGES[o.buyExchange].name} → {EXCHANGES[o.sellExchange].name}</td>
                  <td>${fmtNum(o.buy ? buyCost(o.buy.price, o.buy.qty, o) : 0, 4)}</td>
                  <td>${fmtNum(c.proceeds, 4)}</td>
                  <td className={c.netPnl >= 0 ? 'pos' : 'neg'}>
                    {fmtUsd(c.netPnl)} ({fmtPct(c.netPct)})
                  </td>
                  <td>{o.buy ? fmtDuration(c.time - o.buy.time) : '—'}</td>
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
