/** Cores oficiais, da mais forte para a mais fraca. */
export type CardColor = 'BLACK' | 'BLUE' | 'RED' | 'GREEN' | 'YELLOW';

export type CardValue = number | 'JOKER';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

export type JokerMode = 'MAX' | 'MIN';

export interface Play {
  playerId: string;
  card: Card;
  /** Somente para coringas. Cartas numeradas usam null. */
  jokerMode: JokerMode | null;
}

export interface PlayerInfo {
  id: string;
  name: string;
  isBot: boolean;
}

export type Stage = 'MAIN' | 'TIEBREAK';

export type Phase = 'BIDDING' | 'PLAYING' | 'ROUND_RESULT' | 'HAND_RESULT' | 'GAME_OVER';

export interface RoundRecord {
  roundNumber: number;
  plays: Play[];
  winnerId: string;
}

export interface HandRecord {
  stage: Stage;
  /** Número da partida principal, ou número do desempate. */
  number: number;
  cardsPerPlayer: number;
  blind: boolean;
  dealerId: string;
  participants: string[];
  bids: Record<string, number>;
  tricks: Record<string, number>;
  points: Record<string, number>;
  /** Totais acumulados do jogo principal após esta partida (somente MAIN). */
  totals: Record<string, number> | null;
  rounds: RoundRecord[];
  /** Cartas que cada participante recebeu nesta partida (revelado só depois que ela termina). */
  dealt: Record<string, Card[]>;
}

export interface RankingEntry {
  playerId: string;
  position: number;
  score: number;
  champion: boolean;
}

export interface GameState {
  players: PlayerInfo[];
  maxHands: number;
  startDealerSeat: number;
  stage: Stage;
  phase: Phase;
  /** Partida principal atual (1..maxHands). */
  handNumber: number;
  /** Número do desempate atual (0 quando não há desempate). */
  tiebreakNumber: number;
  dealerSeat: number;
  /** Participantes da partida atual, na ordem dos palpites (começa à esquerda de quem embaralhou). */
  participants: string[];
  cardsPerPlayer: number;
  blind: boolean;
  hands: Record<string, Card[]>;
  bids: Record<string, number>;
  bidTurn: number;
  roundNumber: number;
  turnOrder: string[];
  turnIndex: number;
  currentTrick: Play[];
  tricksWon: Record<string, number>;
  rounds: RoundRecord[];
  /** Mão inicial de cada participante na partida atual (nunca enviada antes do fim da partida). */
  dealt?: Record<string, Card[]>;
  lastRound: RoundRecord | null;
  scores: Record<string, number>;
  handHistory: HandRecord[];
  tiebreakHistory: HandRecord[];
  lastHandResult: HandRecord | null;
  championId: string | null;
  ranking: RankingEntry[] | null;
}

/** Carta como o jogador a enxerga. Uma carta oculta não carrega cor, valor nem id. */
export type HiddenCard = { hidden: true; key: string };
export type ViewCard = Card | HiddenCard;

export function isHiddenCard(c: ViewCard): c is HiddenCard {
  return (c as HiddenCard).hidden === true;
}

export interface PlayerView {
  you: string;
  players: PlayerInfo[];
  maxHands: number;
  stage: Stage;
  phase: Phase;
  handNumber: number;
  tiebreakNumber: number;
  cardsPerPlayer: number;
  blind: boolean;
  jokersForcedMax: boolean;
  dealerId: string;
  participants: string[];
  bids: Record<string, number>;
  currentBidderId: string | null;
  /** Palpite proibido para o último jogador (informação pública), quando aplicável. */
  forbiddenBid: number | null;
  /** Palpites permitidos para você, se for sua vez de palpitar. */
  allowedBids: number[] | null;
  roundNumber: number;
  turnOrder: string[];
  currentPlayerId: string | null;
  currentTrick: Play[];
  tricksWon: Record<string, number>;
  scores: Record<string, number>;
  myHand: ViewCard[];
  handCounts: Record<string, number>;
  /** Cartas de outros jogadores visíveis para você (somente partidas às cegas). */
  visibleHands: Record<string, Card[]>;
  playedThisHand: Card[];
  lastRound: RoundRecord | null;
  handHistory: HandRecord[];
  tiebreakHistory: HandRecord[];
  lastHandResult: HandRecord | null;
  championId: string | null;
  ranking: RankingEntry[] | null;
}

export type RandomInt = (maxExclusive: number) => number;
