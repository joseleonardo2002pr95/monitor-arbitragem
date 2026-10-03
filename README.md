# Monitor de Arbitragem — Spot x Futuros e Spot x Spot

Acompanha **ao vivo** operações de arbitragem cripto, usando só dados públicos das corretoras (não precisa de chave de API nem de login).

- **Spot x Futuros:** compra no spot + venda (short) no futuro perpétuo. Mostra spreads de entrada e saída, PnL real, funding, distância da liquidação, sinal de decisão e simulador de aumento de mão.
- **Spot x Spot:** compra numa corretora, transfere e vende em outra. Mostra a diferença real com a **profundidade do livro** (preço médio de verdade, não só o melhor preço), taxa de saque, melhor valor de entrada e as etapas da operação.

Corretoras: Binance, Gate, Bybit, OKX, WEEX e Bitget (spot e futuros); LBank, MEXC e KuCoin (spot).

## Como rodar

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
git clone https://github.com/joseleonardo2002pr95/monitor-arbitragem.git
cd monitor-arbitragem
npm install
npm run dev
```

Depois abra **http://localhost:5173** no navegador.

> Use `npm run dev` (não abra o `index.html` direto): LBank, MEXC e KuCoin passam por um proxy local do servidor de desenvolvimento.

As operações ficam salvas **só no seu navegador**. Use o botão **Backup** para guardar um arquivo.

## Mais detalhes

- Status das etapas e próximos passos: [PROGRESSO.md](PROGRESSO.md)
- Como funciona por dentro (fórmulas, endpoints das corretoras): [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- Testes dos cálculos: `npm test`

---

Ferramenta de estudo e acompanhamento. **Não é recomendação de investimento.** Arbitragem tem riscos: livro fino, oscilação durante a transferência, funding, liquidação e saques/depósitos suspensos.
