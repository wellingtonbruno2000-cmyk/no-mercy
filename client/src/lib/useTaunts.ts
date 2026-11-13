import { useEffect, useRef } from 'react';
import type { RoomView } from '@nomercy/shared';
import { pickPhrase, say, speak } from './taunts';

/** Dispara frases engraçadas nos momentos certos (vitória de rodada, fim de partida, campeão). */
export function useTaunts(room: RoomView | null) {
  const prev = useRef<RoomView | null>(null);
  useEffect(() => {
    const beforeRoom = prev.current;
    prev.current = room;
    const before = beforeRoom?.game;
    const g = room?.game;
    if (!g || !before || beforeRoom?.code !== room?.code) return;
    const me = g.you;
    const seat = (id: string) => Math.max(0, g.players.findIndex((p) => p.id === id));
    const handKey = `${g.stage}-${g.handNumber}-${g.tiebreakNumber}`;

    // Venceu a rodada: se derrubou uma carta forte de alguém (9, 10 ou coringa), zoa com "Toma, tóxa!".
    if (g.phase === 'ROUND_RESULT' && before.phase !== 'ROUND_RESULT' && g.lastRound) {
      const w = g.lastRound.winnerId;
      const seed = `${handKey}-${g.lastRound.roundNumber}-${w}`;
      const beatStrong = g.lastRound.plays.some(
        (p) => p.playerId !== w && (p.card.value === 'JOKER' ? p.jokerMode === 'MAX' : (p.card.value as number) >= 9),
      );
      const text = pickPhrase(beatStrong ? 'zoar' : 'roundWin', seed);
      say(w, text, 2400);
      // Vozes durante o jogo: quem venceu a rodada fala (cada jogador com um tom)
      speak(text, w === me ? 0 : seat(w) + 1, beatStrong ? 'high' : 'low');
    }

    // Sua vez de jogar: o narrador chama de vez em quando (1 a cada 3 vezes, para não cansar)
    const myTurn = g.phase === 'PLAYING' && g.currentPlayerId === me;
    const wasMyTurn = before.phase === 'PLAYING' && before.currentPlayerId === me;
    if (myTurn && !wasMyTurn) {
      const seed = `${handKey}-${g.roundNumber}-turn`;
      if (pickPhrase('zoar', seed).length % 3 === 0) speak(pickPhrase('yourTurn', seed), 0, 'low');
    }

    // Fim da partida: quem acertou provoca, quem errou reclama
    if (g.phase === 'HAND_RESULT' && before.phase !== 'HAND_RESULT' && g.lastHandResult) {
      const rec = g.lastHandResult;
      const someoneMissed = rec.participants.some((id) => rec.points[id] === 0);
      const lines = rec.participants.map((id) => {
        const hit = rec.points[id] > 0;
        // Quem acertou enquanto outro errou às vezes zoa ("Toma, tóxa!"); senão comemora.
        const kind = hit ? (someoneMissed && pickPhrase('zoar', `${handKey}-${id}`).length % 2 === 0 ? 'zoar' : 'handHit') : 'handMiss';
        return { id, hit, text: pickPhrase(kind, `${handKey}-${id}`) };
      });
      for (const l of lines) say(l.id, l.text, 6500);
      // Narra a sua frase e a de um adversário (para não falar todo mundo ao mesmo tempo)
      const mine = lines.find((l) => l.id === me);
      const other = lines.find((l) => l.id !== me && (mine ? l.hit !== mine.hit : true)) ?? lines.find((l) => l.id !== me);
      if (mine) speak(mine.text, 0);
      if (other) setTimeout(() => speak(other.text, seat(other.id) + 1), mine ? 1600 : 0);
    }

    if (g.phase === 'GAME_OVER' && before.phase !== 'GAME_OVER' && g.championId) {
      const text = pickPhrase('champion', `${room!.code}-${g.championId}`);
      say(g.championId, text, 8000);
      speak(text, g.championId === me ? 0 : seat(g.championId) + 1);
    }
  }, [room]);
}
