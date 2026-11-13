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

let state: State = { connected: false, room: null, toasts: [], clockOffset: 0 };
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

socket.on('connect', () => set({ connected: true }));
socket.on('disconnect', () => set({ connected: false }));
socket.on('room:update', (room) => {
  set({ room, clockOffset: room.serverTime - Date.now() });
  syncUrl(room.code);
});
socket.on('room:closed', ({ reason }) => {
  set({ room: null });
  syncUrl(null);
  toast(reason, 'info');
});

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
  set({ room: null });
  syncUrl(null);
}

export function getRoom(): RoomView | null {
  return state.room;
}

export function serverNow(): number {
  return Date.now() + state.clockOffset;
}
