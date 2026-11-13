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

    // Venceu a rodada: balão curto (sem voz, para não ficar repetitivo)
    if (g.phase === 'ROUND_RESULT' && before.phase !== 'ROUND_RESULT' && g.lastRound) {
      const w = g.lastRound.winnerId;
      say(w, pickPhrase('roundWin', `${handKey}-${g.lastRound.roundNumber}-${w}`), 2200);
    }

    // Fim da partida: quem acertou provoca, quem errou reclama
    if (g.phase === 'HAND_RESULT' && before.phase !== 'HAND_RESULT' && g.lastHandResult) {
      const rec = g.lastHandResult;
      const lines = rec.participants.map((id) => {
        const hit = rec.points[id] > 0;
        return { id, hit, text: pickPhrase(hit ? 'handHit' : 'handMiss', `${handKey}-${id}`) };
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
