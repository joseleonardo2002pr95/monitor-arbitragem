import type { Snapshot } from './calc';
import type { Operation } from './types';

export type SignalLevel = 'verde' | 'amarelo' | 'azul' | 'vermelho';

export interface Signal {
  level: SignalLevel;
  title: string;
  message: string;
  reasons: string[];
}

/** Abaixo disso de distância até a liquidação, o sinal fica vermelho. */
export const LIQ_DANGER_PCT = 15;
/** Distância mínima até a liquidação para aceitar aumentar a mão. */
export const LIQ_SAFE_FOR_DCA_PCT = 30;
/** Livro (ask − bid) mais largo que isso = pouca liquidez. */
export const WIDE_BOOK_PCT = 0.5;

const pp = (v: number) => `${v >= 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} p.p.`;
const pct = (v: number, d = 2) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

/**
 * Prioridade: vermelho (risco) → verde (realizar) → azul (aumentar é vantajoso) → amarelo (aguardar).
 *
 * Importante: "alargou na saída" ≠ "oportunidade de aumentar".
 * - exitSpread (spot bid × futuro ask) mede quanto custa FECHAR agora.
 * - openSpread (spot ask × futuro bid) mede o que você PEGA se aumentar agora.
 * Em moeda de pouca liquidez o livro é largo: a saída parece péssima, mas aumentar não melhora quase nada.
 */
export function computeSignal(op: Operation, s: Snapshot, fundingRate: number | undefined, dcaCount: number): Signal {
  const reasons: string[] = [];
  const exitWidened = s.exitSpreadPct - s.entrySpreadPct;
  const dcaGain = s.openSpreadPct - s.entrySpreadPct;
  const fundingNegative = fundingRate !== undefined && fundingRate < 0;

  if (Math.abs(s.qtyMismatch) > 0.0001 * Math.max(s.qtySpot, 1)) {
    reasons.push(`As pontas estão desequilibradas em ${s.qtyMismatch.toFixed(4)} moedas. A parte sem par fica exposta ao preço.`);
  }
  if (s.spotBookPct > WIDE_BOOK_PCT || s.futBookPct > WIDE_BOOK_PCT) {
    reasons.push(
      `Livro largo (spot ${pct(s.spotBookPct)}, futuro ${pct(s.futBookPct)}): pouca liquidez. Parte do spread de saída é só essa distância entre compra e venda. Prefira ordem limite.`,
    );
  }

  if (s.spotDepthUsed && s.spotSellLevels > 1)
    reasons.push(
      `Vender todo o spot a mercado usaria ${s.spotSellLevels} níveis do livro: spread de saída REAL ${pct(s.realExitSpreadPct)} (no melhor preço ${pct(s.exitSpreadPct)}). O resultado mostrado já considera isso.`,
    );
  if (!s.spotSellComplete) reasons.push('O livro do spot não tem compradores suficientes para toda a sua quantidade: fechar tudo a mercado sairia ainda pior.');

  // 1) Risco alto
  if (s.liqDistancePct > 0 && s.liqDistancePct < LIQ_DANGER_PCT) {
    return {
      level: 'vermelho',
      title: 'Atenção: liquidação perto',
      message: `O preço do futuro precisa subir só ${pct(s.liqDistancePct, 1)} para liquidar o seu short. O lucro do spot está em outra corretora e NÃO protege essa margem.`,
      reasons: [...reasons, 'Considere adicionar margem no futuro ou reduzir a posição nas duas pontas.'],
    };
  }
  if (fundingNegative && exitWidened > 0) {
    return {
      level: 'vermelho',
      title: 'Atenção: esperar está custando',
      message: 'O spread piorou e o funding está negativo: você paga para manter o short a cada período.',
      reasons: [...reasons, 'Avalie se vale fechar agora para não acumular custo de funding.'],
    };
  }

  // 2) Realizar lucro
  if (s.realExitSpreadPct <= op.targetExitSpreadPct && s.netPnl > 0) {
    return {
      level: 'verde',
      title: 'Hora de realizar lucro',
      message: `O spread de saída real (${pct(s.realExitSpreadPct)}) chegou no seu alvo (${pct(op.targetExitSpreadPct)}) e o resultado líquido é positivo.`,
      reasons: [...reasons, 'Feche as duas pontas juntas, de preferência com ordem limite.'],
    };
  }

  // 3) Aumentar a mão: só se o spread que você PEGARIA agora for bem melhor que o seu médio
  if (dcaGain >= op.widenAlertPp) {
    const blockers: string[] = [];
    if (fundingRate === undefined) blockers.push('o funding ainda não foi carregado');
    else if (fundingRate < 0) blockers.push('o funding está negativo');
    if (dcaCount >= op.maxDcaCount) blockers.push(`você já fez ${dcaCount} aumento(s), o seu limite é ${op.maxDcaCount}`);
    if (s.liqDistancePct > 0 && s.liqDistancePct < LIQ_SAFE_FOR_DCA_PCT)
      blockers.push(`a liquidação está a ${pct(s.liqDistancePct, 1)} (mínimo ${LIQ_SAFE_FOR_DCA_PCT}%)`);

    if (blockers.length === 0) {
      return {
        level: 'azul',
        title: 'Spread alargou: aumentar a mão é possível, com cautela',
        message: `Se aumentar agora, você entra com spread de ${pct(s.openSpreadPct)} (${pp(dcaGain)} sobre o seu médio de ${pct(s.entrySpreadPct)}). Melhora o seu spread médio, mas aumenta o tamanho do risco.`,
        reasons: [
          ...reasons,
          'Antes de aumentar, descubra POR QUE alargou: saque/depósito suspenso, notícia ou deslistagem.',
          'Só aumente com dinheiro que você aceita deixar travado por mais tempo.',
        ],
      };
    }
    return {
      level: 'amarelo',
      title: 'Spread alargou: NÃO é hora de aumentar',
      message: `Aumentar agora daria ${pp(dcaGain)} sobre o seu médio, mas ${blockers.join('; ')}.`,
      reasons,
    };
  }

  // 4) Aguardar
  const fundingMsg =
    fundingRate === undefined
      ? ''
      : fundingRate >= 0
        ? ' O funding está positivo: você está recebendo para esperar.'
        : ' O funding está negativo: esperar custa dinheiro.';
  if (exitWidened >= op.widenAlertPp) {
    return {
      level: 'amarelo',
      title: 'Spread de saída alargou: aguardar',
      message: `Fechar agora travaria ${pct(s.exitSpreadPct)} (${pp(exitWidened)} pior que a entrada). Aumentar a mão não compensa: agora você entraria com ${pct(s.openSpreadPct)}.${fundingMsg}`,
      reasons,
    };
  }
  return {
    level: 'amarelo',
    title: 'Operação protegida: aguardar',
    message: `Spread de saída ${pct(s.exitSpreadPct)}, alvo ${pct(op.targetExitSpreadPct)}.${fundingMsg}`,
    reasons,
  };
}
