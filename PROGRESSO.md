# PROGRESSO — Monitor de Arbitragem (Spot x Futuros)

> **Para qualquer IA que continuar este projeto:** leia este arquivo inteiro primeiro, depois `docs/ARQUITETURA.md`.
> Atualize este arquivo ao terminar cada etapa (marque `[x]`, escreva o que ficou pendente e a data).
> Dono: José Leonardo. Projeto iniciado em 2026-10-02 com Claude Code (Opus 5.5). #gerado-por-ia

## Objetivo
Web app para acompanhar operações de arbitragem cripto **Spot (comprado) x Futuros perpétuos (vendido)**,
com preços AO VIVO das corretoras, PnL real (usando bid/ask), funding, risco de liquidação,
sinal de decisão e simulador de aumento de mão (DCA). Público: iniciante.

**Prioridade combinada com José:** 1º deixar FUNCIONAL ✅. 2º design (próxima fase).

## Como rodar
```bash
cd ~/Documents/Projetos/monitor-arbitragem
npm install      # só na primeira vez
npm run dev      # abre em http://localhost:5173
npm test         # 35 testes
npm run build    # versão de produção em dist/
```
No Claude Code (desktop) também existe a configuração `monitor-arbitragem` em `Obsidian Vault/.claude/launch.json`.

## Etapas

Legenda: `[x]` concluída · `[~]` em andamento · `[ ]` não começada

- [x] **E0 — Setup**: Vite + React 19 + TypeScript + Vitest em `~/Documents/Projetos/monitor-arbitragem` (fora do cofre do Obsidian, para não indexar `node_modules`).
- [x] **E1 — Núcleo de cálculo** (`src/core/`): spread de entrada/saída/abertura, taxas, PnL com bid/ask, funding, empate, preço médio (DCA), liquidação estimada, sinal, largura do livro. 15 testes passando.
- [x] **E2 — Preços ao vivo** (`src/exchanges/`): Binance, Gate, Bybit e OKX, spot + perpétuo, com reconexão automática. Histórico de funding via REST nas 4. **Testado ao vivo.**
- [x] **E3 — Cadastro da operação**: formulário (moedas ou USDT, data da entrada, alavancagem 1–10x, taxas taker/maker, regras de saída), spread líquido instantâneo, várias operações, salvo no navegador.
- [x] **E4 — Painel ao vivo**: preços, largura do livro, spreads, PnL por ponta e combinado, funding (taxa, próximo pagamento, contagem, acumulado), sinal, ordem limite sugerida para a saída.
- [x] **E5 — Simulador de DCA**: slider 0–200%, novo médio, novo spread, nova liquidação; botão para registrar o aumento real.
- [x] **E6 — Escudo de liquidação**: barra + distância (%), estimada ou digitada.
- [x] **E7 — Alertas**: som + notificação ao mudar para verde/azul/vermelho (aba aberta).
- [x] **E8 — Didático**: tooltips (?) em todos os termos + guia de emergência.
- [x] **E9 — Exportar**: JSON por operação, imprimir/PDF, backup/importar geral, histórico de encerradas com total.
- [x] **E11 — Spot x Spot** (pedido de José em 02/10, antes do design): nova aba. Compara a mesma moeda em duas corretoras ao vivo (diferença bruta nos dois sentidos, largura do livro, quantidade no melhor preço), simulador por valor em USDT, tamanho mínimo que paga a taxa fixa de saque, etapas (observando → comprado → em trânsito → na corretora de venda → vendido), preço de empate/alvo, quanto o preço pode cair, "desistir e vender de volta", sinal, alertas, exportar/imprimir, histórico. **LBank** e **MEXC** adicionadas (só spot). Taxa de saque da LBank buscada automaticamente. 27 testes (inclui a operação real VON). Testado ao vivo: LBank→Gate (VON) e MEXC→OKX (BTC).
- [x] **E12 — Profundidade do livro + KuCoin** (03/10, pedido de José após prejuízo real no VON): os cálculos usam o PREÇO MÉDIO REAL de uma ordem a mercado nível por nível (`src/core/depth.ts`). Spot x spot mostra "real" × "o que parece pelo melhor preço", preço médio e deslize de compra/venda, tabelas do livro com os níveis que a sua quantidade usaria, melhor valor de entrada agora (faixa com lucro) e sinal 🔴 "Parece lucro, mas o livro não aguenta". Spot x futuros: spread de saída REAL da ponta spot. **KuCoin** adicionada (spot, WS com token, taxa de saque automática). MEXC também com profundidade. Limite de 10 s para conectar WebSocket. 33 testes (reproduz a venda real VON #2: parecia +$0,65, real −$0,75).
- [x] **E13 — WEEX** (03/10, pedido de José): spot (livro com profundidade, WS snapshot+mudanças) **e futuros perpétuos** (livro, mark/índice, funding atual a cada 60 s via REST, histórico de funding). Taxa de saque automática por rede (API pública). Tudo com CORS liberado, sem proxy. 35 testes.
- [x] **E14 — Bitget** (03/10, pedido de José): spot (books15) e futuros perpétuos USDT (books15 + ticker com mark, índice, funding e próximo pagamento), histórico de funding e taxa de saque automática por rede. CORS liberado, sem proxy.
- [ ] **E10 — Design** (PRÓXIMA): visual fintech escuro caprichado (prompt original: fundo #0B0E14, glassmorphism, verde #10B981, azul #3B82F6, amarelo #F59E0B, Inter), animações (Framer Motion), layout mobile refinado. Hoje existe só um CSS funcional mínimo em `src/App.css`.

## Diário de execução
(entradas mais recentes no final)

- 2026-10-02 — E0 concluída. Stack Vite+React+TS (sem Next.js: a fase funcional não precisa de servidor). Dados ao vivo direto do navegador.
- 2026-10-02 — E1–E9 concluídas e testadas no navegador (desktop e celular 375px, sem rolagem lateral).
  - Descoberta: a Binance mudou os streams de futuros (`/public/` para book e `/market/` para mark/funding); o caminho antigo fica mudo.
  - Descoberta: PUMPBTC na Binance tem funding de 4 em 4h e estava muito positivo (~0,34%/4h) → short recebia bem para esperar.
  - Correção de lógica: o sinal azul (aumentar a mão) agora usa o spread de ABERTURA. Com o livro largo da Gate (~1,4%), a saída parecia muito pior, mas aumentar não melhorava quase nada.
  - Dados de teste apagados do navegador ao final.

- 2026-10-02 — E11 Spot x Spot concluída.
  - LBank e MEXC não liberam CORS → **proxy no servidor do Vite** (`vite.config.ts`): `/proxy/lbank/` (REST), `/proxy/lbank-ws` (WebSocket; direto do navegador não abre), `/proxy/mexc` (REST, consultado a cada 1 s). Só funciona com `npm run dev`/`preview`.
  - Moedas paradas: o WS da Gate/LBank só manda quando o livro muda → `subscribeSpot` tira uma foto via REST no início e sempre que o WS fica 5 s quieto.
  - Sinal: diferença boa mas com menos de 50% do tamanho no melhor preço → amarelo "livro fino", não verde.
  - Bug corrigido: o formulário de cada etapa herdava valores da etapa anterior (agora `key={op.stage}`).

- 2026-10-03 — E12 concluída. Canais de profundidade: Binance `@depth20@100ms`, Gate `spot.order_book` (20), Bybit `orderbook.50` (snapshot+delta), OKX `books5` (só 5 níveis), LBank `depth 50` (proxy), MEXC REST `depth` 1 s (proxy), KuCoin `/spotMarket/level2Depth50` (token via `/proxy/kucoin/api/v1/bullet-public`). Código de spot movido para `src/exchanges/spot.ts`.

- 2026-10-03 — E13 WEEX. Símbolos: spot `BTCUSDT_SPBL`, futuros `cmt_btcusdt`. WS spot `wss://ws-spot.weex.com/v2/ws/public` e futuros `wss://ws-contract.weex.com/v2/ws/public`, canal `depth.{sym}.15` (+ `ticker.{sym}` nos futuros). Servidor manda `{"event":"ping"}` → responder `{"event":"pong","time":…}` (testado 75 s). Funding: `capi/v2/market/currentFundRate` (`timestamp` = último pagamento; próximo = último + `collectCycle` min) e `getHistoryFundRate`.

- 2026-10-03 — E14 Bitget. WS único `wss://ws.bitget.com/v2/ws/public` (`instType` SPOT ou USDT-FUTURES; ping = texto "ping"). REST: `api/v2/spot/market/orderbook`, `api/v2/mix/market/history-fund-rate`, `api/v2/spot/public/coins?coin=X` (taxas de saque). Símbolo `BTCUSDT` nos dois mercados.

## Pendências / ideias futuras (não decididas)
- Status de saque/depósito por rede (Gate e KuCoin publicam sem login) para avisar antes de comprar.
- OKX com livro completo (canal `books` com checksum) em vez de 5 níveis.
- Spot x Spot: usar a profundidade do livro (vários níveis) para calcular o preço médio real de execução; scanner de várias moedas.
- E10 Design.
- Ler posições reais via chave de API **somente leitura** (o próprio José cria e cola).
- Alertas com a página fechada (Telegram) → precisaria de um servidor 24h.
- Histórico do spread (gráfico) e regra "fechar se passar de X% por Y horas".
- Scanner de oportunidades (vários pares ao mesmo tempo).
- Modelar a taxa do spot cobrada em moeda (Gate).
- MEXC (WS de spot em protobuf).
- Publicar online (hoje roda localmente).
