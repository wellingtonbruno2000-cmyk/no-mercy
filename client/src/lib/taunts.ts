import { useSyncExternalStore } from 'react';
import { engine, getAudioSettings } from './audio';
import phrases from '../../../shared/src/phrases.json';

/**
 * Frases de provocação (balões na tela + narração com voz sintetizada genérica do aparelho).
 * A frase é escolhida de forma determinística (mesma partida/rodada/jogador → mesma frase em todas as telas).
 */
export const PHRASES = phrases;

export type PhraseKind = keyof typeof PHRASES;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function pickPhrase(kind: PhraseKind, seed: string): string {
  const list = PHRASES[kind];
  return list[hash(kind + ':' + seed) % list.length];
}

// ---------- Balões por jogador ----------
interface Bubble {
  text: string;
  until: number;
  key: number;
}
let bubbles: Record<string, Bubble> = {};
let bubbleKey = 0;
const listeners = new Set<() => void>();

export function say(playerId: string, text: string, ms = 2600) {
  if (!getAudioSettings().tauntsOn) return;
  bubbles = { ...bubbles, [playerId]: { text, until: Date.now() + ms, key: ++bubbleKey } };
  listeners.forEach((l) => l());
  setTimeout(() => {
    if (bubbles[playerId]?.until && bubbles[playerId].until <= Date.now() + 20) {
      const next = { ...bubbles };
      delete next[playerId];
      bubbles = next;
      listeners.forEach((l) => l());
    }
  }, ms + 30);
}

export function useBubbles(): Record<string, Bubble> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => bubbles,
  );
}

// ---------- Narração (voz sintetizada do próprio aparelho, genérica) ----------
let ptVoices: SpeechSynthesisVoice[] = [];
const voiceListeners = new Set<() => void>();
/** Vozes de IA (neurais) costumam ter "Natural", "Online", "Neural" ou "Google" no nome: ficam primeiro. */
function voiceScore(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (/pt[-_]BR/i.test(v.lang)) s += 10;
  if (/natural|neural|online/i.test(v.name)) s += 6;
  if (/google/i.test(v.name)) s += 5;
  if (/francisca|antonio|thalita|luciana|felipe/i.test(v.name)) s += 3;
  return s;
}
function loadVoices() {
  try {
    ptVoices = window.speechSynthesis.getVoices().filter((v) => /^pt/i.test(v.lang));
    ptVoices.sort((a, b) => voiceScore(b) - voiceScore(a));
  } catch {
    ptVoices = [];
  }
  voiceListeners.forEach((l) => l());
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

/** Vozes em português disponíveis no aparelho (para o seletor nas configurações). */
export function useNarratorVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(
    (l) => {
      voiceListeners.add(l);
      return () => voiceListeners.delete(l);
    },
    () => ptVoices,
  );
}

// ---------- Vozes neurais pré-gravadas (geradas pelo workflow "Gerar vozes" no GitHub) ----------
interface VoiceManifest {
  voices: string[];
  ids: Record<string, string>;
}
let manifest: VoiceManifest | null | undefined; // undefined = ainda não carregado; null = não existe
let manifestLoading: Promise<void> | null = null;
const bufferCache = new Map<string, Promise<AudioBuffer | null>>();

/** Mesmo hash usado pelo gerador (FNV-1a 32 bits sobre o texto em UTF-8). */
export function phraseId(text: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function loadManifest() {
  if (manifest !== undefined || manifestLoading) return manifestLoading;
  manifestLoading = fetch('/voices/manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((m: VoiceManifest | null) => {
      manifest = m && Array.isArray(m.voices) && m.voices.length ? m : null;
    })
    .catch(() => {
      manifest = null;
    });
  return manifestLoading;
}
if (typeof window !== 'undefined') void loadManifest();

function voiceFor(index: number): string | null {
  if (!manifest) return null;
  const chars = manifest.voices.filter((v) => v !== 'narrador');
  if (index === 0) return manifest.voices.includes('narrador') ? 'narrador' : manifest.voices[0];
  return chars.length ? chars[(index - 1) % chars.length] : manifest.voices[0];
}

function loadBuffer(voice: string, id: string): Promise<AudioBuffer | null> {
  const key = `${voice}/${id}`;
  let p = bufferCache.get(key);
  if (!p) {
    p = fetch(`/voices/${key}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('sem áudio'))))
      .then((ab) => {
        engine.unlock();
        return engine.ctx ? engine.ctx.decodeAudioData(ab) : null;
      })
      .catch(() => null);
    bufferCache.set(key, p);
  }
  return p;
}

/** Fala a frase. Usa a voz neural gravada (com eco de bar) quando existe; senão, a voz do aparelho. */
export function speak(text: string, voiceIndex = 0, priority: 'low' | 'high' = 'high') {
  const s = getAudioSettings();
  if (!s.tauntsOn || !s.tauntVoiceOn || typeof window === 'undefined') return;
  const id = phraseId(text);
  const voice = voiceFor(voiceIndex);
  if (voice && manifest?.ids[id] && !s.narratorVoice) {
    void loadBuffer(voice, id).then((buf) => {
      if (buf && engine.playVoice(buf, Math.max(0.3, Math.min(1.2, s.sfxVolume + 0.3)), priority)) return;
      speakDevice(text, voiceIndex, priority);
    });
    return;
  }
  speakDevice(text, voiceIndex, priority);
}

/** Voz sintetizada do próprio aparelho (reserva). */
function speakDevice(text: string, voiceIndex: number, priority: 'low' | 'high') {
  const s = getAudioSettings();
  if (!('speechSynthesis' in window)) return;
  try {
    // Falas comuns (rodadas) não atropelam outra fala; as importantes (fim de partida) entram na fila.
    if (priority === 'low' && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    const chosen = s.narratorVoice ? ptVoices.find((v) => v.voiceURI === s.narratorVoice) : undefined;
    if (chosen) u.voice = chosen;
    else if (ptVoices.length) u.voice = ptVoices[voiceIndex === 0 ? 0 : voiceIndex % ptVoices.length];
    // Cada jogador com um tom diferente
    u.pitch = [1.0, 0.75, 1.3, 0.9, 1.15][voiceIndex % 5];
    u.rate = 1.08;
    u.volume = Math.max(0.2, Math.min(1, s.sfxVolume + 0.2));
    window.speechSynthesis.speak(u);
  } catch {
    /* sem suporte à voz: só o balão */
  }
}
