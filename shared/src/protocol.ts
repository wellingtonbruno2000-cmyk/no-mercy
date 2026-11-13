import type { JokerMode, PlayerView } from './types';

export type RoomStatus = 'LOBBY' | 'PLAYING' | 'FINISHED';

export interface RoomSettings {
  /** Tempo por jogada em segundos (0 = sem limite). */
  turnSeconds: number;
}

export const TURN_SECONDS_OPTIONS = [0, 30, 60, 90] as const;

export interface RoomPlayer {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  /** Jogador humano que saiu durante a partida e está sendo controlado pelo sistema. */
  autopilot: boolean;
  /** Está no chat de voz da sala. */
  voice: boolean;
  /** Microfone ligado (só faz sentido com voice = true). */
  micOn: boolean;
}

/** Mensagens de sinalização WebRTC repassadas pelo servidor (o áudio vai direto entre os jogadores). */
export type VoiceSignal =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } };

export interface RoomView {
  code: string;
  hostId: string;
  you: string;
  players: RoomPlayer[];
  settings: RoomSettings;
  status: RoomStatus;
  game: PlayerView | null;
  /** Prazo (epoch ms) da ação atual ou da transição automática. */
  deadline: number | null;
  serverTime: number;
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'room:create': (p: { name: string; solo?: boolean; botCount?: number; code?: string }, ack: Ack<{ code: string }>) => void;
  'room:join': (p: { code: string; name: string }, ack: Ack<{ code: string }>) => void;
  'room:leave': (ack?: Ack) => void;
  'room:addBot': (ack?: Ack) => void;
  'room:fillBots': (ack?: Ack) => void;
  'room:removePlayer': (p: { playerId: string }, ack?: Ack) => void;
  'room:settings': (p: Partial<RoomSettings>, ack?: Ack) => void;
  'room:rename': (p: { name: string }, ack?: Ack) => void;
  'game:start': (ack?: Ack) => void;
  'game:bid': (p: { value: number }, ack?: Ack) => void;
  'game:play': (p: { cardId: string; jokerMode: JokerMode | null }, ack?: Ack) => void;
  'game:rematch': (ack?: Ack) => void;
  'voice:join': (p: { micOn: boolean }, ack: Ack<{ peers: string[] }>) => void;
  'voice:leave': (ack?: Ack) => void;
  'voice:mic': (p: { micOn: boolean }, ack?: Ack) => void;
  'voice:signal': (p: { to: string; data: VoiceSignal }) => void;
  /** Para onde o jogador está olhando (posição do mouse, -1..1). Usado para mover a cabeça do boneco. */
  'game:look': (p: { x: number; y: number }) => void;
  /** Ao reconectar: confirma a sala atual ou restaura a partida a partir da cópia de segurança. */
  'room:resume': (p: { snapshot: string | null }, ack: Ack<{ code: string; restored: boolean }>) => void;
}

export interface ServerToClientEvents {
  'room:update': (view: RoomView) => void;
  'room:closed': (p: { reason: string }) => void;
  'voice:signal': (p: { from: string; data: VoiceSignal }) => void;
  'game:look': (p: { playerId: string; x: number; y: number }) => void;
  /** Cópia de segurança criptografada da partida (o navegador só guarda e devolve). */
  'room:snapshot': (p: { code: string; data: string }) => void;
}
