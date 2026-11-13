import { allowedBids, currentBidderId, currentPlayerId, forbiddenBid } from './engine';
import type { Card, GameState, PlayerView, ViewCard } from './types';

/**
 * Cria a visualização específica de um jogador.
 * Nunca inclui informação que esse jogador não pode conhecer:
 * - Em partidas às cegas, a própria carta é enviada sem cor, valor ou id.
 * - Em partidas normais, as mãos dos adversários são enviadas apenas como contagem.
 */
export function getPlayerView(state: GameState, viewerId: string): PlayerView {
  const handCounts: Record<string, number> = {};
  for (const id of state.participants) handCounts[id] = state.hands[id]?.length ?? 0;

  let myHand: ViewCard[] = [];
  const visibleHands: Record<string, Card[]> = {};
  const ownHand = state.hands[viewerId] ?? [];

  if (state.blind) {
    myHand = ownHand.map((_, i) => ({ hidden: true as const, key: `hidden-${i}` }));
    for (const id of state.participants) {
      if (id !== viewerId && state.hands[id]?.length) visibleHands[id] = state.hands[id].map((c) => ({ ...c }));
    }
  } else {
    myHand = ownHand.map((c) => ({ ...c }));
  }

  const playedThisHand: Card[] = [];
  for (const r of state.rounds) for (const p of r.plays) playedThisHand.push(p.card);
  if (state.phase === 'PLAYING') for (const p of state.currentTrick) playedThisHand.push(p.card);

  const bidder = currentBidderId(state);

  return structuredClone({
    you: viewerId,
    players: state.players,
    maxHands: state.maxHands,
    stage: state.stage,
    phase: state.phase,
    handNumber: state.handNumber,
    tiebreakNumber: state.tiebreakNumber,
    cardsPerPlayer: state.cardsPerPlayer,
    blind: state.blind,
    jokersForcedMax: state.blind,
    dealerId: state.players[state.dealerSeat].id,
    participants: state.participants,
    bids: state.bids,
    currentBidderId: bidder,
    forbiddenBid: forbiddenBid(state),
    allowedBids: bidder === viewerId ? allowedBids(state) : null,
    roundNumber: state.roundNumber,
    turnOrder: state.turnOrder,
    currentPlayerId: currentPlayerId(state),
    currentTrick: state.currentTrick,
    tricksWon: state.tricksWon,
    scores: state.scores,
    myHand,
    handCounts,
    visibleHands,
    playedThisHand,
    lastRound: state.lastRound,
    handHistory: state.handHistory,
    tiebreakHistory: state.tiebreakHistory,
    lastHandResult: state.lastHandResult,
    championId: state.championId,
    ranking: state.ranking,
  });
}
