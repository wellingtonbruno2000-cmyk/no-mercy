import { describe, expect, it } from 'vitest';
import {
  advance,
  allowedBids,
  compareCards,
  createDeck,
  createGame,
  currentActorId,
  decideBid,
  decidePlay,
  forbiddenBid,
  GameError,
  getPlayerView,
  isHiddenCard,
  maxHandsFor,
  placeBid,
  playCard,
  scoreFor,
  shuffle,
  trickWinner,
  type Card,
  type CardColor,
  type GameState,
  type JokerMode,
  type PlayerInfo,
} from '../src';

const c = (color: CardColor, value: number | 'JOKER'): Card => ({ id: `${color}-${value}`, color, value });
const pl = (card: Card, jokerMode: JokerMode | null = null, playerId = 'x') => ({ card, jokerMode, playerId });

function players(n: number): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: false }));
}

/** RNG determinístico (mulberry32). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return (max: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * max);
  };
}

describe('baralho', () => {
  it('tem exatamente 55 cartas únicas, 11 por cor', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(55);
    expect(new Set(deck.map((d) => d.id)).size).toBe(55);
    for (const color of ['BLACK', 'BLUE', 'RED', 'GREEN', 'YELLOW']) {
      const set = deck.filter((d) => d.color === color);
      expect(set).toHaveLength(11);
      expect(set.filter((d) => d.value === 'JOKER')).toHaveLength(1);
      expect(set.filter((d) => typeof d.value === 'number').map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });

  it('embaralhamento preserva as cartas', () => {
    const s = shuffle(createDeck(), seeded(1));
    expect(s).toHaveLength(55);
    expect(new Set(s.map((d) => d.id)).size).toBe(55);
    expect(s.map((d) => d.id)).not.toEqual(createDeck().map((d) => d.id));
  });

  it('quantidade de partidas por jogadores', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(maxHandsFor)).toEqual([27, 18, 13, 11, 9, 7, 6]);
  });
});

describe('comparação de cartas', () => {
  it('cor desempata números iguais', () => {
    expect(compareCards(pl(c('BLACK', 10)), pl(c('BLUE', 10)))).toBeGreaterThan(0);
    expect(compareCards(pl(c('BLUE', 10)), pl(c('RED', 10)))).toBeGreaterThan(0);
    expect(compareCards(pl(c('RED', 5)), pl(c('GREEN', 5)))).toBeGreaterThan(0);
    expect(compareCards(pl(c('GREEN', 2)), pl(c('YELLOW', 2)))).toBeGreaterThan(0);
  });

  it('número maior vence independente da cor', () => {
    expect(compareCards(pl(c('YELLOW', 3)), pl(c('BLACK', 2)))).toBeGreaterThan(0);
    expect(compareCards(pl(c('YELLOW', 10)), pl(c('BLACK', 9)))).toBeGreaterThan(0);
  });

  it('coringa maximizado vence tudo; minimizado perde para tudo', () => {
    expect(compareCards(pl(c('YELLOW', 'JOKER'), 'MAX'), pl(c('BLACK', 10)))).toBeGreaterThan(0);
    expect(compareCards(pl(c('BLACK', 'JOKER'), 'MIN'), pl(c('YELLOW', 1)))).toBeLessThan(0);
    expect(compareCards(pl(c('BLACK', 'JOKER'), 'MAX'), pl(c('BLUE', 'JOKER'), 'MAX'))).toBeGreaterThan(0);
    expect(compareCards(pl(c('RED', 'JOKER'), 'MIN'), pl(c('GREEN', 'JOKER'), 'MIN'))).toBeGreaterThan(0);
  });

  it('exemplo oficial: 1 vermelho vence com coringas minimizados', () => {
    const w = trickWinner([
      pl(c('BLACK', 'JOKER'), 'MIN', 'a'),
      pl(c('BLUE', 'JOKER'), 'MIN', 'b'),
      pl(c('RED', 1), null, 'c'),
      pl(c('GREEN', 1), null, 'd'),
    ]);
    expect(w.playerId).toBe('c');
    const w2 = trickWinner([pl(c('BLUE', 'JOKER'), 'MIN', 'b'), pl(c('BLACK', 'JOKER'), 'MIN', 'a')]);
    expect(w2.playerId).toBe('a');
  });
});

describe('pontuação', () => {
  it('10 + palpite ao acertar, 0 ao errar', () => {
    expect(scoreFor(0, 0)).toBe(10);
    expect(scoreFor(2, 2)).toBe(12);
    expect(scoreFor(4, 4)).toBe(14);
    expect(scoreFor(4, 5)).toBe(0);
    expect(scoreFor(4, 3)).toBe(0);
  });
});

function bidAll(g: GameState, pick: (allowed: number[]) => number = (a) => a[0]): GameState {
  while (g.phase === 'BIDDING') g = placeBid(g, currentActorId(g)!, pick(allowedBids(g)));
  return g;
}

describe('ordem da mesa', () => {
  it('quem embaralha avança; à esquerda começa palpites e rodadas', () => {
    let g = createGame(players(4), { startDealerSeat: 0, randomInt: seeded(3) });
    expect(g.participants).toEqual(['p1', 'p2', 'p3', 'p0']);
    g = bidAll(g);
    g = advance(g, seeded(4)); // fim da partida às cegas
    g = advance(g, seeded(5)); // partida 2
    expect(g.handNumber).toBe(2);
    expect(g.players[g.dealerSeat].id).toBe('p1');
    expect(g.participants[0]).toBe('p2');
    g = bidAll(g);
    expect(g.turnOrder).toEqual(['p2', 'p3', 'p0', 'p1']);
    for (let i = 0; i < 4; i++) {
      const id = currentActorId(g)!;
      g = playCard(g, id, g.hands[id][0].id, g.hands[id][0].value === 'JOKER' ? 'MAX' : null);
    }
    expect(g.phase).toBe('ROUND_RESULT');
    const winner = g.lastRound!.winnerId;
    g = advance(g);
    // Quem venceu a rodada começa a próxima, seguindo a ordem da mesa a partir dele.
    const seats = ['p0', 'p1', 'p2', 'p3'];
    const w = seats.indexOf(winner);
    expect(g.turnOrder).toEqual([...seats.slice(w), ...seats.slice(0, w)]);
    // Próxima partida: começa de novo à esquerda de quem embaralhou, não com o último vencedor.
    while (g.phase !== 'HAND_RESULT') {
      if (g.phase === 'ROUND_RESULT') g = advance(g);
      else {
        const id = currentActorId(g)!;
        g = playCard(g, id, g.hands[id][0].id, g.hands[id][0].value === 'JOKER' ? 'MAX' : null);
      }
    }
    g = advance(g, seeded(6));
    expect(g.players[g.dealerSeat].id).toBe('p2');
    expect(g.participants[0]).toBe('p3');
    g = bidAll(g);
    expect(g.turnOrder[0]).toBe('p3');
  });

  it('vencedor de cada rodada inicia a seguinte (vários cenários)', () => {
    for (let seed = 30; seed < 40; seed++) {
      let g = createGame(players(5), { randomInt: seeded(seed) });
      while (g.handNumber < 4 || g.phase !== 'GAME_OVER') {
        if (g.phase === 'GAME_OVER') break;
        if (g.phase === 'BIDDING') g = placeBid(g, currentActorId(g)!, allowedBids(g)[0]);
        else if (g.phase === 'PLAYING') {
          const id = currentActorId(g)!;
          g = playCard(g, id, g.hands[id][0].id, g.hands[id][0].value === 'JOKER' ? 'MIN' : null);
        } else {
          const prev = g;
          g = advance(g);
          if (prev.phase === 'ROUND_RESULT' && g.phase === 'PLAYING') {
            expect(g.turnOrder[0]).toBe(prev.lastRound!.winnerId);
          }
          if (g.stage === 'MAIN' && (g.phase === 'BIDDING' || (g.phase === 'PLAYING' && g.roundNumber === 1))) {
            expect(g.participants[0]).toBe(g.players[(g.dealerSeat + 1) % 5].id);
          }
        }
      }
    }
  });
});

describe('palpites', () => {
  it('último palpite não pode fechar a soma', () => {
    let g = createGame(players(4), { startDealerSeat: 0, randomInt: seeded(7) });
    // Avança até a partida 4 (4 rodadas).
    for (let h = 1; h < 4; h++) {
      g = bidAll(g);
      while (g.phase !== 'HAND_RESULT') {
        if (g.phase === 'ROUND_RESULT') g = advance(g);
        else {
          const id = currentActorId(g)!;
          const card = g.hands[id][0];
          g = playCard(g, id, card.id, card.value === 'JOKER' ? 'MIN' : null);
        }
      }
      g = advance(g, seeded(h));
    }
    expect(g.cardsPerPlayer).toBe(4);
    g = placeBid(g, currentActorId(g)!, 1);
    g = placeBid(g, currentActorId(g)!, 1);
    g = placeBid(g, currentActorId(g)!, 1);
    expect(forbiddenBid(g)).toBe(1);
    expect(allowedBids(g)).toEqual([0, 2, 3, 4]);
    const last = currentActorId(g)!;
    expect(() => placeBid(g, last, 1)).toThrow(GameError);
    expect(() => placeBid(g, last, 5)).toThrow(GameError);
    expect(() => placeBid(g, 'p9', 0)).toThrow(GameError);
    g = placeBid(g, last, 0);
    expect(g.phase).toBe('PLAYING');
  });

  it('soma anterior igual ao total proíbe zero', () => {
    let g = createGame(players(4), { startDealerSeat: 0, randomInt: seeded(9) });
    g = placeBid(g, 'p1', 1);
    g = placeBid(g, 'p2', 0);
    g = placeBid(g, 'p3', 0);
    expect(forbiddenBid(g)).toBe(0);
    expect(allowedBids(g)).toEqual([1]);
  });

  it('palpite fora de ordem ou repetido é rejeitado', () => {
    const g = createGame(players(5), { startDealerSeat: 2, randomInt: seeded(1) });
    expect(() => placeBid(g, 'p0', 0)).toThrow(/vez/);
    expect(() => placeBid(g, 'p3', 0.5)).toThrow(GameError);
  });
});

describe('partida às cegas e privacidade', () => {
  it('jogador não recebe a própria carta, mas vê as dos adversários', () => {
    const g = createGame(players(4), { startDealerSeat: 0, randomInt: seeded(11) });
    expect(g.blind).toBe(true);
    for (const p of g.players) {
      const v = getPlayerView(g, p.id);
      expect(v.myHand).toHaveLength(1);
      expect(isHiddenCard(v.myHand[0])).toBe(true);
      const own = g.hands[p.id][0];
      const json = JSON.stringify(v);
      expect(json).not.toContain(own.id);
      expect(Object.keys(v.visibleHands).sort()).toEqual(g.players.filter((x) => x.id !== p.id).map((x) => x.id).sort());
    }
  });

  it('revela simultaneamente com coringas maximizados e pontua', () => {
    let g = createGame(players(4), { startDealerSeat: 0, randomInt: seeded(12) });
    g.hands = { p1: [c('YELLOW', 'JOKER')], p2: [c('BLACK', 10)], p3: [c('RED', 2)], p0: [c('GREEN', 7)] };
    g = placeBid(g, 'p1', 1);
    g = placeBid(g, 'p2', 1);
    g = placeBid(g, 'p3', 0);
    expect(forbiddenBid(g)).toBeNull(); // soma já passou do total
    expect(allowedBids(g)).toEqual([0, 1]);
    g = placeBid(g, 'p0', 0);
    expect(g.phase).toBe('ROUND_RESULT');
    expect(g.lastRound!.winnerId).toBe('p1');
    expect(g.lastRound!.plays.find((p) => p.playerId === 'p1')!.jokerMode).toBe('MAX');
    g = advance(g);
    expect(g.phase).toBe('HAND_RESULT');
    expect(g.lastHandResult!.points).toEqual({ p1: 11, p2: 0, p3: 10, p0: 10 });
    expect(g.scores).toEqual({ p0: 10, p1: 11, p2: 0, p3: 10 });
  });

  it('em partidas normais adversários são só contagem', () => {
    let g = createGame(players(4), { startDealerSeat: 0, randomInt: seeded(13) });
    g = bidAll(g);
    g = advance(g);
    g = advance(g);
    const v = getPlayerView(g, 'p0');
    expect(v.myHand.every((x) => !isHiddenCard(x))).toBe(true);
    expect(v.visibleHands).toEqual({});
    const others = ['p1', 'p2', 'p3'].flatMap((id) => g.hands[id].map((x) => x.id));
    // Histórico de partidas anteriores pode citar ids (baralho reembaralhado); verificamos o estado atual.
    const json = JSON.stringify({ ...v, handHistory: [], lastHandResult: null, lastRound: null });
    for (const id of others) expect(json).not.toContain(`"${id}"`);
  });
});

describe('coringas em partidas normais', () => {
  it('exige escolha e valida modo', () => {
    let g = createGame(players(4), { startDealerSeat: 0, randomInt: seeded(14) });
    g = bidAll(g);
    g = advance(g);
    g = advance(g);
    g = bidAll(g);
    const id = currentActorId(g)!;
    g.hands[id] = [c('BLACK', 'JOKER'), c('RED', 3)];
    expect(() => playCard(g, id, 'BLACK-JOKER', null)).toThrow(/maximizar/);
    expect(() => playCard(g, id, 'RED-3', 'MAX')).toThrow(GameError);
    expect(() => playCard(g, id, 'GREEN-9', null)).toThrow(GameError);
    const g2 = playCard(g, id, 'BLACK-JOKER', 'MIN');
    expect(g2.currentTrick[0].jokerMode).toBe('MIN');
  });
});

describe('desempate', () => {
  function toEnd(g: GameState): GameState {
    let guard = 0;
    while (g.phase !== 'GAME_OVER' && guard++ < 100000) {
      if (g.phase === 'ROUND_RESULT' || g.phase === 'HAND_RESULT') g = advance(g);
      else if (g.phase === 'BIDDING') g = placeBid(g, currentActorId(g)!, decideBid(getPlayerView(g, currentActorId(g)!)));
      else {
        const id = currentActorId(g)!;
        const d = decidePlay(getPlayerView(g, id));
        g = playCard(g, id, d.cardId, d.jokerMode);
      }
    }
    return g;
  }

  it('empate no topo inicia desempate às cegas só com os empatados', () => {
    let g = createGame(players(4), { startDealerSeat: 0, randomInt: seeded(20) });
    // Simula fim do jogo principal com empate.
    g.handNumber = g.maxHands;
    g.phase = 'HAND_RESULT';
    g.scores = { p0: 50, p1: 70, p2: 70, p3: 30 };
    g.lastHandResult = null;
    g = advance(g);
    expect(g.stage).toBe('TIEBREAK');
    expect(g.blind).toBe(true);
    expect(g.cardsPerPlayer).toBe(1);
    expect([...g.participants].sort()).toEqual(['p1', 'p2']);
    expect(Object.keys(g.hands).sort()).toEqual(['p1', 'p2']);
    // Último não pode fechar soma = 1.
    g = placeBid(g, g.participants[0], 0);
    expect(allowedBids(g)).toEqual([0]);
    g.hands[g.participants[0]] = [c('YELLOW', 'JOKER')];
    g.hands[g.participants[1]] = [c('BLACK', 10)];
    g = placeBid(g, g.participants[1], 0);
    g = advance(g); // HAND_RESULT
    const first = g.participants[0];
    expect(g.lastHandResult!.points[first]).toBe(0);
    expect(g.lastHandResult!.points[g.participants[1]]).toBe(10);
    expect(g.scores.p1).toBe(70); // histórico do jogo principal não muda
    g = advance(g);
    expect(g.phase).toBe('GAME_OVER');
    expect(g.championId).toBe(g.participants[1]);
    expect(g.tiebreakHistory).toHaveLength(1);
    expect(g.ranking![0].playerId).toBe(g.championId);
  });

  it('repete enquanto houver empate no desempate', () => {
    let g = createGame(players(5), { startDealerSeat: 0, randomInt: seeded(21) });
    g.handNumber = g.maxHands;
    g.phase = 'HAND_RESULT';
    g.scores = { p0: 40, p1: 40, p2: 40, p3: 10, p4: 0 };
    g = advance(g);
    expect(g.participants).toHaveLength(3);
    // Forçamos cartas para que dois empatem com 10.
    const [a, b, d] = g.participants;
    g.hands[a] = [c('BLACK', 'JOKER')];
    g.hands[b] = [c('GREEN', 2)];
    g.hands[d] = [c('YELLOW', 3)];
    g = placeBid(g, a, 0); // erra (vence)
    g = placeBid(g, b, 0);
    g = placeBid(g, d, 0); // soma 0 != 1, permitido
    g = advance(g);
    expect(g.lastHandResult!.points).toEqual({ [a]: 0, [b]: 10, [d]: 10 });
    g = advance(g);
    expect(g.stage).toBe('TIEBREAK');
    expect(g.tiebreakNumber).toBe(2);
    expect([...g.participants].sort()).toEqual([b, d].sort());
    g = toEnd(g);
    expect(g.phase).toBe('GAME_OVER');
    expect([b, d]).toContain(g.championId);
  });
});

describe('jogos completos com bots', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    it(`${n} jogadores: ${maxHandsFor(n)} partidas, sem cartas duplicadas, campeão único`, () => {
      for (let seed = 1; seed <= (n <= 3 ? 2 : 6); seed++) {
        const rng = seeded(seed * 100 + n);
        let g = createGame(players(n), { randomInt: rng });
        let guard = 0;
        while (g.phase !== 'GAME_OVER' && guard++ < 100000) {
          if (g.phase === 'BIDDING') {
            if (Object.keys(g.bids).length === 0) {
              // Distribuição recém-feita: sem cartas repetidas e quantidade correta.
              const all = Object.values(g.hands).flat().map((x) => x.id);
              expect(new Set(all).size).toBe(all.length);
              expect(all.length).toBe(g.cardsPerPlayer * g.participants.length);
            }
            const id = currentActorId(g)!;
            const v = getPlayerView(g, id);
            const bid = decideBid(v);
            expect(v.allowedBids).toContain(bid);
            g = placeBid(g, id, bid);
          } else if (g.phase === 'PLAYING') {
            const id = currentActorId(g)!;
            const d = decidePlay(getPlayerView(g, id));
            g = playCard(g, id, d.cardId, d.jokerMode);
          } else {
            g = advance(g, rng);
          }
        }
        expect(g.phase).toBe('GAME_OVER');
        expect(g.handHistory).toHaveLength(maxHandsFor(n));
        g.handHistory.forEach((h, i) => {
          expect(h.cardsPerPlayer).toBe(i + 1);
          expect(h.rounds).toHaveLength(i + 1);
          const used = h.rounds.flatMap((r) => r.plays.map((p) => p.card.id));
          expect(new Set(used).size).toBe(used.length);
          const sumBids = Object.values(h.bids).reduce((a, b) => a + b, 0);
          expect(sumBids).not.toBe(h.cardsPerPlayer);
          const sumTricks = Object.values(h.tricks).reduce((a, b) => a + b, 0);
          expect(sumTricks).toBe(h.cardsPerPlayer);
        });
        const top = Math.max(...Object.values(g.scores));
        const tied = Object.keys(g.scores).filter((id) => g.scores[id] === top);
        if (tied.length > 1) expect(g.tiebreakHistory.length).toBeGreaterThan(0);
        else expect(g.championId).toBe(tied[0]);
        expect(tied).toContain(g.championId);
      }
    });
  }
});

describe('embaralhamento justo', () => {
  it('cada jogador recebe, em média, as mesmas cartas (sem favorecimento por posição)', () => {
    const N = 4000;
    const n = 4;
    const ps = players(n);
    const sum = Array(n).fill(0);
    const jok = Array(n).fill(0);
    const count = Array(n).fill(0);
    const freq = new Map<string, number>();
    const rng = (m: number) => Math.floor(Math.random() * m);
    for (let k = 0; k < N; k++) {
      let g = createGame(ps, { randomInt: rng });
      g = bidAll(g);
      g = advance(g, rng);
      g = advance(g, rng); // partida 2: 2 cartas cada
      ps.forEach((p, i) => {
        for (const c of g.hands[p.id]) {
          sum[i] += c.value === 'JOKER' ? 11 : (c.value as number);
          if (c.value === 'JOKER') jok[i]++;
          count[i]++;
          if (i === 0) freq.set(c.id, (freq.get(c.id) ?? 0) + 1);
        }
      });
    }
    for (let i = 0; i < n; i++) {
      expect(sum[i] / count[i]).toBeGreaterThan(5.8); // esperado 6,0
      expect(sum[i] / count[i]).toBeLessThan(6.2);
      expect(jok[i] / count[i]).toBeGreaterThan(0.07); // esperado 9,1%
      expect(jok[i] / count[i]).toBeLessThan(0.115);
    }
    // Qui-quadrado: todas as 55 cartas aparecem com a mesma frequência para o jogador 0.
    expect(freq.size).toBe(55);
    const mean = [...freq.values()].reduce((a, b) => a + b, 0) / 55;
    const chi = [...freq.values()].reduce((a, v) => a + (v - mean) ** 2 / mean, 0);
    expect(chi).toBeLessThan(95); // 54 graus de liberdade, p≈0,0005
  });

  it('distribui uma carta por vez começando à esquerda de quem embaralhou', () => {
    // RNG controlado: Fisher-Yates sem trocas (j = i) e corte na posição 1
    const seq = (m: number) => m - 1;
    const g = createGame(players(4), { randomInt: seq, startDealerSeat: 0 });
    // partida às cegas: 1 carta para cada, na ordem p1, p2, p3, p0
    const order = g.participants;
    expect(order).toEqual(['p1', 'p2', 'p3', 'p0']);
    const dealt = order.map((id) => g.hands[id][0].id);
    expect(new Set(dealt).size).toBe(4);
  });
});
