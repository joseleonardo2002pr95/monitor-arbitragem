export function EmergencyGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Guia rápido de emergência</h2>

        <h3>A moeda subiu MUITO</h3>
        <ul>
          <li>O spot ganha e o futuro perde quase o mesmo valor. O resultado combinado quase não muda.</li>
          <li>
            <b>O perigo é a liquidação do short.</b> O lucro do spot está em outra corretora e não serve de margem. Olhe a
            barra de liquidação.
          </li>
          <li>Se a distância ficar abaixo de 15%: adicione margem no futuro OU reduza a posição nas DUAS pontas juntas.</li>
        </ul>

        <h3>A moeda caiu MUITO</h3>
        <ul>
          <li>O spot perde e o futuro ganha. O resultado combinado quase não muda.</li>
          <li>Não há risco de liquidação no short quando o preço cai.</li>
          <li>Não venda só o spot "para parar a perda". Isso desfaz a proteção e deixa você vendido a descoberto.</li>
        </ul>

        <h3>O spread alargou e não volta</h3>
        <ul>
          <li>Contrato perpétuo NÃO vence: nada obriga o spread a fechar.</li>
          <li>Olhe o funding. Positivo = você recebe para esperar. Negativo = esperar custa.</li>
          <li>Confira se saques/depósitos da moeda estão suspensos ou se há notícia de deslistagem.</li>
          <li>Defina ANTES um limite: "se passar de X% por Y horas, eu fecho".</li>
        </ul>

        <h3>Spot x Spot: a moeda caiu durante a transferência</h3>
        <ul>
          <li>Aqui NÃO há proteção. Veja no painel o "preço de empate" e quanto o preço ainda pode cair.</li>
          <li>Decida ANTES quanto aceita perder. Esperar o preço voltar é uma aposta, não arbitragem.</li>
          <li>Demorou demais para chegar? Use o TxID do histórico de saque para conferir na rede e falar com o suporte.</li>
          <li>Depósito suspenso no destino: não envie. Se já enviou, fale com o suporte da corretora de destino com o TxID.</li>
        </ul>

        <h3>Regra de ouro</h3>
        <p>Abra e feche as duas pontas sempre juntas, na mesma quantidade. Prefira ordem limite na saída.</p>

        <button onClick={onClose}>Entendi</button>
      </div>
    </div>
  );
}
