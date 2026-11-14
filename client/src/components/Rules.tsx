import type { Card } from '@nomercy/shared';
import { Modal } from './Modal';
import { PlayingCard } from './PlayingCard';

const hierarchy: Card[] = [
  { id: 'r1', color: 'BLACK', value: 7 },
  { id: 'r2', color: 'BLUE', value: 7 },
  { id: 'r3', color: 'RED', value: 7 },
  { id: 'r4', color: 'GREEN', value: 7 },
  { id: 'r5', color: 'YELLOW', value: 7 },
];

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet font-display text-xs text-white">
        {n}
      </span>
      <div>
        <h3 className="font-bold text-white">{title}</h3>
        <div className="mt-1 space-y-1 text-sm text-mist/80">{children}</div>
      </div>
    </section>
  );
}

export function Rules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Como jogar" wide>
      <div className="space-y-5">
        <p className="rounded-2xl bg-gold/10 p-3 text-sm font-semibold text-gold ring-1 ring-gold/30">
          O objetivo é prever <b>exatamente</b> quantas rodadas você vai vencer. Vencer demais também é errar.
        </p>
        <Section n={1} title="Baralho">
          <p>55 cartas: cinco cores, cada uma com cartas de 1 a 10 e um coringa.</p>
          <div className="flex flex-wrap gap-2 pt-2">
            {hierarchy.map((c) => (
              <PlayingCard key={c.id} card={c} size="sm" />
            ))}
          </div>
          <p className="pt-1">
            Ordem das cores (mais forte → mais fraca): <b>Preto › Azul-escuro › Vermelho › Verde › Amarelo</b>. A cor só desempata cartas
            de mesmo número.
          </p>
        </Section>
        <Section n={2} title="Hierarquia">
          <p>Coringa maximizado › 10 › 9 › … › 1 › Coringa minimizado.</p>
          <p>Número maior sempre vence número menor, independentemente da cor. Entre coringas da mesma modalidade, vence a cor mais forte.</p>
        </Section>
        <Section n={3} title="Partidas e rodadas">
          <p>
            A partida 1 dá 1 carta a cada jogador, a partida 2 dá 2 cartas, e assim por diante. Cada partida tem tantas rodadas quanto cartas
            na mão. O jogo vai até a partida 12 (12 cartas na mão). Com muitos jogadores, termina antes se o baralho não der para todos (2 a 4 jogadores: 12 partidas · 5: 11 · 6: 9 · 7: 7 · 8: 6).
          </p>
          <p>A cada partida o baralho inteiro é embaralhado (mistura aleatória + 7 embaralhadas riffle, como na mesa), cortado e distribuído uma carta por vez, começando à esquerda de quem embaralhou. Ninguém é favorecido: ao fim de cada partida dá para ver as cartas que todos receberam, e o placar mostra a sorte de cada um.</p>
          <p>Em cada rodada, todos jogam uma carta, na ordem da mesa. Não é preciso seguir a cor. A carta mais forte vence a rodada.</p>
          <p>Quem embaralha avança uma posição a cada partida; quem está à esquerda dele começa os palpites e a primeira rodada da partida. Nas rodadas seguintes, <b>quem venceu a rodada anterior começa jogando</b>.</p>
          <p>As rodadas que você vence ficam num montinho de cartas recolhidas ao seu lado.</p>
        </Section>
        <Section n={4} title="Palpites">
          <p>Antes das rodadas, cada jogador diz quantas vai vencer (de 0 até o número de rodadas).</p>
          <p>
            <b>Regra do último:</b> quem palpita por último não pode escolher um valor que faça a soma dos palpites ser igual ao número de
            rodadas.
           Exceção: na primeira partida (às cegas) não há essa restrição — todos podem palpitar livremente.</p>
        </Section>
        <Section n={5} title="Coringas">
          <p>Ao jogar um coringa, escolha <b className="text-gold">MAXIMIZAR</b> (vence tudo) ou <b className="text-cyan-300">MINIMIZAR</b> (perde para tudo).</p>
          <p>Na partida às cegas e no desempate, todos os coringas são maximizados.</p>
        </Section>
        <Section n={6} title="Primeira partida às cegas">
          <p>Você recebe 1 carta mas não pode vê-la — só enxerga as cartas dos adversários. Palpite 0 ou 1 (sem restrição para o último) e depois todas são reveladas juntas.</p>
        </Section>
        <Section n={7} title="Pontuação">
          <p>Acertou o palpite: <b>10 + palpite</b> pontos. Errou: <b>0</b>. Ex.: palpite 2 e venceu 2 → 12 pontos.</p>
        </Section>
        <Section n={8} title="Desempate">
          <p>
            Empate na liderança ao final? Os empatados disputam uma partida extra às cegas (1 carta, coringas maximizados). Acertar 0 vale 10,
            acertar 1 vale 11. Persistindo o empate, repete-se só entre os que continuam empatados.
          </p>
        </Section>
        <Section n={9} title="Modo Roleta Sem Piedade (2 a 6 jogadores)">
          <p>
            A cada rodada: baralho de 20 cartas (6 de cada uma de 3 cores, 1 coringa e a <b>Carta do Diabo</b>), uma <b>cor da mesa</b> sorteada e 5
            cartas para cada um.
          </p>
          <p>
            Na sua vez, jogue de 1 a 3 cartas <b>viradas</b> dizendo que são da cor da mesa (pode blefar). Coringas valem qualquer cor. O próximo
            pode jogar também ou gritar <b>MENTIRA!</b> — sem cartas, é obrigado a acusar.
          </p>
          <p>
            Se havia carta de outra cor, quem jogou vai para a roleta; se era verdade, quem acusou vai. Se a jogada acusada tinha o{' '}
            <b>Carta do Diabo</b>, todos menos quem jogou vão para a roleta.
          </p>
          <p>Roleta: 6 espaços e 1 bala; a cada puxada a chance aumenta. Quem for atingido sai. O último de pé vence.</p>
        </Section>
      </div>
    </Modal>
  );
}
