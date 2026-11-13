import { useEffect, useRef } from 'react';
import type { PlayerView, RoomView } from '@nomercy/shared';
import { useVoice } from '../lib/voice';
import { getLook } from '../lib/look';
import { BarScene, type HandState, type Mood, type SceneState } from './BarScene';

interface Props {
  g: PlayerView;
  room: RoomView;
  onFail: () => void;
  hand: HandState;
  /** Você está analisando suas cartas (mão 2D): os personagens ficam desconfiados. */
  suspicious: boolean;
  onCardClick: (cardId: string) => void;
  onCardHover: (hovering: boolean) => void;
}

/** Liga o estado do jogo (vindo do servidor) à cena 3D. Carregado sob demanda. */
export default function Table3D({ g, room, onFail, hand, suspicious, onCardClick, onCardHover }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BarScene | null>(null);
  const voice = useVoice();
  const cbRef = useRef({ onCardClick, onCardHover });
  cbRef.current = { onCardClick, onCardHover };

  useEffect(() => {
    try {
      sceneRef.current = new BarScene(ref.current!, {
        onCardClick: (id) => cbRef.current.onCardClick(id),
        onCardHover: (h) => cbRef.current.onCardHover(h),
        getLook,
        onContextLost: () => onFail(),
      });
    } catch (err) {
      console.warn('[3D] indisponível, voltando para 2D', err);
      onFail();
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [onFail]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const meSeat = g.players.findIndex((p) => p.id === g.you);
    const order = [...g.players.slice(meSeat), ...g.players.slice(0, meSeat)].map((p) => p.id);
    const seatOf = new Map(order.map((id, i) => [id, i]));
    const conn = new Map(room.players.map((p) => [p.id, p]));
    const opponents = order.slice(1).map((id) => {
      const p = g.players.find((x) => x.id === id)!;
      const participant = g.participants.includes(id);
      return {
        id,
        name: conn.get(id)?.name ?? p.name,
        pts: g.scores[id] ?? 0,
        bid: g.bids[id] ?? null,
        won: g.tricksWon[id] ?? 0,
        active: g.currentBidderId === id || g.currentPlayerId === id,
        cardsInHand: g.handCounts[id] ?? 0,
        blindCard: g.visibleHands[id]?.[0] ?? null,
        participant,
        speaking: !!voice.speaking[id],
        offline: conn.get(id)?.connected === false,
        human: !p.isBot && !conn.get(id)?.autopilot,
      };
    });
    const plays = g.phase === 'ROUND_RESULT' && g.lastRound ? g.lastRound.plays : g.phase === 'PLAYING' ? g.currentTrick : [];
    const winnerSeat = g.phase === 'ROUND_RESULT' && g.lastRound ? (seatOf.get(g.lastRound.winnerId) ?? null) : null;
    const moods: Mood[] = opponents.map((o) => {
      if (g.phase === 'ROUND_RESULT' && g.lastRound?.winnerId === o.id) return 'win';
      if (g.phase === 'HAND_RESULT' && g.lastHandResult && g.lastHandResult.points[o.id] !== undefined) {
        return g.lastHandResult.points[o.id] > 0 ? 'win' : 'lose';
      }
      if (g.phase === 'GAME_OVER') return g.championId === o.id ? 'win' : null;
      return null;
    });
    const st: SceneState = {
      opponents,
      myWon: g.tricksWon[g.you] ?? 0,
      trick: plays.map((p) => ({ seat: seatOf.get(p.playerId) ?? 0, card: p.card, jokerMode: p.jokerMode })),
      winnerSeat,
      moods,
      tiebreak: g.stage === 'TIEBREAK',
    };
    scene.setState(st);
  }, [g, room, voice.speaking]);

  useEffect(() => {
    sceneRef.current?.setHand(hand);
  }, [hand]);

  useEffect(() => {
    if (!hand.enabled) sceneRef.current?.setSuspicious(suspicious);
  }, [suspicious, hand.enabled]);

  return <div ref={ref} className="absolute inset-0" data-testid="table-3d" />;
}
