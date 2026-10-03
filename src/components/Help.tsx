import { useState } from 'react';

/** Explicações "direto ao ponto" para cada termo técnico. */
export const GLOSSARY = {
  hedge:
    'Proteção. Você está comprado no spot e vendido no futuro na mesma quantidade. Se a moeda sobe, uma ponta ganha e a outra perde quase o mesmo valor.',
  spread: 'A diferença de preço, em %, entre o futuro e o spot. É o que você tenta ganhar.',
  spreadEntrada: 'O spread que você travou quando abriu a operação (usando o seu preço médio).',
  spreadSaida:
    'O spread que você travaria se FECHASSE agora: vendendo o spot pelo melhor comprador (bid) e recomprando o futuro pelo melhor vendedor (ask). Quanto MENOR, melhor para você.',
  spreadAbertura:
    'O spread que você pegaria se ABRISSE ou AUMENTASSE agora: comprando o spot pelo ask e vendendo o futuro pelo bid. Quanto MAIOR, melhor.',
  convergencia: 'Quando os preços do spot e do futuro se aproximam. É aí que a arbitragem dá lucro.',
  pnl: 'Lucro ou prejuízo. "Latente" quer dizer que você ainda não fechou: só vira real quando você encerra as duas pontas.',
  funding:
    'Pagamento entre comprados e vendidos do contrato perpétuo, a cada 8h, 4h ou 1h. Taxa POSITIVA = você (vendido) RECEBE. Taxa NEGATIVA = você PAGA.',
  liquidacao:
    'Se o preço do futuro subir até esse valor, a corretora fecha o seu short à força e você perde a margem. O lucro do spot está em outra corretora e não ajuda.',
  alavancagem: 'Quanto da posição é emprestado. 2x = você coloca metade do valor como margem. Quanto maior, mais perto fica a liquidação.',
  bidAsk: 'Bid = melhor preço que alguém paga para COMPRAR de você. Ask = melhor preço que alguém aceita para VENDER para você.',
  empate:
    'O spread de saída em que o resultado fica zero, já contando taxas e funding. Sair ABAIXO disso dá lucro.',
  dca: 'Aumentar a mão: comprar mais spot e vender mais futuro para melhorar o seu spread médio. Aumenta o lucro se convergir e o tamanho do problema se não convergir.',
  taxas: 'Cobradas em cada ordem: entrada e saída, nas duas corretoras (4 vezes). Taker = ordem a mercado. Maker = ordem limite que fica no livro (mais barata).',
  taxaSaque:
    'Valor FIXO cobrado pela corretora para enviar a moeda para outra corretora. É descontado das moedas enviadas. Por ser fixo, pesa muito em valores pequenos e pouco em valores grandes.',
  diferencaBruta:
    'Quanto o preço de venda na corretora B (melhor comprador) está acima do preço de compra na corretora A (melhor vendedor), antes das taxas.',
  sentidoContrario: 'A diferença se você fizesse o caminho inverso: comprar em B e vender em A.',
  tamanhoMinimo: 'Valor mínimo da operação para o lucro da diferença pagar a taxa fixa de saque. Abaixo disso, dá prejuízo.',
  topoLivro:
    'Quantidade de moedas disponível no MELHOR preço. Se você precisa de mais que isso, o resto sai num preço pior e a diferença real diminui.',
  transito:
    'Enquanto a moeda viaja entre as corretoras, você não tem proteção: se o preço cair, o lucro diminui ou vira prejuízo.',
  empateVenda: 'Preço de venda na corretora B que deixa o resultado zero, já com todas as taxas.',
  precoMedio:
    'Uma ordem a mercado "come" o livro: primeiro o melhor preço, depois os seguintes. O preço médio é o que você REALMENTE paga ou recebe pela quantidade inteira. Em livro fino, ele fica bem pior que o melhor preço.',
  mark: 'Preço de marcação: o preço "justo" que a corretora usa para calcular a liquidação. Ele evita que um pico momentâneo liquide você.',
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

export function Help({ k }: { k: GlossaryKey }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help">
      <button type="button" className="help-btn" onClick={() => setOpen((v) => !v)} title={GLOSSARY[k]} aria-label="Explicação">
        ?
      </button>
      {open && (
        <span className="help-pop" onClick={() => setOpen(false)}>
          {GLOSSARY[k]}
        </span>
      )}
    </span>
  );
}
