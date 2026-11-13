import { useSyncExternalStore } from 'react';
import type { RoomView, VoiceSignal } from '@nomercy/shared';
import { engine, getAudioSettings, updateAudioSettings } from './audio';
import { send, socket, toast } from './store';

/**
 * Chat de voz em malha (WebRTC): cada jogador conecta o áudio diretamente aos outros da sala.
 * O servidor apenas repassa a sinalização (ofertas, respostas e candidatos ICE).
 */

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const turn = import.meta.env.VITE_TURN_URL as string | undefined;
  if (turn) {
    servers.push({
      urls: turn.split(','),
      username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
    });
  }
  return servers;
}

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  pendingIce: RTCIceCandidateInit[];
  analyser: AnalyserNode | null;
}

interface VoiceState {
  active: boolean;
  joining: boolean;
  micOn: boolean;
  hasMic: boolean;
  speaking: Record<string, boolean>;
  connected: Record<string, RTCPeerConnectionState>;
}

let state: VoiceState = { active: false, joining: false, micOn: true, hasMic: false, speaking: {}, connected: {} };
const listeners = new Set<() => void>();
function set(patch: Partial<VoiceState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useVoice(): VoiceState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

const peers = new Map<string, Peer>();
let localStream: MediaStream | null = null;
let localAnalyser: AnalyserNode | null = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;
let myId = '';

async function getMic(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  const { micDeviceId } = getAudioSettings();
  const constraints: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: micDeviceId ? { ...constraints, deviceId: { exact: micDeviceId } } : constraints,
    });
  } catch {
    if (micDeviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: constraints });
      } catch {
        return null;
      }
    }
    return null;
  }
}

function localTrack(): MediaStreamTrack | null {
  return localStream?.getAudioTracks()[0] ?? null;
}

function makeAnalyser(stream: MediaStream): AnalyserNode | null {
  engine.unlock();
  const ctx = engine.ctx;
  if (!ctx) return null;
  try {
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an); // não conecta ao destino: só medição
    return an;
  } catch {
    return null;
  }
}

function level(an: AnalyserNode | null): number {
  if (!an) return 0;
  const buf = new Uint8Array(an.fftSize);
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += ((v - 128) / 128) ** 2;
  return Math.sqrt(sum / buf.length);
}

function startMeter() {
  if (meterTimer) return;
  meterTimer = setInterval(() => {
    const speaking: Record<string, boolean> = {};
    if (state.micOn && localAnalyser) speaking[myId] = level(localAnalyser) > 0.04;
    for (const [id, p] of peers) speaking[id] = level(p.analyser) > 0.04;
    const changed = Object.keys({ ...speaking, ...state.speaking }).some((k) => !!speaking[k] !== !!state.speaking[k]);
    if (changed) set({ speaking });
  }, 160);
}

function applyOutput(audio: HTMLAudioElement) {
  const s = getAudioSettings();
  audio.volume = Math.max(0, Math.min(1, s.voiceVolume));
  audio.muted = s.voiceMuted;
  const a = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (a.setSinkId && s.outputDeviceId) a.setSinkId(s.outputDeviceId).catch(() => undefined);
}

function signal(to: string, data: VoiceSignal) {
  socket.emit('voice:signal', { to, data });
}

function updateConnected() {
  const connected: Record<string, RTCPeerConnectionState> = {};
  for (const [id, p] of peers) connected[id] = p.pc.connectionState;
  set({ connected });
}

function createPeer(id: string): Peer {
  closePeer(id);
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const audio = new Audio();
  audio.autoplay = true;
  (audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
  applyOutput(audio);
  const peer: Peer = { pc, audio, pendingIce: [], analyser: null };
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      const c = e.candidate.toJSON();
      signal(id, { type: 'ice', candidate: { candidate: c.candidate ?? '', sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null } });
    }
  };
  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
    peer.analyser = makeAnalyser(stream);
  };
  pc.onconnectionstatechange = () => {
    updateConnected();
    if (pc.connectionState === 'failed') pc.restartIce?.();
  };
  peers.set(id, peer);
  updateConnected();
  return peer;
}

function closePeer(id: string) {
  const p = peers.get(id);
  if (!p) return;
  p.pc.onicecandidate = null;
  p.pc.ontrack = null;
  p.pc.onconnectionstatechange = null;
  p.pc.close();
  p.audio.srcObject = null;
  peers.delete(id);
  updateConnected();
}

async function callPeer(id: string) {
  const peer = createPeer(id);
  const tr = peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
  await tr.sender.replaceTrack(localTrack());
  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);
  signal(id, { type: 'offer', sdp: offer.sdp ?? '' });
}

async function flushIce(peer: Peer) {
  for (const c of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(c).catch(() => undefined);
}

// Navegadores só tocam áudio depois de um toque/clique: ao primeiro gesto, garante que as vozes tocam.
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    () => {
      for (const p of peers.values()) if (p.audio.paused && p.audio.srcObject) void p.audio.play().catch(() => undefined);
    },
    { capture: true },
  );
}

/** Salas onde já tentamos entrar na voz automaticamente (não insiste se o usuário recusar o microfone). */
const autoTried = new Set<string>();

/** Entra na voz automaticamente quando há outros jogadores humanos na sala. */
export function autoJoinVoice(room: RoomView | null) {
  if (!room || state.active || state.joining || autoTried.has(room.code)) return;
  const others = room.players.some((p) => !p.isBot && p.id !== room.you && p.connected);
  if (!others) return;
  autoTried.add(room.code);
  void joinVoice();
}

socket.on('voice:signal', async ({ from, data }) => {
  if (!state.active) return;
  try {
    if (data.type === 'offer') {
      const peer = createPeer(from);
      await peer.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      const tr = peer.pc.getTransceivers()[0];
      if (tr) {
        tr.direction = 'sendrecv';
        await tr.sender.replaceTrack(localTrack());
      }
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      signal(from, { type: 'answer', sdp: answer.sdp ?? '' });
      await flushIce(peer);
    } else if (data.type === 'answer') {
      const peer = peers.get(from);
      if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      await flushIce(peer);
    } else if (data.type === 'ice') {
      const peer = peers.get(from);
      if (!peer) return;
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate).catch(() => undefined);
      else peer.pendingIce.push(data.candidate);
    }
  } catch (err) {
    console.warn('[voz] falha na sinalização', err);
  }
});

/** Entra no chat de voz da sala. */
export async function joinVoice() {
  if (state.active || state.joining) return;
  if (typeof RTCPeerConnection === 'undefined') {
    toast('Seu navegador não suporta chat de voz.');
    return;
  }
  set({ joining: true });
  localStream = await getMic();
  const hasMic = !!localStream;
  if (!hasMic) toast('Microfone indisponível ou bloqueado. Você vai apenas ouvir.', 'info');
  localAnalyser = localStream ? makeAnalyser(localStream) : null;
  const micOn = hasMic && state.micOn;
  const track = localTrack();
  if (track) track.enabled = micOn;
  const res = await send('voice:join', { micOn });
  if (!res.ok) {
    stopLocal();
    set({ joining: false });
    return;
  }
  set({ active: true, joining: false, hasMic, micOn });
  startMeter();
  engine.play('join');
  for (const id of (res as unknown as { peers: string[] }).peers) void callPeer(id).catch((e) => console.warn(e));
  // Lista de dispositivos ganha nomes depois da permissão.
  void refreshDevices();
}

function stopLocal() {
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  localAnalyser = null;
}

/** Sai do chat de voz. */
export function leaveVoice(notify = true) {
  for (const id of [...peers.keys()]) closePeer(id);
  stopLocal();
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = null;
  if (notify && state.active) void send('voice:leave');
  set({ active: false, joining: false, speaking: {}, connected: {} });
}

/** Liga ou desliga o microfone a qualquer momento. */
export async function setMic(on: boolean) {
  if (on && !localStream) {
    localStream = await getMic();
    if (!localStream) {
      toast('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
      return;
    }
    localAnalyser = makeAnalyser(localStream);
    for (const p of peers.values()) await p.pc.getTransceivers()[0]?.sender.replaceTrack(localTrack());
    set({ hasMic: true });
  }
  const track = localTrack();
  if (track) track.enabled = on;
  set({ micOn: on });
  if (state.active) void send('voice:mic', { micOn: on });
}

/** Troca o microfone durante a partida, sem derrubar as conexões. */
export async function changeMicDevice(deviceId: string) {
  updateAudioSettings({ micDeviceId: deviceId });
  if (!state.active || !localStream) return;
  const next = await getMic();
  if (!next) {
    toast('Não foi possível usar esse microfone.');
    return;
  }
  const old = localStream;
  localStream = next;
  localAnalyser = makeAnalyser(next);
  const track = localTrack();
  if (track) track.enabled = state.micOn;
  for (const p of peers.values()) await p.pc.getTransceivers()[0]?.sender.replaceTrack(track);
  old.getTracks().forEach((t) => t.stop());
}

/** Reaplica volume/saída/silêncio das vozes (chamado quando as configurações mudam). */
export function applyVoiceOutput() {
  for (const p of peers.values()) applyOutput(p.audio);
}

/** Mantém as conexões coerentes com a sala (fecha quem saiu da voz). */
export function syncVoiceWithRoom(room: RoomView | null) {
  if (!room) {
    if (state.active) leaveVoice(false);
    autoTried.clear();
    return;
  }
  autoJoinVoice(room);
  myId = room.you;
  if (!state.active) return;
  const me = room.players.find((p) => p.id === room.you);
  if (me && !me.voice && !state.joining) {
    // O servidor nos tirou da voz (ex.: reconexão). Entra de novo.
    leaveVoice(false);
    void joinVoice();
    return;
  }
  const inVoice = new Set(room.players.filter((p) => p.voice && p.id !== room.you).map((p) => p.id));
  for (const id of [...peers.keys()]) if (!inVoice.has(id)) closePeer(id);
}

// ---------- Dispositivos ----------
interface Devices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}
let devices: Devices = { inputs: [], outputs: [] };
const deviceListeners = new Set<() => void>();

export async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    devices = {
      inputs: list.filter((d) => d.kind === 'audioinput'),
      outputs: list.filter((d) => d.kind === 'audiooutput'),
    };
    deviceListeners.forEach((l) => l());
  } catch {
    /* ignora */
  }
}
navigator.mediaDevices?.addEventListener?.('devicechange', () => void refreshDevices());

export function useDevices(): Devices {
  return useSyncExternalStore(
    (l) => {
      deviceListeners.add(l);
      return () => deviceListeners.delete(l);
    },
    () => devices,
  );
}

export const supportsOutputSelection =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

// Para depuração/testes automatizados.
(window as unknown as { __voice: unknown }).__voice = { peers, state: () => state };
