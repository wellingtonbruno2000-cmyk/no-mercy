import { COLOR_LABEL, defaultRandomInt, shuffle } from './cards';
import type { Card, CardColor, PlayerInfo, RandomInt } from './types';

/**
 * Modo "Roleta Sem Piedade": jogo de blefe com roleta, usando as cartas do NO MERCY.
 *
 * - A cada rodada monta-se um baralho de 20 cartas: 6 de cada uma de 3 cores sorteadas
 *   (entre azul, vermelho, verde e amarelo), 1 coringa comum e a Carta do Diabo (id BLACK-JOKER).
 * - Sorteia-se a COR DA MESA entre essas 3 cores; cada jogador vivo recebe 5 cartas.
 * - Na sua vez você joga de 1 a 3 cartas viradas, dizendo que são da cor da mesa (pode blefar).
 *   Coringas valem como qualquer cor.
 * - O jogador seguinte pode acusar ("MENTIRA!") ou jogar as próprias cartas. Sem cartas, é obrigado a acusar.
 * - Revelação: se alguma carta não for da cor da mesa (nem coringa), quem jogou vai para a roleta;
 *   se tudo for verdade, quem acusou vai para a roleta.
 * - Carta do Diabo: se a jogada acusada tiver a Carta do Diabo, TODOS menos quem jogou giram a roleta.
 * - Roleta: tambor de 6 espaços com 1 bala em posição secreta; a cada puxada o tambor avança.
 *   Quem é atingido sai do jogo. O último vivo vence.
 */

export type BluffPhase = 'TURN' | 'REVEAL' | 'ROULETTE' | 'GAME_OVER';

export const BLUFF_TYPE_COLORS: readonly CardColor[] = ['BLUE', 'RED', 'GREEN', 'YELLOW'];
export const BLUFF_HAND = 5;
export const BLUFF_MIN = 2;
export const BLUFF_MAX = 6;

export interface BluffPlay {
  playerId: string;
  cards: Card[];
  count: number;
}

export interface ShotResult {
  playerId: string;
  /** Número da puxada (1..6) para esse jogador. */
  pull: number;
  hit: boolean;
}

export interface BluffState {
  kind: 'bluff';
  players: PlayerInfo[];
  special: boolean;
  phase: BluffPhase;
  round: number;
  tableColor: CardColor;
  roundColors: CardColor[];
  alive: Record<string, boolean>;
  hands: Record<string, Card[]>;
  /** Puxadas já feitas por jogador (o tambor avança a cada uma). */
  pulls: Record<string, number>;
  /** Posição secreta da bala (0..5) de cada jogador — nunca enviada aos navegadores. */
  bullet: Record<string, number>;
  turnId: string;
  lastPlay: BluffPlay | null;
  /** Quantas cartas cada jogador já disse ter jogado nesta rodada (informação pública). */
  claimed: Record<string, number>;
  /** Acusação em resolução. */
  call: {
    callerId: string;
    play: BluffPlay;
    truthful: boolean;
    special: boolean;
    shooters: string[];
  } | null;
  /** Fila de quem ainda vai puxar o gatilho nesta acusação. */
  shootQueue: string[];
  lastShot: ShotResult | null;
  winnerId: string | null;
  /** Ordem de eliminação (primeiro eliminado primeiro). */
  eliminated: string[];
  log: string[];
}

export class BluffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BluffError';
  }
}

const isJokerCard = (c: Card) => c.value === 'JOKER';
export const isSpecialCard = (c: Card) => c.value === 'JOKER' && c.color === 'BLACK';

function clone(s: BluffState): BluffState {
  return structuredClone(s);
}

function aliveIds(s: BluffState): string[] {
  return s.players.filter((p) => s.alive[p.id]).map((p) => p.id);
}

/** Próximo jogador vivo depois de `id`, na ordem da mesa. */
function nextAlive(s: BluffState, id: string): string {
  const n = s.players.length;
  const i = s.players.findIndex((p) => p.id === id);
  for (let k = 1; k <= n; k++) {
    const p = s.players[(i + k) % n];
    if (s.alive[p.id]) return p.id;
  }
  return id;
}

function dealRound(s: BluffState, starterId: string, randomInt: RandomInt) {
  const colors = shuffle(BLUFF_TYPE_COLORS, randomInt).slice(0, 3);
  const deck: Card[] = [];
  for (const color of colors) {
    // 6 cartas de cada cor, com valores sorteados entre 1 e 10 (sem repetir dentro da cor)
    const values = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], randomInt).slice(0, 6);
    for (const v of values) deck.push({ id: `${color}-${v}`, color, value: v });
  }
  // coringa comum: de uma cor que não está na rodada (ou de uma das cores, se as 4 forem usadas)
  const spare = BLUFF_TYPE_COLORS.find((c) => !colors.includes(c)) ?? colors[0];
  deck.push({ id: `${spare}-JOKER`, color: spare, value: 'JOKER' });
  if (s.special) deck.push({ id: 'BLACK-JOKER', color: 'BLACK', value: 'JOKER' });
  else {
    const spare2 = colors.find((c) => c !== spare) ?? colors[0];
    deck.push({ id: `${spare2}-JOKER`, color: spare2, value: 'JOKER' });
  }
  const shuffled = shuffle(deck, randomInt);
  s.roundColors = colors;
  s.tableColor = colors[randomInt(colors.length)];
  s.hands = {};
  const alive = aliveIds(s);
  // distribui uma carta por vez, começando por quem inicia a rodada
  const start = alive.indexOf(starterId);
  const order = [...alive.slice(start), ...alive.slice(0, start)];
  for (const id of order) s.hands[id] = [];
  let k = 0;
  for (let r = 0; r < BLUFF_HAND; r++) for (const id of order) if (k < shuffled.length) s.hands[id].push(shuffled[k++]);
  s.round += 1;
  s.turnId = starterId;
  s.lastPlay = null;
  s.claimed = {};
  s.call = null;
  s.shootQueue = [];
  s.phase = 'TURN';
}

export function createBluffGame(
  players: PlayerInfo[],
  opts: { special?: boolean; randomInt?: RandomInt; starterSeat?: number } = {},
): BluffState {
  if (players.length < BLUFF_MIN || players.length > BLUFF_MAX) {
    throw new BluffError(`O modo roleta aceita de ${BLUFF_MIN} a ${BLUFF_MAX} jogadores.`);
  }
  const rnd = opts.randomInt ?? defaultRandomInt;
  const s: BluffState = {
    kind: 'bluff',
    players: players.map((p) => ({ ...p })),
    special: opts.special ?? true,
    phase: 'TURN',
    round: 0,
    tableColor: 'RED',
    roundColors: [],
    alive: Object.fromEntries(players.map((p) => [p.id, true])),
    hands: {},
    pulls: Object.fromEntries(players.map((p) => [p.id, 0])),
    bullet: Object.fromEntries(players.map((p) => [p.id, rnd(6)])),
    turnId: players[0].id,
    lastPlay: null,
    claimed: {},
    call: null,
    shootQueue: [],
    lastShot: null,
    winnerId: null,
    eliminated: [],
    log: [],
  };
  const starter = players[opts.starterSeat ?? rnd(players.length)].id;
  dealRound(s, starter, rnd);
  return s;
}

/** Ações possíveis do jogador da vez. */
export function bluffOptions(s: BluffState, playerId: string) {
  if (s.phase !== 'TURN' || s.turnId !== playerId) return { canPlay: false, canCall: false, mustCall: false };
  const hasCards = (s.hands[playerId]?.length ?? 0) > 0;
  const canCall = !!s.lastPlay && s.lastPlay.playerId !== playerId;
  return { canPlay: hasCards, canCall, mustCall: canCall && !hasCards };
}

export function bluffPlay(prev: BluffState, playerId: string, cardIds: string[]): BluffState {
  const opt = bluffOptions(prev, playerId);
  if (!opt.canPlay) throw new BluffError(prev.turnId !== playerId ? 'Não é sua vez.' : 'Você não tem cartas para jogar.');
  if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 3) throw new BluffError('Jogue de 1 a 3 cartas.');
  if (new Set(cardIds).size !== cardIds.length) throw new BluffError('Cartas repetidas.');
  const hand = prev.hands[playerId];
  const cards = cardIds.map((id) => hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) throw new BluffError('Essa carta não está na sua mão.');
  const s = clone(prev);
  s.hands[playerId] = s.hands[playerId].filter((c) => !cardIds.includes(c.id));
  s.lastPlay = { playerId, cards: cards as Card[], count: cardIds.length };
  s.claimed[playerId] = (s.claimed[playerId] ?? 0) + cardIds.length;
  s.log.push(`${playerId} jogou ${cardIds.length}`);
  advanceTurn(s);
  return s;
}

/** Passa a vez para o próximo vivo; se ele não tiver cartas e houver jogada, ele é obrigado a acusar (ação dele). */
function advanceTurn(s: BluffState) {
  let next = nextAlive(s, s.turnId);
  // Pula quem não tem cartas e não pode acusar (não há jogada de outro para acusar)
  for (let guard = 0; guard < s.players.length; guard++) {
    const hasCards = (s.hands[next]?.length ?? 0) > 0;
    const canCall = !!s.lastPlay && s.lastPlay.playerId !== next;
    if (hasCards || canCall) break;
    next = nextAlive(s, next);
  }
  s.turnId = next;
}

export function bluffCall(prev: BluffState, playerId: string): BluffState {
  const opt = bluffOptions(prev, playerId);
  if (!opt.canCall) throw new BluffError('Não há jogada para acusar agora.');
  const s = clone(prev);
  const play = s.lastPlay!;
  const truthful = play.cards.every((c) => c.color === s.tableColor || isJokerCard(c));
  const special = s.special && play.cards.some(isSpecialCard);
  let shooters: string[];
  if (special) shooters = aliveIds(s).filter((id) => id !== play.playerId);
  else shooters = [truthful ? playerId : play.playerId];
  s.call = { callerId: playerId, play, truthful, special, shooters };
  s.shootQueue = shooters.slice();
  s.lastShot = null;
  s.phase = 'REVEAL';
  return s;
}

/** Avança a revelação / a roleta (controlado pelo servidor, com pausas para a animação). */
export function advanceBluff(prev: BluffState, randomInt: RandomInt = defaultRandomInt): BluffState {
  const s = clone(prev);
  if (s.phase === 'REVEAL') {
    s.phase = 'ROULETTE';
    s.lastShot = null;
    return s;
  }
  if (s.phase === 'ROULETTE') {
    const id = s.shootQueue.shift();
    if (id) {
      const pull = s.pulls[id] + 1;
      const hit = s.pulls[id] === s.bullet[id];
      s.pulls[id] = pull;
      s.lastShot = { playerId: id, pull, hit };
      if (hit) {
        s.alive[id] = false;
        s.eliminated.push(id);
      }
      const alive = aliveIds(s);
      if (alive.length <= 1) {
        s.winnerId = alive[0] ?? id;
        s.phase = 'GAME_OVER';
        s.shootQueue = [];
      }
      return s;
    }
    // Todos já puxaram: nova rodada. Começa quem foi para a roleta (se vivo), senão o próximo vivo.
    const call = s.call!;
    const firstShooter = call.shooters[0];
    const starter = s.alive[firstShooter] ? firstShooter : nextAlive(s, firstShooter);
    dealRound(s, starter, randomInt);
    return s;
  }
  throw new BluffError('Nada para avançar.');
}

export function bluffActorId(s: BluffState): string | null {
  return s.phase === 'TURN' ? s.turnId : null;
}

// ---------- Visão de cada jogador (sem segredos) ----------
export interface BluffView {
  kind: 'bluff';
  you: string;
  players: PlayerInfo[];
  special: boolean;
  phase: BluffPhase;
  round: number;
  tableColor: CardColor;
  roundColors: CardColor[];
  alive: Record<string, boolean>;
  pulls: Record<string, number>;
  handCounts: Record<string, number>;
  myHand: Card[];
  turnId: string;
  lastPlay: { playerId: string; count: number } | null;
  claimed: Record<string, number>;
  call: BluffState['call'] | null;
  shootQueue: string[];
  lastShot: ShotResult | null;
  winnerId: string | null;
  eliminated: string[];
  options: { canPlay: boolean; canCall: boolean; mustCall: boolean };
}

export function getBluffView(s: BluffState, viewer: string): BluffView {
  const handCounts: Record<string, number> = {};
  for (const p of s.players) handCounts[p.id] = s.hands[p.id]?.length ?? 0;
  return structuredClone({
    kind: 'bluff' as const,
    you: viewer,
    players: s.players,
    special: s.special,
    phase: s.phase,
    round: s.round,
    tableColor: s.tableColor,
    roundColors: s.roundColors,
    alive: s.alive,
    pulls: s.pulls,
    handCounts,
    myHand: s.hands[viewer] ?? [],
    turnId: s.turnId,
    // As cartas da última jogada só aparecem na revelação (dentro de `call`).
    lastPlay: s.lastPlay ? { playerId: s.lastPlay.playerId, count: s.lastPlay.count } : null,
    claimed: s.claimed ?? {},
    call: s.phase === 'TURN' ? null : s.call,
    shootQueue: s.shootQueue,
    lastShot: s.lastShot,
    winnerId: s.winnerId,
    eliminated: s.eliminated,
    options: bluffOptions(s, viewer),
  });
}

// ---------- Bot ----------
/** Decide a jogada de um bot usando apenas a própria visão. */
export type BotLevel = 'easy' | 'normal' | 'hard';

export function decideBluff(
  v: BluffView,
  randomInt: RandomInt = defaultRandomInt,
  level: BotLevel = 'hard',
): { call: true } | { call: false; cardIds: string[] } {
  const hand = v.myHand;
  const isOk = (c: Card) => c.color === v.tableColor || c.value === 'JOKER';
  if (v.options.mustCall) return { call: true };
  // Fácil: decisões quase aleatórias
  if (level === 'easy') {
    if (v.options.canCall && randomInt(100) < 35) return { call: true };
    if (!v.options.canPlay) return { call: true };
    const n = 1 + randomInt(Math.min(3, hand.length));
    return { call: false, cardIds: shuffle(hand, randomInt).slice(0, n).map((c) => c.id) };
  }
  if (v.options.canCall && v.lastPlay) {
    const mineOkCount = hand.filter(isOk).length;
    // Difícil = jogador humano esperto: percebe quando as contas não fecham (só existem 8 cartas válidas
    // por rodada: 6 da cor + 2 coringas), mas não é perfeito — às vezes deixa passar, às vezes acusa no impulso.
    if (level === 'hard') {
      const claimedByOthers = Object.entries(v.claimed ?? {})
        .filter(([id]) => id !== v.you)
        .reduce((a, [, n]) => a + n, 0);
      const total = claimedByOthers + mineOkCount;
      if (total > 8 && randomInt(100) < 80) return { call: true }; // "isso não fecha!" (nem sempre percebe)
      const pressure = Math.min(1, total / 8);
      const big = v.lastPlay.count >= 3 ? 18 : v.lastPlay.count === 2 ? 8 : 0; // 3 cartas de uma vez dá desconfiança
      if (randomInt(100) < Math.round(pressure * pressure * 45) + big + 6) return { call: true };
    }
    // Quantas cartas "válidas" existem no baralho da rodada: 6 da cor + 2 coringas = 8.
    const mineOk = hand.filter(isOk).length;
    const remainingOk = 8 - mineOk;
    const claimed = v.lastPlay.count;
    // Quanto mais cartas o outro diz ter e menos sobra para ele, mais desconfiança.
    let suspicion = claimed / Math.max(1, remainingOk) + (v.handCounts[v.lastPlay.playerId] === 0 ? 0.25 : 0);
    if (!v.options.canPlay) suspicion = 1;
    if (level === 'normal' && (suspicion > 0.75 || randomInt(100) < Math.round(suspicion * 45))) return { call: true };
  }
  if (!v.options.canPlay) return { call: true };
  const ok = hand.filter(isOk);
  const bad = hand.filter((c) => !isOk(c));
  // Joga a verdade quando pode (1 a 3 cartas); guarda o Coringa Preto para uma jogada "isca".
  if (ok.length) {
    const normal = ok.filter((c) => !(c.value === 'JOKER' && c.color === 'BLACK'));
    const pick = (normal.length ? normal : ok).slice(0, Math.min(3, 1 + randomInt(Math.min(3, (normal.length || ok.length)))));
    return { call: false, cardIds: pick.map((c) => c.id) };
  }
  // Sem cartas válidas: blefa com 1 (às vezes 2; o difícil blefa pouco para não dar na cara)
  const n = Math.min(bad.length, randomInt(100) < (level === 'hard' ? 18 : 25) ? 2 : 1);
  return { call: false, cardIds: bad.slice(0, n).map((c) => c.id) };
}

// ---------- Textos (legenda/voz) ----------
const COLOR_PLURAL: Record<CardColor, [string, string]> = {
  BLACK: ['preta', 'pretas'],
  BLUE: ['azul', 'azuis'],
  RED: ['vermelha', 'vermelhas'],
  GREEN: ['verde', 'verdes'],
  YELLOW: ['amarela', 'amarelas'],
};

/** "Uma carta vermelha", "Duas cartas vermelhas", "Três cartas vermelhas". */
export function claimText(count: number, color: CardColor): string {
  const [sing, plur] = COLOR_PLURAL[color];
  if (count === 1) return `Uma carta ${sing}`;
  return `${count === 2 ? 'Duas' : 'Três'} cartas ${plur}`;
}

export function tableColorName(color: CardColor): string {
  return COLOR_LABEL[color];
}
