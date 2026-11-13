import { compareCards, createDeck, isJoker, playPower } from './cards';
import { isHiddenCard, type Card, type JokerMode, type Play, type PlayerView } from './types';

/**
 * IA dos bots. Decide usando somente a visualização do próprio bot (sem trapaça):
 * mão própria, cartas já jogadas, palpites e cartas visíveis nas partidas às cegas.
 */

/** Fator calibrado por simulação: adversários nem sempre gastam suas cartas fortes contra a sua. */
const BID_H = 0.32;

export interface BotPlay {
  cardId: string;
  jokerMode: JokerMode | null;
}

interface Candidate {
  card: Card;
  jokerMode: JokerMode | null;
  power: number;
  winProb: number;
}

function unknownPool(view: PlayerView): Card[] {
  const known = new Set<string>();
  for (const c of view.myHand) if (!isHiddenCard(c)) known.add(c.id);
  for (const c of view.playedThisHand) known.add(c.id);
  for (const p of view.currentTrick) known.add(p.card.id);
  for (const hand of Object.values(view.visibleHands)) for (const c of hand) known.add(c.id);
  return createDeck().filter((c) => !known.has(c.id));
}

/** Peso de ameaça de uma carta desconhecida em relação a uma jogada. */
function threatWeight(unknown: Card, mine: { card: Card; jokerMode: JokerMode | null }): number {
  if (isJoker(unknown)) {
    // Um coringa adversário pode ser maximizado quando o dono quer vencer.
    return compareCards({ card: unknown, jokerMode: 'MAX' }, mine) > 0 ? 0.75 : 0;
  }
  return compareCards({ card: unknown, jokerMode: null }, mine) > 0 ? 1 : 0;
}

/** Probabilidade aproximada de um adversário com `h` cartas ter alguma carta mais forte. */
function pOpponentBeats(stronger: number, poolSize: number, h: number): number {
  if (poolSize <= 0 || stronger <= 0 || h <= 0) return 0;
  const frac = Math.min(1, stronger / poolSize);
  return 1 - Math.pow(1 - frac, h);
}

function bestOf(trick: readonly Play[]): Play | null {
  let best: Play | null = null;
  for (const p of trick) if (!best || compareCards(p, best) > 0) best = p;
  return best;
}

function estimateWin(
  view: PlayerView,
  pool: Card[],
  play: { card: Card; jokerMode: JokerMode | null },
  opponentsAfter: string[],
  wantFactor = 0.85,
): number {
  const best = bestOf(view.currentTrick);
  if (best && compareCards(play, best) < 0) return 0;
  let stronger = 0;
  for (const u of pool) stronger += threatWeight(u, play);
  let p = 1;
  for (const opp of opponentsAfter) {
    const h = view.handCounts[opp] ?? view.cardsPerPlayer;
    p *= 1 - wantFactor * pOpponentBeats(stronger, pool.length, h);
  }
  return p;
}

function myCards(view: PlayerView): Card[] {
  return view.myHand.filter((c): c is Card => !isHiddenCard(c));
}

function chooseAmongAllowed(target: number, allowed: number[]): number {
  let best = allowed[0];
  let bestDist = Infinity;
  for (const b of allowed) {
    const d = Math.abs(b - target);
    if (d < bestDist - 1e-9) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

export function decideBid(view: PlayerView): number {
  const allowed = view.allowedBids ?? [];
  if (allowed.length === 0) throw new Error('Bot sem palpites permitidos');

  if (view.blind) {
    // Vê as cartas dos adversários: qual a chance da própria carta (desconhecida) vencer todas?
    const visible = Object.values(view.visibleHands).flat();
    const pool = unknownPool(view);
    const toBeat = visible.map((c) => ({ card: c, jokerMode: isJoker(c) ? ('MAX' as const) : null }));
    let wins = 0;
    for (const c of pool) {
      const mine = { card: c, jokerMode: isJoker(c) ? ('MAX' as const) : null };
      if (toBeat.every((o) => compareCards(mine, o) > 0)) wins++;
    }
    const p = pool.length ? wins / pool.length : 0;
    return chooseAmongAllowed(p >= 0.5 ? 1 : 0, allowed);
  }

  const cards = myCards(view);
  const pool = unknownPool(view);
  const opponents = view.participants.filter((id) => id !== view.you);
  let expected = 0;
  for (const c of cards) {
    const mode: JokerMode | null = isJoker(c) ? 'MAX' : null;
    let stronger = 0;
    for (const u of pool) stronger += threatWeight(u, { card: c, jokerMode: mode });
    let p = 1;
    const hEff = Math.max(1, view.cardsPerPlayer * BID_H);
    for (let i = 0; i < opponents.length; i++) p *= 1 - 0.8 * pOpponentBeats(stronger, pool.length, hEff);
    expected += p;
  }
  const target = expected;
  return chooseAmongAllowed(Math.round(target), allowed.slice().sort((a, b) => Math.abs(a - target) - Math.abs(b - target)));
}

export type ClassicBotLevel = 'easy' | 'normal' | 'hard';

/** Palpite com dificuldade: difícil = IA completa; normal/fácil erram de propósito às vezes. */
export function botBid(view: PlayerView, level: ClassicBotLevel = 'hard', randomInt: (m: number) => number = (m) => Math.floor(Math.random() * m)): number {
  const allowed = view.allowedBids ?? [];
  const noise = level === 'easy' ? 50 : level === 'normal' ? 20 : 0;
  if (allowed.length && randomInt(100) < noise) return allowed[randomInt(allowed.length)];
  return decideBid(view);
}

/** Jogada com dificuldade. */
export function botPlay(view: PlayerView, level: ClassicBotLevel = 'hard', randomInt: (m: number) => number = (m) => Math.floor(Math.random() * m)): BotPlay {
  const noise = level === 'easy' ? 45 : level === 'normal' ? 15 : 0;
  const cards = view.myHand.filter((c): c is Card => !isHiddenCard(c));
  if (cards.length && randomInt(100) < noise) {
    const c = cards[randomInt(cards.length)];
    return { cardId: c.id, jokerMode: isJoker(c) ? (view.blind ? 'MAX' : randomInt(2) ? 'MAX' : 'MIN') : null };
  }
  return decidePlay(view);
}

export function decidePlay(view: PlayerView): BotPlay {
  const cards = myCards(view);
  if (cards.length === 0) throw new Error('Bot sem cartas');
  const pool = unknownPool(view);
  const myIdx = view.turnOrder.indexOf(view.you);
  const after = view.turnOrder.slice(myIdx + 1);

  const candidates: Candidate[] = [];
  for (const card of cards) {
    const modes: (JokerMode | null)[] = isJoker(card) ? (view.blind ? ['MAX'] : ['MAX', 'MIN']) : [null];
    for (const jokerMode of modes) {
      candidates.push({
        card,
        jokerMode,
        power: playPower(card, jokerMode),
        winProb: estimateWin(view, pool, { card, jokerMode }, after),
      });
    }
  }

  const bid = view.bids[view.you] ?? 0;
  const won = view.tricksWon[view.you] ?? 0;
  const need = bid - won;
  const remaining = view.cardsPerPlayer - view.roundNumber + 1;

  // Força "isolada" de cada carta (como se liderasse a rodada) para planejar.
  const others = view.participants.filter((id) => id !== view.you);
  const standalone = (card: Card) => {
    const mode: JokerMode | null = isJoker(card) ? 'MAX' : null;
    let stronger = 0;
    for (const u of pool) stronger += threatWeight(u, { card, jokerMode: mode });
    let p = 1;
    for (const opp of others) p *= 1 - 0.8 * pOpponentBeats(stronger, pool.length, view.handCounts[opp] ?? 1);
    return p;
  };
  const strongCards = cards.filter((c) => standalone(c) >= 0.6);

  const pickWin = (): Candidate => {
    const good = candidates.filter((c) => c.winProb >= 0.55).sort((a, b) => a.power - b.power);
    if (good.length) return good[0];
    const best = candidates.slice().sort((a, b) => b.winProb - a.winProb || a.power - b.power)[0];
    if (best.winProb >= 0.15) return best;
    return pickLose();
  };

  const pickLose = (pool: Candidate[] = candidates): Candidate => {
    const minP = Math.min(...pool.map((c) => c.winProb));
    const safest = pool.filter((c) => c.winProb <= minP + 0.05);
    // Entre as jogadas mais seguras, descarta a carta mais alta (guardando coringas quando possível).
    return safest.sort((a, b) => {
      const ja = isJoker(a.card) ? 1 : 0;
      const jb = isJoker(b.card) ? 1 : 0;
      if (ja !== jb) return ja - jb;
      return b.power - a.power;
    })[0];
  };

  let choice: Candidate;
  if (need <= 0) choice = pickLose();
  else if (need >= remaining) choice = pickWin();
  else if (strongCards.length >= need) {
    const weakIds = new Set(cards.filter((c) => !strongCards.includes(c)).map((c) => c.id));
    const weak = candidates.filter((c) => weakIds.has(c.card.id));
    if (weak.length === 0) choice = pickWin();
    else {
      // Oportunidade barata de vencer agora? Senão, perde com carta fraca.
      const cheapWin = weak.filter((c) => c.winProb >= 0.85).sort((a, b) => a.power - b.power)[0];
      choice = cheapWin && strongCards.length <= need ? cheapWin : pickLose(weak);
    }
  } else {
    const opp = candidates.filter((c) => c.winProb >= 0.5).sort((a, b) => a.power - b.power)[0];
    choice = opp ?? pickWin();
  }
  return { cardId: choice.card.id, jokerMode: choice.jokerMode };
}
