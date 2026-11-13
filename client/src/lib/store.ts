import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomView, ServerToClientEvents } from '@nomercy/shared';

type S = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Toast {
  id: number;
  kind: 'error' | 'info' | 'success';
  text: string;
}

interface State {
  connected: boolean;
  /** Existe uma partida salva que pode ser retomada (cópia de segurança). */
  savedGame: { code: string; t: number } | null;
  resuming: boolean;
  room: RoomView | null;
  toasts: Toast[];
  /** Diferença entre o relógio do servidor e o local (ms). */
  clockOffset: number;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignora */
  }
}

function getToken(): string {
  let t = safeGet('nomercy:token');
  if (!t || t.length < 16) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    t = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    safeSet('nomercy:token', t);
  }
  return t;
}

export function getSavedName(): string {
  return safeGet('nomercy:name') ?? '';
}
export function saveName(name: string) {
  safeSet('nomercy:name', name);
}

// ---------- Cópia de segurança da partida (para continuar após o servidor reiniciar) ----------
const SNAP_KEY = 'nomercy:snapshot';
interface Snap {
  code: string;
  data: string;
  t: number;
}
function readSnap(): Snap | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Snap;
    if (!s?.data || Date.now() - s.t > 12 * 60 * 60 * 1000) return null;
    return s;
  } catch {
    return null;
  }
}
function writeSnap(s: Snap | null) {
  try {
    if (s) localStorage.setItem(SNAP_KEY, JSON.stringify(s));
    else localStorage.removeItem(SNAP_KEY);
  } catch {
    /* sem espaço ou bloqueado: segue sem cópia */
  }
}

const initialSnap = readSnap();
let state: State = {
  connected: false,
  room: null,
  toasts: [],
  clockOffset: 0,
  savedGame: initialSnap ? { code: initialSnap.code, t: initialSnap.t } : null,
  resuming: false,
};
const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
export const socket: S = io(serverUrl ?? undefined, {
  auth: { token: getToken() },
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
});

socket.on('connect', () => {
  set({ connected: true });
  // Estava numa partida (ou tem uma salva)? Confirma com o servidor — se ele reiniciou, devolve a cópia.
  if (state.room || readSnap()) void resumeGame(true);
});
socket.on('disconnect', () => set({ connected: false }));
socket.on('room:update', (room) => {
  set({ room, clockOffset: room.serverTime - Date.now(), savedGame: null });
  syncUrl(room.code);
  if (room.status !== 'PLAYING') writeSnap(null);
});
socket.on('room:snapshot', ({ code, data }) => {
  writeSnap({ code, data, t: Date.now() });
});
socket.on('room:closed', ({ reason }) => {
  writeSnap(null);
  set({ room: null, savedGame: null });
  syncUrl(null);
  toast(reason, 'info');
});

/**
 * Retoma a partida: se o servidor ainda tem a sala, só reconecta; se ele reiniciou,
 * envia a cópia de segurança e a partida continua de onde parou.
 */
export async function resumeGame(auto = false): Promise<boolean> {
  if (state.resuming) return false;
  const snap = readSnap();
  set({ resuming: true });
  const res = await new Promise<{ ok: boolean; restored?: boolean; error?: string }>((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'Sem resposta do servidor.' }), 15000);
    socket.emit('room:resume', { snapshot: snap?.data ?? null }, (r) => {
      clearTimeout(timer);
      resolve(r as { ok: boolean; restored?: boolean; error?: string });
    });
  });
  set({ resuming: false });
  if (res.ok) {
    if (res.restored) toast('Partida retomada de onde parou!', 'success');
    return true;
  }
  // Não deu para retomar: sai da tela travada e mostra o botão "Voltar à partida" se ainda houver cópia.
  const still = readSnap();
  set({ room: null, savedGame: still ? { code: still.code, t: still.t } : null });
  syncUrl(null);
  if (!auto) {
    toast(res.error ?? 'Não foi possível retomar a partida.');
    writeSnap(null);
    set({ savedGame: null });
  } else if (snap) {
    toast('O servidor reiniciou. Toque em "Voltar à partida" para continuar.', 'info');
  } else {
    toast('A partida foi encerrada (o servidor reiniciou).', 'info');
  }
  return false;
}

export function discardSavedGame() {
  writeSnap(null);
  set({ savedGame: null });
}

function syncUrl(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('sala', code);
  else url.searchParams.delete('sala');
  if (url.toString() !== window.location.href) window.history.replaceState(null, '', url);
}

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'error') {
  const id = ++toastId;
  set({ toasts: [...state.toasts, { id, kind, text }].slice(-4) });
  setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), 3800);
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

type Res = { ok: true; [k: string]: unknown } | { ok: false; error: string };

/** Envia uma intenção ao servidor. O servidor decide se é válida. */
export function send(event: keyof ClientToServerEvents, payload?: unknown): Promise<Res> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      toast('Sem conexão com o servidor. Tentando reconectar…');
      resolve({ ok: false, error: 'offline' });
      return;
    }
    const cb = (res: Res) => {
      if (!res.ok) toast(res.error);
      resolve(res);
    };
    const emit = socket.emit as unknown as (this: S, ...a: unknown[]) => void;
    if (payload === undefined) emit.call(socket, event, cb);
    else emit.call(socket, event, payload, cb);
  });
}

export function leaveRoom() {
  void send('room:leave');
  writeSnap(null);
  set({ room: null, savedGame: null });
  syncUrl(null);
}

export function getRoom(): RoomView | null {
  return state.room;
}

export function serverNow(): number {
  return Date.now() + state.clockOffset;
}
