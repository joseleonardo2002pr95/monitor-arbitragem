import { useEffect, useRef, useState } from 'react';
import { askNotificationPermission, beep } from './alerts';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EmergencyGuide } from './components/EmergencyGuide';
import { History } from './components/History';
import { LiveOperation } from './components/LiveOperation';
import { OperationForm } from './components/OperationForm';
import { SpotSpotForm } from './components/SpotSpotForm';
import { SpotSpotHistory } from './components/SpotSpotHistory';
import { SpotSpotLive } from './components/SpotSpotLive';
import type { Operation, SpotSpotOp } from './core/types';
import { downloadFile, loadOps, loadSpotSpot, loadTab, saveOps, saveSpotSpot, saveTab } from './storage';

export default function App() {
  const [ops, setOps] = useState<Operation[]>(loadOps);
  const [form, setForm] = useState<{ edit?: Operation } | null>(null);
  const [ss, setSs] = useState<SpotSpotOp[]>(loadSpotSpot);
  const [ssForm, setSsForm] = useState<{ edit?: SpotSpotOp } | null>(null);
  const [tab, setTab] = useState<'futuros' | 'spotspot'>(loadTab);
  const [guide, setGuide] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveOps(ops), [ops]);
  useEffect(() => saveSpotSpot(ss), [ss]);
  useEffect(() => saveTab(tab), [tab]);

  const upsertSs = (op: SpotSpotOp) =>
    setSs((list) => (list.some((o) => o.id === op.id) ? list.map((o) => (o.id === op.id ? op : o)) : [op, ...list]));
  const removeSs = (id: string) => setSs((list) => list.filter((o) => o.id !== id));
  const ssOpen = ss.filter((o) => o.stage !== 'vendido');
  const ssClosed = ss.filter((o) => o.stage === 'vendido').sort((a, b) => (b.closed?.time ?? 0) - (a.closed?.time ?? 0));

  const upsert = (op: Operation) =>
    setOps((list) => (list.some((o) => o.id === op.id) ? list.map((o) => (o.id === op.id ? op : o)) : [op, ...list]));
  const remove = (id: string) => setOps((list) => list.filter((o) => o.id !== id));

  const open = ops.filter((o) => o.status === 'aberta');
  const closed = ops.filter((o) => o.status === 'fechada').sort((a, b) => (b.closed?.time ?? 0) - (a.closed?.time ?? 0));

  const toggleAlerts = async () => {
    if (alertsOn) return setAlertsOn(false);
    await askNotificationPermission();
    beep(1); // o navegador só libera som depois de um clique
    setAlertsOn(true);
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      // Formatos aceitos: backup novo {futuros, spotSpot}, backup antigo (lista), ou uma operação exportada.
      const fut: Operation[] = Array.isArray(data) ? data : data.futuros ?? (data.operacao ? [data.operacao] : []);
      const sps: SpotSpotOp[] = data.spotSpot ?? (data.operacaoSpotSpot ? [data.operacaoSpotSpot] : []);
      if (!fut.length && !sps.length) throw new Error();
      if (!fut.every((o) => o.id && o.spotFills && o.futFills) || !sps.every((o) => o.id && o.buyExchange)) throw new Error();
      setOps((cur) => [...fut.filter((o) => !cur.some((c) => c.id === o.id)), ...cur]);
      setSs((cur) => [...sps.filter((o) => !cur.some((c) => c.id === o.id)), ...cur]);
    } catch {
      alert('Arquivo inválido. Use um JSON exportado por este app.');
    }
  };

  return (
    <div className="app">
      <header className="top">
        <h1>Monitor de Arbitragem</h1>
        <div className="actions">
          <button className="primary" onClick={() => (tab === 'futuros' ? setForm({}) : setSsForm({}))}>
            + Nova {tab === 'futuros' ? 'operação' : 'análise spot x spot'}
          </button>
          <button onClick={toggleAlerts}>{alertsOn ? '🔔 Alertas ligados' : '🔕 Ligar alertas'}</button>
          <button onClick={() => setGuide(true)}>🚨 Guia de emergência</button>
          <button onClick={() => downloadFile(`backup-arbitragem-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ futuros: ops, spotSpot: ss }, null, 2))}>
            Backup
          </button>
          <button onClick={() => fileRef.current?.click()}>Importar</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
          />
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'futuros' ? 'active' : ''} onClick={() => setTab('futuros')}>
          Spot x Futuros ({open.length})
        </button>
        <button className={tab === 'spotspot' ? 'active' : ''} onClick={() => setTab('spotspot')}>
          Spot x Spot ({ssOpen.length})
        </button>
      </nav>

      {alertsOn && (
        <p className="muted small">Alertas tocam som e notificação quando o sinal muda para verde, azul ou vermelho. Deixe esta aba aberta.</p>
      )}

      {tab === 'futuros' && (
        <>
      {form && (
        <OperationForm
          key={form.edit?.id ?? 'nova'}
          initial={form.edit}
          onSave={(op) => {
            upsert(op);
            setForm(null);
          }}
          onCancel={() => setForm(null)}
        />
      )}

      {open.length === 0 && !form && (
        <section className="card empty">
          <p>
            Nenhuma operação aberta. Clique em <b>+ Nova operação</b> para começar a acompanhar.
          </p>
        </section>
      )}

      {open.map((op) => (
        <ErrorBoundary key={op.id}>
        <LiveOperation
          op={op}
          alertsOn={alertsOn}
          onChange={upsert}
          onEdit={() => setForm({ edit: op })}
          onDelete={() => confirm(`Excluir a operação ${op.base}?`) && remove(op.id)}
        />
        </ErrorBoundary>
      ))}

      <History ops={closed} onReopen={(o) => upsert({ ...o, status: 'aberta', closed: undefined })} onDelete={remove} />

        </>
      )}

      {tab === 'spotspot' && (
        <>
          {ssForm && (
            <SpotSpotForm
              key={ssForm.edit?.id ?? 'nova'}
              initial={ssForm.edit}
              onSave={(op) => {
                upsertSs(op);
                setSsForm(null);
              }}
              onCancel={() => setSsForm(null)}
            />
          )}
          {ssOpen.length === 0 && !ssForm && (
            <section className="card empty">
              <p>
                Nenhuma análise spot x spot. Clique em <b>+ Nova análise spot x spot</b> para comparar o preço de uma moeda entre duas corretoras.
              </p>
            </section>
          )}
          {ssOpen.map((op) => (
            <ErrorBoundary key={op.id}>
              <SpotSpotLive
                op={op}
                alertsOn={alertsOn}
                onChange={upsertSs}
                onEdit={() => setSsForm({ edit: op })}
                onDelete={() => confirm(`Excluir a análise ${op.base}?`) && removeSs(op.id)}
              />
            </ErrorBoundary>
          ))}
          <SpotSpotHistory ops={ssClosed} onReopen={(o) => upsertSs({ ...o, stage: 'na corretora de venda', closed: undefined })} onDelete={removeSs} />
        </>
      )}

      {guide && <EmergencyGuide onClose={() => setGuide(false)} />}

      <footer className="muted small">
        Ferramenta de estudo e acompanhamento. Não é recomendação de investimento. Dados públicos das corretoras via WebSocket; as operações
        ficam salvas só neste navegador (faça Backup).
      </footer>
    </div>
  );
}
