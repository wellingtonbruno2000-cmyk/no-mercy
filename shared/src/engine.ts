import {
  createDeck,
  defaultRandomInt,
  isJoker,
  maxHandsFor,
  MAX_PLAYERS,
  MIN_PLAYERS,
  shuffle,
  tableShuffle,
  trickWinner,
} from './cards';
import type {
  GameState,
  HandRecord,
  JokerMode,
  Play,
  PlayerInfo,
  RandomInt,
  RankingEntry,
  RoundRecord,
} from './types';

export class GameError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'GameError';
  }
}

export interface CreateGameOptions {
  randomInt?: RandomInt;
  /** Assento de quem embaralha a primeira partida. Padrão: sorteado. */
  startDealerSeat?: number;
}

function zeroMap(ids: readonly string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const id of ids) m[id] = 0;
  return m;
}

/** Participantes na ordem da mesa, começando pelo primeiro após o assento de quem embaralhou. */
function orderFromDealer(state: GameState, dealerSeat: number, ids: readonly string[]): string[] {
  const set = new Set(ids);
  const n = state.players.length;
  const out: string[] = [];
  for (let k = 1; k <= n; k++) {
    const p = state.players[(dealerSeat + k) % n];
    if (set.has(p.id)) out.push(p.id);
  }
  return out;
}

function rotate<T>(arr: readonly T[], by: number): T[] {
  const n = arr.length;
  const k = ((by % n) + n) % n;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

export function createGame(players: PlayerInfo[], opts: CreateGameOptions = {}): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new GameError('PLAYER_COUNT', `O jogo aceita de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores.`);
  }
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new GameError('DUPLICATE_PLAYER', 'Jogadores duplicados.');
  const randomInt = opts.randomInt ?? defaultRandomInt;
  const startDealerSeat = opts.startDealerSeat ?? randomInt(players.length);
  const state: GameState = {
    players: players.map((p) => ({ ...p })),
    maxHands: maxHandsFor(players.length),
    startDealerSeat,
    stage: 'MAIN',
    phase: 'BIDDING',
    handNumber: 0,
    tiebreakNumber: 0,
    dealerSeat: startDealerSeat,
    participants: [],
    cardsPerPlayer: 0,
    blind: false,
    hands: {},
    bids: {},
    bidTurn: 0,
    roundNumber: 0,
    turnOrder: [],
    turnIndex: 0,
    currentTrick: [],
    tricksWon: {},
    rounds: [],
    lastRound: null,
    scores: zeroMap(players.map((p) => p.id)),
    handHistory: [],
    tiebreakHistory: [],
    lastHandResult: null,
    championId: null,
    ranking: null,
  };
  startMainHand(state, 1, randomInt);
  return state;
}

/**
 * Distribuição como numa mesa real: embaralha (Fisher–Yates com aleatoriedade do servidor),
 * corta o baralho num ponto aleatório e dá uma carta por vez a cada jogador,
 * começando pelo jogador à esquerda de quem embaralhou.
 */
function deal(state: GameState, participants: string[], cards: number, randomInt: RandomInt) {
  // Baralho novo a cada partida: embaralhado, 7 riffles e corte (ver tableShuffle).
  const deck = tableShuffle(createDeck(), randomInt);
  if (cards * participants.length > deck.length) {
    throw new GameError('DECK_TOO_SMALL', 'Cartas insuficientes para a distribuição.');
  }
  state.hands = {};
  for (const id of participants) state.hands[id] = [];
  let next = 0;
  for (let round = 0; round < cards; round++) {
    for (const id of participants) state.hands[id].push(deck[next++]);
  }
  // Guardado para a transparência: revelado a todos só quando a partida termina.
  state.dealt = {};
  for (const id of participants) state.dealt[id] = state.hands[id].map((c) => ({ ...c }));
}

function resetHand(state: GameState, participants: string[], cards: number, blind: boolean, randomInt: RandomInt) {
  state.participants = participants;
  state.cardsPerPlayer = cards;
  state.blind = blind;
  state.bids = {};
  state.bidTurn = 0;
  state.roundNumber = 0;
  state.turnOrder = [];
  state.turnIndex = 0;
  state.currentTrick = [];
  state.tricksWon = zeroMap(participants);
  state.rounds = [];
  state.lastRound = null;
  state.phase = 'BIDDING';
  deal(state, participants, cards, randomInt);
}

function startMainHand(state: GameState, handNumber: number, randomInt: RandomInt) {
  const n = state.players.length;
  state.stage = 'MAIN';
  state.handNumber = handNumber;
  state.dealerSeat = (state.startDealerSeat + handNumber - 1) % n;
  const participants = orderFromDealer(
    state,
    state.dealerSeat,
    state.players.map((p) => p.id),
  );
  resetHand(state, participants, handNumber, handNumber === 1, randomInt);
}

function startTiebreak(state: GameState, tiedIds: string[], randomInt: RandomInt) {
  const n = state.players.length;
  state.stage = 'TIEBREAK';
  state.tiebreakNumber += 1;
  // O responsável por embaralhar continua avançando pela mesa.
  state.dealerSeat = (state.startDealerSeat + state.maxHands + state.tiebreakNumber - 1) % n;
  const participants = orderFromDealer(state, state.dealerSeat, tiedIds);
  resetHand(state, participants, 1, true, randomInt);
}

export function currentBidderId(state: GameState): string | null {
  if (state.phase !== 'BIDDING') return null;
  return state.participants[state.bidTurn] ?? null;
}

export function currentPlayerId(state: GameState): string | null {
  if (state.phase !== 'PLAYING') return null;
  return state.turnOrder[state.turnIndex] ?? null;
}

/** O jogador que precisa agir agora (palpite ou jogada), se houver. */
export function currentActorId(state: GameState): string | null {
  return currentBidderId(state) ?? currentPlayerId(state);
}

/** Valor proibido para o último palpite, se a restrição se aplica à vez atual. */
export function forbiddenBid(state: GameState): number | null {
  if (state.phase !== 'BIDDING') return null;
  // Primeira partida (às cegas): sem restrição para o último — todos podem palpitar livremente.
  if (state.stage === 'MAIN' && state.handNumber === 1) return null;
  if (state.bidTurn !== state.participants.length - 1) return null;
  let sum = 0;
  for (const id of state.participants) if (state.bids[id] !== undefined) sum += state.bids[id];
  const f = state.cardsPerPlayer - sum;
  return f >= 0 && f <= state.cardsPerPlayer ? f : null;
}

export function allowedBids(state: GameState): number[] {
  if (state.phase !== 'BIDDING') return [];
  const f = forbiddenBid(state);
  const out: number[] = [];
  for (let b = 0; b <= state.cardsPerPlayer; b++) if (b !== f) out.push(b);
  return out;
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

export function placeBid(prev: GameState, playerId: string, value: number): GameState {
  if (prev.phase !== 'BIDDING') throw new GameError('NOT_BIDDING', 'Não é momento de palpites.');
  if (currentBidderId(prev) !== playerId) throw new GameError('NOT_YOUR_TURN', 'Não é sua vez de palpitar.');
  if (!Number.isInteger(value)) throw new GameError('INVALID_BID', 'Palpite inválido.');
  if (value < 0 || value > prev.cardsPerPlayer) {
    throw new GameError('INVALID_BID', `O palpite deve estar entre 0 e ${prev.cardsPerPlayer}.`);
  }
  if (forbiddenBid(prev) === value) {
    throw new GameError(
      'FORBIDDEN_BID',
      `A soma dos palpites não pode ser igual a ${prev.cardsPerPlayer}. Escolha outro valor.`,
    );
  }
  const state = clone(prev);
  state.bids[playerId] = value;
  state.bidTurn += 1;
  if (state.bidTurn < state.participants.length) return state;

  if (state.blind) {
    // Revelação simultânea: todos os coringas maximizados.
    state.roundNumber = 1;
    state.turnOrder = state.participants.slice();
    state.currentTrick = state.participants.map((id) => {
      const card = state.hands[id][0];
      return { playerId: id, card, jokerMode: isJoker(card) ? 'MAX' : null } as Play;
    });
    for (const id of state.participants) state.hands[id] = [];
    resolveRound(state);
  } else {
    state.phase = 'PLAYING';
    beginRound(state, 1);
  }
  return state;
}

/**
 * Inicia uma rodada. A primeira rodada da partida começa com o jogador à esquerda de quem embaralhou;
 * as seguintes começam com quem venceu a rodada anterior, seguindo a ordem da mesa a partir dele.
 */
function beginRound(state: GameState, roundNumber: number) {
  state.roundNumber = roundNumber;
  const starter = roundNumber === 1 || !state.lastRound ? state.participants[0] : state.lastRound.winnerId;
  state.turnOrder = rotate(state.participants, state.participants.indexOf(starter));
  state.turnIndex = 0;
  state.currentTrick = [];
  state.phase = 'PLAYING';
}

export function playCard(
  prev: GameState,
  playerId: string,
  cardId: string,
  jokerMode: JokerMode | null = null,
): GameState {
  if (prev.phase !== 'PLAYING') throw new GameError('NOT_PLAYING', 'Não é momento de jogar cartas.');
  if (currentPlayerId(prev) !== playerId) throw new GameError('NOT_YOUR_TURN', 'Não é sua vez de jogar.');
  const hand = prev.hands[playerId] ?? [];
  const card = hand.find((c) => c.id === cardId);
  if (!card) throw new GameError('CARD_NOT_IN_HAND', 'Essa carta não está na sua mão.');
  let mode: JokerMode | null = null;
  if (isJoker(card)) {
    if (prev.blind) mode = 'MAX';
    else if (jokerMode === 'MAX' || jokerMode === 'MIN') mode = jokerMode;
    else throw new GameError('JOKER_MODE_REQUIRED', 'Escolha maximizar ou minimizar o coringa.');
  } else if (jokerMode !== null && jokerMode !== undefined) {
    throw new GameError('INVALID_JOKER_MODE', 'Somente coringas podem ser maximizados ou minimizados.');
  }
  const state = clone(prev);
  state.hands[playerId] = state.hands[playerId].filter((c) => c.id !== cardId);
  state.currentTrick.push({ playerId, card, jokerMode: mode });
  state.turnIndex += 1;
  if (state.turnIndex >= state.turnOrder.length) resolveRound(state);
  return state;
}

function resolveRound(state: GameState) {
  const winner = trickWinner(state.currentTrick);
  state.tricksWon[winner.playerId] = (state.tricksWon[winner.playerId] ?? 0) + 1;
  const record: RoundRecord = {
    roundNumber: state.roundNumber,
    plays: state.currentTrick.slice(),
    winnerId: winner.playerId,
  };
  state.rounds.push(record);
  state.lastRound = record;
  state.phase = 'ROUND_RESULT';
}

/** Pontuação: acertou o palpite = 10 + palpite; errou = 0. */
export function scoreFor(bid: number, tricks: number): number {
  return bid === tricks ? 10 + bid : 0;
}

function finishHand(state: GameState) {
  const points: Record<string, number> = {};
  for (const id of state.participants) points[id] = scoreFor(state.bids[id], state.tricksWon[id] ?? 0);
  let totals: Record<string, number> | null = null;
  if (state.stage === 'MAIN') {
    for (const id of state.participants) state.scores[id] += points[id];
    totals = { ...state.scores };
  }
  const record: HandRecord = {
    stage: state.stage,
    number: state.stage === 'MAIN' ? state.handNumber : state.tiebreakNumber,
    cardsPerPlayer: state.cardsPerPlayer,
    blind: state.blind,
    dealerId: state.players[state.dealerSeat].id,
    participants: state.participants.slice(),
    bids: { ...state.bids },
    tricks: { ...state.tricksWon },
    points,
    totals,
    rounds: state.rounds.slice(),
    dealt: structuredClone(state.dealt ?? {}),
  };
  if (state.stage === 'MAIN') state.handHistory.push(record);
  else state.tiebreakHistory.push(record);
  state.lastHandResult = record;
  state.currentTrick = [];
  state.phase = 'HAND_RESULT';
}

function topTied(ids: readonly string[], score: (id: string) => number): string[] {
  let best = -Infinity;
  for (const id of ids) best = Math.max(best, score(id));
  return ids.filter((id) => score(id) === best);
}

function finishGame(state: GameState, championId: string) {
  state.championId = championId;
  state.phase = 'GAME_OVER';
  const sorted = state.players
    .map((p, seat) => ({ id: p.id, seat, score: state.scores[p.id] }))
    .sort((a, b) => {
      if (a.id === championId) return -1;
      if (b.id === championId) return 1;
      return b.score - a.score || a.seat - b.seat;
    });
  const ranking: RankingEntry[] = [];
  sorted.forEach((e, i) => {
    let position = i + 1;
    if (i > 0 && e.id !== championId) {
      const prev = ranking[i - 1];
      if (prev.playerId !== championId && prev.score === e.score) position = prev.position;
    }
    ranking.push({ playerId: e.id, position, score: e.score, champion: e.id === championId });
  });
  state.ranking = ranking;
}

/** Avança após a exibição do resultado da rodada ou da partida. Controlado pelo servidor. */
export function advance(prev: GameState, randomInt: RandomInt = defaultRandomInt): GameState {
  if (prev.phase === 'ROUND_RESULT') {
    const state = clone(prev);
    if (state.roundNumber < state.cardsPerPlayer) beginRound(state, state.roundNumber + 1);
    else finishHand(state);
    return state;
  }
  if (prev.phase === 'HAND_RESULT') {
    const state = clone(prev);
    if (state.stage === 'MAIN') {
      if (state.handNumber < state.maxHands) {
        startMainHand(state, state.handNumber + 1, randomInt);
        return state;
      }
      const ids = state.players.map((p) => p.id);
      const tied = topTied(ids, (id) => state.scores[id]);
      if (tied.length === 1) finishGame(state, tied[0]);
      else startTiebreak(state, tied, randomInt);
      return state;
    }
    const pts = state.lastHandResult!.points;
    const tied = topTied(state.participants, (id) => pts[id]);
    if (tied.length === 1) finishGame(state, tied[0]);
    else startTiebreak(state, tied, randomInt);
    return state;
  }
  throw new GameError('CANNOT_ADVANCE', 'Nada para avançar agora.');
}
