# Arquitetura — Monitor de Arbitragem

#gerado-por-ia · Claude Code (Opus 5.5) · 2026-10-02

## Visão geral
App 100% no navegador (sem servidor). React 19 + TypeScript + Vite 8. Testes com Vitest.
Os preços vêm direto das corretoras por **WebSocket público** (sem chave de API).
As operações ficam no `localStorage` do navegador (chaves `arb.operations.v1` e `arb.spotspot.v1`). Backup/Importar em JSON.

```
src/
  core/                 ← LÓGICA PURA (sem React). Testada.
    types.ts            Operation, Fill, BookQuote, FuturesInfo, FundingEvent
    calc.ts             preço médio, spreads, PnL, taxas, funding, liquidação, simulação de DCA
    signal.ts           sinal verde/amarelo/azul/vermelho + motivos
    calc.test.ts        testes (inclui a operação real PUMPBTC de José)
    spotspot.ts         SPOT x SPOT: custos (taxa em moeda ou USDT, saque fixo), oportunidade, posição, sinal
    spotspot.test.ts    testes (inclui a operação real VON LBank→Gate)
  core/depth.ts         execução a mercado nível por nível (sellIntoBids / buyWithUsdt) → preço médio real
  exchanges/
    spot.ts             SPOT com profundidade: WS + foto REST, 7 corretoras, taxa de saque (LBank/KuCoin)
    ws.ts               WebSocket com reconexão automática + detecção de conexão muda
    index.ts            adaptadores Binance/Gate/Bybit/OKX (spot, futuros, histórico de funding)
  useSpotPair.ts        hook spot x spot: assina o spot das duas corretoras (250 ms)
  useLiveMarket.ts      hook: assina spot+futuro, atualiza a tela a cada 250 ms, busca funding a cada 5 min
  components/
    OperationForm.tsx   cadastro/edição (spread líquido instantâneo)
    LiveOperation.tsx   painel ao vivo: sinal, preços, spreads, PnL, funding, saída limite,
                        escudo de liquidação, simulador de DCA, execuções, encerrar, exportar/imprimir
    History.tsx         operações encerradas + total
    Help.tsx            tooltips (?) e glossário GLOSSARY
    EmergencyGuide.tsx  modal do guia de emergência
    ErrorBoundary.tsx   um painel com erro não derruba a página
    ui.tsx              peças comuns: Box, Row, SignalCard, Status, useSignalAlert
    SpotSpotForm.tsx    cadastro spot x spot (busca taxa de saque da LBank)
    SpotSpotLive.tsx    painel spot x spot: etapas, preços, diferença, posição, simulador, ações
    SpotSpotHistory.tsx histórico spot x spot
  alerts.ts             bipe (Web Audio) + notificação do navegador
  format.ts             formatação pt-BR (preços de moedas baratas, %, US$, contagem)
  storage.ts            localStorage + download de arquivo
```

## Fórmulas (src/core/calc.ts)
- `spread% = (futuro − spot) / spot × 100`
- **Spread de entrada** = com os preços MÉDIOS das execuções.
- **Spread de saída** = `spot bid` × `futuro ask` (o que você trava se fechar agora). Menor = melhor.
- **Spread de abertura** = `spot ask` × `futuro bid` (o que você pega se aumentar agora). Maior = melhor.
- PnL spot = `(spot bid − médio spot) × qtd spot`; PnL futuro = `(médio futuro − futuro ask) × qtd futuro`.
- Taxas = entrada (preço × qtd × taxa, por execução) + saída estimada (bid/ask atual).
- Funding (short): soma de `taxa × qtd aberta naquele momento × mark` de cada pagamento após a entrada. Taxa + = recebe.
- Empate ≈ `spread entrada − (taxas − funding) / notional × 100`.
- Liquidação estimada (short isolado, linear): `entrada × (1 + 1/alav) / (1 + mmr)`. Se o usuário digitar a da corretora, ela prevalece.

## Regras do sinal (src/core/signal.ts), em ordem
1. 🔴 liquidação a menos de 15% **ou** funding negativo com spread de saída pior que a entrada.
2. 🟢 spread de saída ≤ alvo **e** líquido > 0.
3. 🔵 spread de ABERTURA − spread de entrada ≥ `widenAlertPp` **e** funding ≥ 0 **e** aumentos < máximo **e** liquidação ≥ 30%.
   (Se o ganho existe mas falha alguma condição → 🟡 "NÃO é hora de aumentar".)
4. 🟡 aguardar (com aviso se o spread de SAÍDA alargou).
- Motivos extras: pontas desequilibradas; livro largo (> 0,5%) = pouca liquidez.
- **Decisão:** o azul usa o spread de ABERTURA, não o de saída. Caso real (02/10): Gate com livro de 1,4% fazia a saída
  parecer 2,1% pior, mas aumentar só melhoraria 0,03 p.p. O prompt original (NotebookLM) sugeria "alargou = DCA"; foi corrigido.

## Endpoints (conferidos em 2026-10-02)
| Corretora | Spot (WS) | Futuro perpétuo (WS) | Histórico funding (REST, CORS ok) |
|---|---|---|---|
| Binance | `wss://stream.binance.com:9443/ws/{sym}@bookTicker` | book: `wss://fstream.binance.com/public/ws/{sym}@bookTicker` · mark/funding: `wss://fstream.binance.com/market/ws/{sym}@markPrice@1s` | `fapi.binance.com/fapi/v1/fundingRate` |
| Gate | `wss://api.gateio.ws/ws/v4/` canal `spot.book_ticker` | `wss://fx-ws.gateio.ws/v4/ws/usdt` canais `futures.book_ticker` + `futures.tickers` | `api.gateio.ws/api/v4/futures/usdt/funding_rate` |
| Bybit | `wss://stream.bybit.com/v5/public/spot` `orderbook.1.{sym}` | `wss://stream.bybit.com/v5/public/linear` `tickers.{sym}` (snapshot + delta, juntar campos) | `api.bybit.com/v5/market/funding/history` (exige endTime) |
| OKX | `wss://ws.okx.com:8443/ws/v5/public` `tickers` | mesmo WS: `tickers`, `mark-price`, `funding-rate` (instId `X-USDT-SWAP`) | `www.okx.com/api/v5/public/funding-rate-history` |

| WEEX | `wss://ws-spot.weex.com/v2/ws/public` `depth.{X}_SPBL.15` (snapshot + CHANGED) | `wss://ws-contract.weex.com/v2/ws/public` `depth.cmt_x.15` + `ticker.cmt_x`; funding via REST `currentFundRate` (60 s) | `api-contract.weex.com/capi/v2/market/getHistoryFundRate` |
| Bitget | `wss://ws.bitget.com/v2/ws/public` `{instType:'SPOT',channel:'books15'}` (foto completa) | mesmo WS, `instType:'USDT-FUTURES'`, canais `books15` + `ticker` (mark, índice, fundingRate, nextFundingTime) | `api.bitget.com/api/v2/mix/market/history-fund-rate` |
| LBank / MEXC / KuCoin | ver "Proxy local" (só spot) | — | — |

**Atenção WEEX:** responder `{"event":"pong","time":…}` ao ping do servidor. Taxa de saque: `api-spot.weex.com/api/v2/public/currencies` (lista inteira, ~460 KB, filtrada no app).

**Atenção Binance:** o caminho antigo `fstream.binance.com/ws/...@markPrice` CONECTA mas não manda nada. Use `/market/` e `/public/`.
Símbolos: Binance/Bybit `BTCUSDT`, Gate `BTC_USDT`, OKX `BTC-USDT` / `BTC-USDT-SWAP`. Há campo de símbolo manual (ex.: `1000PEPEUSDT`).

## Spot x Spot (src/core/spotspot.ts)
- Diferença bruta = `bid da venda (B)` vs `ask da compra (A)`. Sentido contrário = `bid de A` vs `ask de B`.
- Moedas que chegam = `qtd × (1 − taxa compra, se cobrada em moeda) − taxa de saque fixa`.
- Lucro = `moedas que chegam × bid B × (1 − taxa venda) − custo`.
- Tamanho mínimo: `lucro(S) = S·k − fixo` → `S = fixo / k`, com `k = moedas por USDT × bid B × (1 − taxa venda) − 1`.
- Sinal: observando → verde (≥ alvo e livro com ≥50% do tamanho no melhor preço) / amarelo (lucro pequeno ou livro fino) / vermelho (não compensa).
  Comprado/em trânsito → vermelho se vender no destino agora dá prejuízo. Na corretora de venda → verde ≥ alvo, amarelo > 0, vermelho < empate.

## Profundidade (src/core/depth.ts)
- `BookQuote.bids/asks` = níveis `[preço, moedas]`, melhor primeiro. Ordem a mercado consome nível a nível.
- Se o livro carregado acaba antes da quantidade, o resto é avaliado no pior preço e `complete=false` (resultado real seria pior).
- Spot x spot: `analyzeOpportunity` devolve `netUsdt` REAL e `topNetUsdt` (só melhor preço); `findBestSize` testa 60 valores (escala log) e acha o de maior lucro.
- Spot x futuros: `computeSnapshot` usa o preço médio real de vender todo o spot (`spotSellAvg`, `realExitSpreadPct`); o sinal verde usa o spread REAL.

## Proxy local (vite.config.ts)
| Caminho | Destino | Por quê |
|---|---|---|
| `/proxy/lbank/…` | `https://api.lbkex.com` | REST da LBank sem CORS (bookTicker, withdrawConfigs) |
| `/proxy/lbank-ws` | `wss://www.lbkex.net/ws/V2/` | WS da LBank não abre direto do navegador; o proxy remove o Origin |
| `/proxy/mexc/…` | `https://api.mexc.com` | REST da MEXC sem CORS (WS de spot é protobuf) |
| `/proxy/kucoin/…` | `https://api.kucoin.com` | REST da KuCoin sem CORS (token do WS, livro, taxas de saque); o WS em si conecta direto |
Atenção: a chave REST é `/proxy/lbank/` (com barra) para não capturar `/proxy/lbank-ws`.

Snapshot REST de spot (fallback de mercado parado): Binance `api/v3/ticker/bookTicker`, Gate `spot/tickers`, Bybit `v5/market/orderbook`,
OKX `v5/market/ticker`, LBank `v2/supplement/ticker/bookTicker.do` (proxy).

## Limitações conhecidas
- Taxas padrão são de taker sem desconto VIP; o usuário deve ajustar.
- Taxa do spot da Gate pode ser cobrada em moeda (reduz a quantidade): não modelado, por isso existe aviso de pontas desequilibradas.
- Liquidação estimada ignora faixas de risco da corretora.
- Alertas só funcionam com a aba aberta.
- LBank/MEXC dependem do proxy local: publicar online exige um proxy equivalente.
- Spot x spot usa só o MELHOR preço do livro; se o tamanho não cabe, o resultado real é pior (o app avisa).
- Taxas de saque de Binance/Gate/Bybit/OKX/MEXC exigem login na API → o usuário digita.
