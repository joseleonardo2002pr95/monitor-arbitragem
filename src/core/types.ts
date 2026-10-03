export type ExchangeId = 'binance' | 'gate' | 'bybit' | 'okx' | 'lbank' | 'mexc' | 'kucoin' | 'weex' | 'bitget';
export type Market = 'spot' | 'futures';

/** Uma execução (entrada ou aumento de mão). No futuros é sempre uma VENDA (short). */
export interface Fill {
  price: number;
  qty: number; // quantidade de moedas
  time: number; // ms
}

export interface Operation {
  id: string;
  createdAt: number;
  status: 'aberta' | 'fechada';
  base: string; // ex: PUMPBTC
  quote: string; // ex: USDT
  spotExchange: ExchangeId;
  futExchange: ExchangeId;
  /** Símbolo manual, quando o automático não bate (ex: 1000PEPEUSDT). */
  spotSymbolOverride?: string;
  futSymbolOverride?: string;
  spotFills: Fill[];
  futFills: Fill[];
  leverage: number;
  /** Taxas em fração (0.001 = 0,1%). */
  spotFeeRate: number;
  futFeeRate: number;
  /** Funding recebido (+) ou pago (-) em USDT digitado pelo usuário. Se vazio, o app busca o histórico. */
  fundingManual?: number;
  /** Preço de liquidação mostrado pela corretora. Se vazio, o app estima. */
  liqPriceManual?: number;
  /** Margem de manutenção usada na estimativa (fração). */
  maintMarginRate: number;
  /** Spread de saída (%) em que você quer encerrar. */
  targetExitSpreadPct: number;
  /** Quantos pontos percentuais o spread precisa alargar para disparar o aviso. */
  widenAlertPp: number;
  maxDcaCount: number;
  notes?: string;
  closed?: ClosedInfo;
}

export interface ClosedInfo {
  time: number;
  spotPrice: number;
  futPrice: number;
  funding: number;
  netPnl: number;
  exitSpreadPct: number;
}

/** Nível do livro: [preço, quantidade de moedas]. */
export type Level = [number, number];

export interface BookQuote {
  bid: number;
  ask: number;
  /** Quantidade (moedas) disponível no melhor preço. */
  bidQty?: number;
  askQty?: number;
  /** Livro com vários níveis, melhor preço primeiro (quando a corretora fornece). */
  bids?: Level[];
  asks?: Level[];
  ts: number;
}

export interface FuturesInfo {
  mark?: number;
  index?: number;
  /** Taxa do período atual (fração). Positiva = vendido recebe. */
  fundingRate?: number;
  nextFundingTime?: number; // ms
  ts: number;
}

export interface FundingEvent {
  time: number;
  rate: number;
  markPrice?: number;
}

// ---------------- SPOT x SPOT ----------------

export type SpotSpotStage = 'observando' | 'comprado' | 'em trânsito' | 'na corretora de venda' | 'vendido';

/** Comprar numa corretora, transferir a moeda e vender em outra. SEM proteção durante a transferência. */
export interface SpotSpotOp {
  id: string;
  createdAt: number;
  stage: SpotSpotStage;
  base: string;
  quote: string;
  buyExchange: ExchangeId;
  sellExchange: ExchangeId;
  buySymbolOverride?: string;
  sellSymbolOverride?: string;
  /** Tamanho planejado em USDT (para analisar a oportunidade antes de comprar). */
  plannedUsdt: number;
  buyFeeRate: number;
  sellFeeRate: number;
  /** A taxa de compra é descontada em moedas (ex.: LBank) em vez de USDT. */
  buyFeeInCoin: boolean;
  /** Taxa de saque FIXA, em moedas. */
  withdrawFeeCoins: number;
  network?: string;
  /** Lucro líquido mínimo (%) para considerar a oportunidade boa / para vender. */
  targetNetPct: number;
  buy?: { price: number; qty: number; time: number };
  withdrawTime?: number;
  /** Moedas que efetivamente chegaram na corretora de venda. */
  received?: { qty: number; time: number };
  closed?: { time: number; sellPrice: number; qtySold: number; proceeds: number; netPnl: number; netPct: number };
  notes?: string;
}
