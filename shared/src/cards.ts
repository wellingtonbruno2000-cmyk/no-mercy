import type { Card, CardColor, JokerMode, Play, RandomInt } from './types';

/** Hierarquia oficial das cores, da mais forte para a mais fraca. */
export const COLORS: readonly CardColor[] = ['BLACK', 'BLUE', 'RED', 'GREEN', 'YELLOW'] as const;

export const COLOR_LABEL: Record<CardColor, string> = {
  BLACK: 'Preto',
  BLUE: 'Azul-escuro',
  RED: 'Vermelho',
  GREEN: 'Verde',
  YELLOW: 'Amarelo',
};

/** Versão do jogo (mostrada na tela inicial e em /health). */
export const APP_VERSION = '2.3.0';

export const DECK_SIZE = 55;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/** Força da cor: preto = 5 ... amarelo = 1. */
export function colorStrength(color: CardColor): number {
  return COLORS.length - COLORS.indexOf(color);
}

export function isJoker(card: Card): boolean {
  return card.value === 'JOKER';
}

/** Gera exatamente as 55 cartas únicas do baralho oficial. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    for (let v = 1; v <= 10; v++) deck.push({ id: `${color}-${v}`, color, value: v });
    deck.push({ id: `${color}-JOKER`, color, value: 'JOKER' });
  }
  return deck;
}

/** Aleatoriedade padrão (não criptográfica) — o servidor injeta uma fonte segura. */
export const defaultRandomInt: RandomInt = (max) => Math.floor(Math.random() * max);

/** Embaralhamento Fisher–Yates (retorna uma nova lista). */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt = defaultRandomInt): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/**
 * Embaralhada "riffle" como na mesa (modelo Gilbert–Shannon–Reeds): corta o baralho em dois montes
 * (tamanho segue uma binomial, como uma pessoa real) e intercala as cartas, caindo de cada monte
 * com probabilidade proporcional ao que resta nele.
 */
export function riffle<T>(items: readonly T[], randomInt: RandomInt = defaultRandomInt): T[] {
  let k = 0;
  for (let i = 0; i < items.length; i++) k += randomInt(2);
  const left = items.slice(0, k);
  const right = items.slice(k);
  const out: T[] = [];
  let l = 0;
  let r = 0;
  while (l < left.length || r < right.length) {
    const remL = left.length - l;
    const remR = right.length - r;
    if (randomInt(remL + remR) < remL) out.push(left[l++]);
    else out.push(right[r++]);
  }
  return out;
}

/** Corte: tira um monte de cima e coloca embaixo. */
export function cutDeck<T>(items: readonly T[], randomInt: RandomInt = defaultRandomInt): T[] {
  const cut = 1 + randomInt(items.length - 1);
  return [...items.slice(cut), ...items.slice(0, cut)];
}

/**
 * Embaralhamento completo "de mesa": mistura matemática (Fisher–Yates, já perfeitamente justa),
 * seguida de 7 embaralhadas riffle e um corte — como um crupiê faria.
 */
export function tableShuffle<T>(items: readonly T[], randomInt: RandomInt = defaultRandomInt): T[] {
  let deck = shuffle(items, randomInt);
  for (let i = 0; i < 7; i++) deck = riffle(deck, randomInt);
  return cutDeck(deck, randomInt);
}

/** Máximo de partidas do jogo para N jogadores. */
export function maxHandsFor(playerCount: number): number {
  return Math.floor(DECK_SIZE / playerCount);
}

/**
 * Nível numérico da carta jogada:
 * coringa maximizado = 11, cartas 10..1, coringa minimizado = 0.
 */
export function cardRank(card: Card, jokerMode: JokerMode | null): number {
  if (card.value === 'JOKER') return jokerMode === 'MIN' ? 0 : 11;
  return card.value;
}

/** Valor único de força (nível * 10 + cor). Maior vence. */
export function playPower(card: Card, jokerMode: JokerMode | null): number {
  return cardRank(card, jokerMode) * 10 + colorStrength(card.color);
}

/**
 * Compara duas cartas jogadas. Retorna > 0 se `a` vence `b`, < 0 se `b` vence `a`.
 * Número maior sempre vence; em igualdade de nível, vence a cor mais forte.
 */
export function compareCards(
  a: { card: Card; jokerMode: JokerMode | null },
  b: { card: Card; jokerMode: JokerMode | null },
): number {
  const r = cardRank(a.card, a.jokerMode) - cardRank(b.card, b.jokerMode);
  if (r !== 0) return r;
  return colorStrength(a.card.color) - colorStrength(b.card.color);
}

/** Identifica a jogada vencedora de uma rodada. */
export function trickWinner(plays: readonly Play[]): Play {
  if (plays.length === 0) throw new Error('Rodada sem cartas');
  let best = plays[0];
  for (let i = 1; i < plays.length; i++) if (compareCards(plays[i], best) > 0) best = plays[i];
  return best;
}

export function cardLabel(card: Card, jokerMode?: JokerMode | null): string {
  const base = card.value === 'JOKER' ? 'Coringa' : String(card.value);
  const mode = card.value === 'JOKER' && jokerMode ? (jokerMode === 'MAX' ? ' maximizado' : ' minimizado') : '';
  return `${base}${mode} ${COLOR_LABEL[card.color].toLowerCase()}`;
}
