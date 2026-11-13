import { useEffect, useRef } from 'react';
import type { RoomView } from '@nomercy/shared';
import { sfx } from './audio';

/** Dispara efeitos sonoros comparando o estado anterior e o atual do jogo. */
export function useGameSounds(room: RoomView | null) {
  const prev = useRef<RoomView | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = room;
    if (!room || !before || before.code !== room.code) return;

    if (room.players.length > before.players.length && room.status === 'LOBBY') sfx('join');

    const g = room.game;
    const p = before.game;
    if (!g) return;
    if (!p) {
      sfx('shuffle');
      setTimeout(() => sfx('deal'), 1150);
      return;
    }
    const me = room.you;

    // Nova distribuição
    if (g.phase === 'BIDDING' && (p.handNumber !== g.handNumber || p.tiebreakNumber !== g.tiebreakNumber)) {
      if (g.stage === 'TIEBREAK' && p.tiebreakNumber !== g.tiebreakNumber) sfx('tiebreak');
      else {
        sfx('shuffle');
        setTimeout(() => sfx('deal'), 1150);
      }
    }
    // Palpite registrado
    if (Object.keys(g.bids).length > Object.keys(p.bids).length && g.handNumber === p.handNumber) sfx('bid');
    // Carta jogada
    if (g.phase === 'PLAYING' && g.currentTrick.length > p.currentTrick.length) sfx('card');
    // Fim da rodada
    if (g.phase === 'ROUND_RESULT' && p.phase !== 'ROUND_RESULT') {
      if (g.blind) sfx('card');
      setTimeout(() => sfx(g.lastRound?.winnerId === me ? 'roundWin' : 'roundOther'), g.blind ? 350 : 150);
    }
    // Fim da partida
    if (g.phase === 'HAND_RESULT' && p.phase !== 'HAND_RESULT' && g.lastHandResult) {
      const pts = g.lastHandResult.points[me];
      if (pts !== undefined) sfx(pts > 0 ? 'handHit' : 'handMiss');
    }
    // Fim de jogo
    if (g.phase === 'GAME_OVER' && p.phase !== 'GAME_OVER') sfx(g.championId === me ? 'gameWin' : 'gameOver');
    // Sua vez
    const myTurn = (x: typeof g) => x.currentBidderId === me || x.currentPlayerId === me;
    if (myTurn(g) && !myTurn(p)) setTimeout(() => sfx('turn'), 200);
  }, [room]);
}
