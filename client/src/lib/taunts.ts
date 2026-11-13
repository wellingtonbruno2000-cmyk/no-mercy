import { useSyncExternalStore } from 'react';
import { getAudioSettings } from './audio';

/**
 * Frases de provocação (balões na tela + narração com voz sintetizada genérica do aparelho).
 * A frase é escolhida de forma determinística (mesma partida/rodada/jogador → mesma frase em todas as telas).
 */
export const PHRASES = {
  roundWin: ['Toma!', 'É minha!', 'Essa é minha, hein!', 'Vem pro papai!', 'Pode vir!', 'Sem piedade!', 'Facinho!', 'Anota aí!'],
  /** Narrador anunciando a sua vez (de vez em quando). */
  yourTurn: ['Sua vez, parceiro.', 'Vai lá, mostra o que tem.', 'A mesa tá esperando.', 'E aí, vai de quê?'],
  /** Narrador quando você perde a rodada para alguém. */
  lostRound: ['Essa doeu.', 'Passou raspando.', 'Levaram a sua.', 'Ih, rapaz.'],
  handHit: [
    'Toma essa, pilantra!',
    'Na mosca, meu filho!',
    'É o pai que tá on!',
    'Aprende comigo, aprende!',
    'Isso aqui é NO MERCY!',
    'Chora não, que dói mais!',
    'Calculado, parceiro!',
    'Profissional é outra coisa!',
  ],
  handMiss: [
    'Aaah, safado!',
    'Me roubaram, gente!',
    'Que vacilo, meu Deus!',
    'Isso foi sorte sua, hein!',
    'Não acredito nisso!',
    'Hoje não é meu dia...',
    'Ô carta ruim, sô!',
    'Vou me vingar, viu!',
  ],
  /** Quando você derruba alguém (vence uma carta forte, ou faz o outro errar o palpite). */
  zoar: [
    'Toma, tóxa!',
    'Toma essa, tóxa!',
    'Engole essa!',
    'Pega, que é tua!',
    'Sentiu o golpe?',
    'Foi de base, hein!',
    'Tá com medinho?',
    'Vai chorar?',
    'Chupa essa!',
    'Senta lá, Cláudio!',
    'Volta pra escolinha!',
    'Aqui não, parceiro!',
  ],
  champion: ['Campeão, sem piedade!', 'Respeita o rei da mesa!', 'Podem me chamar de mestre!'],
} as const;

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

/** Fala a frase. `voiceIndex` muda o tom para cada jogador parecer diferente. */
export function speak(text: string, voiceIndex = 0, priority: 'low' | 'high' = 'high') {
  const s = getAudioSettings();
  if (!s.tauntsOn || !s.tauntVoiceOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
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
