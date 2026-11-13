import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@nomercy/shared';
import { useVoice } from '../lib/voice';
import { getLook } from '../lib/look';
import { useBubbles } from '../lib/taunts';
import { BarScene, type SceneState } from './BarScene';

/** Mesa 3D do modo Roleta Sem Piedade: personagens com revólver, mira, disparo e queda. */
export default function BluffTable3D({ room, onFail, onReady }: { room: RoomView; onFail: () => void; onReady: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BarScene | null>(null);
  const voice = useVoice();
  const bubbles = useBubbles();
  const shown = useRef(new Set<number>());
  const b = room.bluff!;
  // O próximo a atirar levanta a arma um pouco depois do resultado do disparo anterior
  const [aimNext, setAimNext] = useState<string | null>(null);
  const shotKey = b.lastShot ? `${b.round}-${b.lastShot.playerId}-${b.lastShot.pull}` : '';
  const next = b.phase === 'ROULETTE' ? b.shootQueue[0] ?? null : null;
  useEffect(() => {
    setAimNext(null);
    if (!b.lastShot || !next) return;
    const t = setTimeout(() => setAimNext(next), 1500);
    return () => clearTimeout(t);
  }, [shotKey, next, b.lastShot]);

  useEffect(() => {
    try {
      sceneRef.current = new BarScene(ref.current!, { getLook, onContextLost: () => onFail() });
      onReady();
    } catch (err) {
      console.warn('[3D] indisponível', err);
      onFail();
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [onFail, onReady]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const meIdx = b.players.findIndex((p) => p.id === b.you);
    const order = [...b.players.slice(meIdx + 1), ...b.players.slice(0, meIdx)];
    const conn = new Map(room.players.map((p) => [p.id, p]));
    const st: SceneState = {
      opponents: order.map((p) => ({
        id: p.id,
        name: conn.get(p.id)?.name ?? p.name,
        pts: 0,
        bid: null,
        won: 0,
        active: b.phase === 'TURN' && b.turnId === p.id,
        cardsInHand: b.alive[p.id] ? b.handCounts[p.id] ?? 0 : 0,
        blindCard: null,
        participant: true,
        speaking: !!voice.speaking[p.id],
        offline: conn.get(p.id)?.connected === false,
        human: !p.isBot && !conn.get(p.id)?.autopilot,
        subtitle: `🔫 ${b.pulls[p.id] ?? 0}/6  ·  ${b.handCounts[p.id] ?? 0} cartas`,
        out: !b.alive[p.id],
      })),
      myWon: 0,
      trick: [],
      winnerSeat: null,
      moods: order.map((p) => (b.phase === 'GAME_OVER' && b.winnerId === p.id ? 'win' : null)),
      tiebreak: false,
    };
    scene.setState(st);
    const shot = b.phase === 'ROULETTE' && b.lastShot ? { id: b.lastShot.playerId, hit: b.lastShot.hit, key: shotKey } : null;
    scene.setBluff({
      meId: b.you,
      tableColor: b.tableColor,
      pileCount: b.lastPlay?.count ?? 0,
      reveal: b.phase !== 'TURN' && b.call ? b.call.play.cards : null,
      aiming: b.phase === 'ROULETTE' ? aimNext ?? (b.lastShot ? b.lastShot.playerId : next) : null,
      shot,
      out: b.players.filter((p) => !b.alive[p.id]).map((p) => p.id),
    });
  }, [b, room, voice.speaking, aimNext, shotKey, next]);

  useEffect(() => {
    for (const [id, bb] of Object.entries(bubbles)) {
      if (shown.current.has(bb.key)) continue;
      shown.current.add(bb.key);
      sceneRef.current?.say(id, bb.text, Math.max(500, bb.until - Date.now()));
    }
  }, [bubbles]);

  return <div ref={ref} className="absolute inset-0" data-testid="bluff-3d" />;
}
