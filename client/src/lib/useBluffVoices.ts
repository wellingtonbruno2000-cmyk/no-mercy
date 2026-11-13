import { useEffect, useRef } from 'react';
import { claimText, type RoomView } from '@nomercy/shared';
import { sfx } from './audio';
import { pickPhrase, say, speak } from './taunts';

const TABLE_PHRASE: Record<string, string> = {
  BLUE: 'A cor da mesa é azul',
  RED: 'A cor da mesa é vermelha',
  GREEN: 'A cor da mesa é verde',
  YELLOW: 'A cor da mesa é amarela',
};

/** Modo Roleta: legendas (balões) e vozes para cada jogada, acusação e disparo. */
export function useBluffVoices(room: RoomView | null) {
  const prev = useRef<RoomView | null>(null);
  useEffect(() => {
    const beforeRoom = prev.current;
    prev.current = room;
    const b = room?.bluff;
    const p = beforeRoom?.bluff;
    if (!b || !room) return;
    const me = b.you;
    const voiceOf = (id: string) => (id === me ? 0 : Math.max(0, b.players.findIndex((x) => x.id === id)) + 1);
    const key = `${room.code}-${b.round}`;

    // Nova rodada: narrador anuncia a cor da mesa
    if (!p || p.round !== b.round) {
      sfx('shuffle');
      setTimeout(() => speak(TABLE_PHRASE[b.tableColor] ?? '', 0, 'high'), 900);
    }
    if (!p || beforeRoom?.code !== room.code) return;

    // Alguém jogou cartas: legenda + voz dizendo o que jogou ("Duas cartas vermelhas")
    if (b.lastPlay && (!p.lastPlay || p.lastPlay.playerId !== b.lastPlay.playerId || p.handCounts[b.lastPlay.playerId] !== b.handCounts[b.lastPlay.playerId])) {
      if (b.phase === 'TURN' || b.phase === 'REVEAL') {
        const text = claimText(b.lastPlay.count, b.tableColor);
        say(b.lastPlay.playerId, text, 2600);
        sfx('card');
        speak(text, voiceOf(b.lastPlay.playerId), 'high');
      }
    }

    // Acusação: "Mentira, seu safado!" e o resultado da revelação
    if (b.phase === 'REVEAL' && p.phase === 'TURN' && b.call) {
      const c = b.call;
      const callText = pickPhrase('callLie', `${key}-${c.callerId}-${c.play.playerId}-${c.play.count}`);
      say(c.callerId, callText, 3000);
      sfx('lie');
      speak(callText, voiceOf(c.callerId), 'high');
      const verdict = c.special
        ? pickPhrase('specialCard', key)
        : c.truthful
          ? pickPhrase('wasTruth', key)
          : pickPhrase('caughtLie', key);
      setTimeout(() => speak(verdict, 0, 'high'), 400);
    }

    // Roleta começando
    if (b.phase === 'ROULETTE' && p.phase === 'REVEAL') {
      sfx('spin');
      setTimeout(() => sfx('heartbeat'), 900);
      speak(pickPhrase('spin', key), 0, 'low');
    }

    // Disparo
    const shot = b.lastShot;
    if (shot && (!p.lastShot || p.lastShot.playerId !== shot.playerId || p.lastShot.pull !== shot.pull)) {
      if (shot.hit) {
        sfx('bang');
        const t = pickPhrase('out', `${key}-${shot.playerId}`);
        say(shot.playerId, 'FORA!', 3000);
        setTimeout(() => speak(t, 0, 'high'), 500);
      } else {
        sfx('click');
        const t = pickPhrase('survive', `${key}-${shot.playerId}-${shot.pull}`);
        say(shot.playerId, t, 2600);
        setTimeout(() => speak(t, voiceOf(shot.playerId), 'high'), 300);
      }
    }

    if (b.phase === 'GAME_OVER' && p.phase !== 'GAME_OVER' && b.winnerId) {
      const t = pickPhrase('champion', `${room.code}-${b.winnerId}`);
      say(b.winnerId, t, 8000);
      sfx(b.winnerId === me ? 'gameWin' : 'gameOver');
      setTimeout(() => speak(t, voiceOf(b.winnerId!), 'high'), 800);
    }
  }, [room]);
}
