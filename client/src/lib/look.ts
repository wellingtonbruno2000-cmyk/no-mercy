import { getRoom, socket } from './store';

/**
 * Multiplayer: cada jogador envia para onde está olhando (posição do mouse ou do dedo, de -1 a 1)
 * e a cabeça do boneco dele se move na tela dos outros. Envio limitado a ~10 vezes por segundo.
 */
const looks = new Map<string, { x: number; y: number; t: number }>();

socket.on('game:look', ({ playerId, x, y }) => {
  looks.set(playerId, { x, y, t: performance.now() });
});

/** Último olhar recebido de um jogador (ou null se ele ainda não mexeu o mouse). */
export function getLook(playerId: string): { x: number; y: number } | null {
  return looks.get(playerId) ?? null;
}

let cur = { x: 0, y: 0 };
let sent = { x: 9, y: 9 };

function shouldSend(): boolean {
  const room = getRoom();
  if (!room || room.status !== 'PLAYING') return false;
  return room.players.some((p) => !p.isBot && p.id !== room.you && p.connected);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    cur = {
      x: Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1)),
      y: Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1)),
    };
  });
  setInterval(() => {
    if (Math.abs(cur.x - sent.x) < 0.02 && Math.abs(cur.y - sent.y) < 0.02) return;
    if (!socket.connected || !shouldSend()) return;
    sent = { ...cur };
    socket.volatile.emit('game:look', sent);
  }, 100);
}
