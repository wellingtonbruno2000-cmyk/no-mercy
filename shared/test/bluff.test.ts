import { describe, expect, it } from 'vitest';
import {
  advanceBluff,
  bluffCall,
  bluffPlay,
  claimText,
  createBluffGame,
  decideBluff,
  getBluffView,
  type BluffState,
  type PlayerInfo,
} from '../src';

const players = (n: number): PlayerInfo[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
function seeded(seed: number) {
  let a = seed >>> 0;
  return (max: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
  };
}

describe('Roleta Sem Piedade', () => {
  it('baralho da rodada: 20 cartas (6+6+6, 1 coringa, 1 Coringa Preto) e 5 por jogador', () => {
    const g = createBluffGame(players(4), { randomInt: seeded(1), starterSeat: 0 });
    const all = Object.values(g.hands).flat();
    expect(all).toHaveLength(20);
    expect(new Set(all.map((c) => c.id)).size).toBe(20);
    for (const color of g.roundColors) expect(all.filter((c) => c.color === color && c.value !== 'JOKER')).toHaveLength(6);
    expect(all.filter((c) => c.value === 'JOKER')).toHaveLength(2);
    expect(all.some((c) => c.id === 'BLACK-JOKER')).toBe(true);
    expect(g.roundColors).toContain(g.tableColor);
    for (const id of ['p0', 'p1', 'p2', 'p3']) expect(g.hands[id]).toHaveLength(5);
  });

  it('a visão não revela cartas dos outros nem a posição da bala', () => {
    const g = createBluffGame(players(3), { randomInt: seeded(2), starterSeat: 0 });
    const v = getBluffView(g, 'p1') as unknown as Record<string, unknown>;
    const json = JSON.stringify(v);
    expect(json).not.toContain('bullet');
    for (const c of g.hands.p0) expect(json).not.toContain(`"${c.id}"`);
    const g2 = bluffPlay(g, 'p0', [g.hands.p0[0].id]);
    const v2 = getBluffView(g2, 'p1');
    expect(v2.lastPlay).toEqual({ playerId: 'p0', count: 1 });
    expect(JSON.stringify(v2)).not.toContain(`"${g.hands.p0[0].id}"`);
  });

  it('acusação: mentiroso vai para a roleta; se era verdade, quem acusou vai', () => {
    let g = createBluffGame(players(3), { randomInt: seeded(3), starterSeat: 0, special: false });
    g.tableColor = 'RED';
    g.hands.p0 = [{ id: 'GREEN-3', color: 'GREEN', value: 3 }, { id: 'RED-5', color: 'RED', value: 5 }];
    let lie = bluffPlay(g, 'p0', ['GREEN-3']);
    lie = bluffCall(lie, 'p1');
    expect(lie.call!.truthful).toBe(false);
    expect(lie.call!.shooters).toEqual(['p0']);
    let truth = bluffPlay(g, 'p0', ['RED-5']);
    truth = bluffCall(truth, 'p1');
    expect(truth.call!.truthful).toBe(true);
    expect(truth.call!.shooters).toEqual(['p1']);
    expect(() => bluffCall(g, 'p0')).toThrow(); // não há jogada para acusar
  });

  it('Coringa Preto acusado: todos menos quem jogou giram a roleta', () => {
    let g = createBluffGame(players(4), { randomInt: seeded(4), starterSeat: 0, special: true });
    g.hands.p0 = [{ id: 'BLACK-JOKER', color: 'BLACK', value: 'JOKER' }];
    g = bluffPlay(g, 'p0', ['BLACK-JOKER']);
    g = bluffCall(g, 'p1');
    expect(g.call!.special).toBe(true);
    expect(g.call!.shooters.sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('roleta: tambor avança, bala elimina, nova rodada começa', () => {
    let g = createBluffGame(players(3), { randomInt: seeded(5), starterSeat: 0, special: false });
    g.bullet.p0 = 2;
    g.tableColor = 'RED';
    g.hands.p0 = [{ id: 'GREEN-1', color: 'GREEN', value: 1 }, ...g.hands.p0.slice(1)];
    const shootP0 = (s: BluffState) => {
      s = bluffPlay(s, 'p0', ['GREEN-1']);
      s = bluffCall(s, s.turnId);
      s = advanceBluff(s); // REVEAL -> ROULETTE
      s = advanceBluff(s); // dispara
      return s;
    };
    let s = shootP0(g);
    expect(s.lastShot).toEqual({ playerId: 'p0', pull: 1, hit: false });
    s = advanceBluff(s, seeded(9)); // nova rodada
    expect(s.phase).toBe('TURN');
    expect(s.round).toBe(2);
    expect(s.turnId).toBe('p0');
    s.tableColor = 'RED';
    s.hands.p0 = [{ id: 'GREEN-1', color: 'GREEN', value: 1 }];
    s = shootP0(s);
    expect(s.lastShot!.hit).toBe(false);
    s = advanceBluff(s, seeded(10));
    s.tableColor = 'RED';
    s.hands.p0 = [{ id: 'GREEN-1', color: 'GREEN', value: 1 }];
    s = shootP0(s);
    expect(s.lastShot).toEqual({ playerId: 'p0', pull: 3, hit: true });
    expect(s.alive.p0).toBe(false);
  });

  it('sem cartas, o jogador é obrigado a acusar', () => {
    let g = createBluffGame(players(2), { randomInt: seeded(6), starterSeat: 0 });
    g.hands.p1 = [];
    g = bluffPlay(g, 'p0', [g.hands.p0[0].id]);
    const v = getBluffView(g, 'p1');
    expect(v.options).toEqual({ canPlay: false, canCall: true, mustCall: true });
    expect(decideBluff(v)).toEqual({ call: true });
  });

  it('legendas', () => {
    expect(claimText(1, 'RED')).toBe('Uma carta vermelha');
    expect(claimText(2, 'RED')).toBe('Duas cartas vermelhas');
    expect(claimText(3, 'BLUE')).toBe('Três cartas azuis');
  });

  for (const n of [2, 3, 4, 6]) {
    it(`jogo completo com bots (${n} jogadores) termina com um vencedor`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const rng = seeded(seed * 31 + n);
        let g = createBluffGame(players(n), { randomInt: rng, special: seed % 2 === 0 });
        let guard = 0;
        while (g.phase !== 'GAME_OVER' && guard++ < 5000) {
          if (g.phase === 'TURN') {
            const d = decideBluff(getBluffView(g, g.turnId), rng);
            g = d.call ? bluffCall(g, g.turnId) : bluffPlay(g, g.turnId, d.cardIds);
          } else g = advanceBluff(g, rng);
        }
        expect(g.phase).toBe('GAME_OVER');
        expect(Object.values(g.alive).filter(Boolean)).toHaveLength(1);
        expect(g.alive[g.winnerId!]).toBe(true);
        expect(g.eliminated).toHaveLength(n - 1);
      }
    });
  }
});
