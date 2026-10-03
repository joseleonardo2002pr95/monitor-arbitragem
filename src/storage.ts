import type { Operation, SpotSpotOp } from './core/types';

const KEY = 'arb.operations.v1';
const KEY_SS = 'arb.spotspot.v1';

/** Operações ficam salvas só NESTE navegador. Use Exportar/Importar para backup. */
export function loadOps(): Operation[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Operation[]) : [];
  } catch {
    return [];
  }
}

export function saveOps(ops: Operation[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    /* modo privado / sem espaço */
  }
}

export function loadSpotSpot(): SpotSpotOp[] {
  try {
    const raw = localStorage.getItem(KEY_SS);
    return raw ? (JSON.parse(raw) as SpotSpotOp[]) : [];
  } catch {
    return [];
  }
}

export function saveSpotSpot(ops: SpotSpotOp[]) {
  try {
    localStorage.setItem(KEY_SS, JSON.stringify(ops));
  } catch {
    /* modo privado / sem espaço */
  }
}

/** Lê a aba escolhida da última vez (conveniência). */
export function loadTab(): 'futuros' | 'spotspot' {
  try {
    return localStorage.getItem('arb.tab') === 'spotspot' ? 'spotspot' : 'futuros';
  } catch {
    return 'futuros';
  }
}
export function saveTab(t: string) {
  try {
    localStorage.setItem('arb.tab', t);
  } catch {
    /* ignore */
  }
}

export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
