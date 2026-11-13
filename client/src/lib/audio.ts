import { useSyncExternalStore } from 'react';

/**
 * Áudio do NO MERCY: música de fundo e efeitos sonoros gerados em tempo real com Web Audio
 * (nenhum arquivo externo). Preferências ficam salvas no navegador.
 */

export interface AudioSettings {
  musicOn: boolean;
  musicVolume: number; // 0..1
  sfxOn: boolean;
  sfxVolume: number;
  voiceVolume: number; // volume das vozes dos outros jogadores
  voiceMuted: boolean; // silenciar todas as vozes
  micDeviceId: string;
  outputDeviceId: string;
  /** Mesa 3D nas partidas de 4 jogadores. */
  view3d: boolean;
  /** Segurar as próprias cartas em 3D (mesa 3D). */
  hand3d: boolean;
  /** Frases engraçadas em balões. */
  tauntsOn: boolean;
  /** Narrar as frases com voz sintetizada. */
  tauntVoiceOn: boolean;
  /** Voz escolhida para o narrador (vazio = automática). */
  narratorVoice: string;
}

const DEFAULTS: AudioSettings = {
  musicOn: true,
  musicVolume: 0.35,
  sfxOn: true,
  sfxVolume: 0.7,
  voiceVolume: 1,
  voiceMuted: false,
  micDeviceId: '',
  outputDeviceId: '',
  view3d: true,
  // Mãos 3D por padrão em computadores (mouse); no celular a mão 2D é mais legível.
  hand3d: typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches,
  tauntsOn: true,
  tauntVoiceOn: true,
  narratorVoice: '',
};

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem('nomercy:audio');
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignora */
  }
  return { ...DEFAULTS };
}

let settings = load();
const listeners = new Set<() => void>();

export function getAudioSettings(): AudioSettings {
  return settings;
}

export function updateAudioSettings(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem('nomercy:audio', JSON.stringify(settings));
  } catch {
    /* ignora */
  }
  engine.apply();
  listeners.forEach((l) => l());
}

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settings,
  );
}

export type Sfx =
  | 'click'
  | 'card'
  | 'deal'
  | 'turn'
  | 'bid'
  | 'roundWin'
  | 'roundOther'
  | 'handHit'
  | 'handMiss'
  | 'gameWin'
  | 'gameOver'
  | 'tiebreak'
  | 'join'
  | 'shuffle';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextStep = 0;
  private step = 0;
  private sinkApplied = '';

  /** Cria o contexto de áudio (precisa de um gesto do usuário nos navegadores). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      this.musicBus.connect(comp);
      this.sfxBus.connect(comp);
      comp.connect(this.master);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.apply();
  }

  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(settings.musicOn ? settings.musicVolume * 0.55 : 0, t, 0.15);
    this.sfxBus.gain.setTargetAtTime(settings.sfxOn ? settings.sfxVolume : 0, t, 0.05);
    if (settings.musicOn && settings.musicVolume > 0) this.startMusic();
    else this.stopMusic();
    const sink = settings.outputDeviceId;
    const ctxWithSink = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (ctxWithSink.setSinkId && sink !== this.sinkApplied) {
      this.sinkApplied = sink;
      ctxWithSink.setSinkId(sink).catch(() => undefined);
    }
  }

  // ---------- Instrumentos ----------
  private tone(
    bus: AudioNode,
    freq: number,
    start: number,
    dur: number,
    { type = 'sine' as OscillatorType, gain = 0.2, attack = 0.005, release = 0.12, slideTo = 0, filter = 0 } = {},
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur + release);
    let node: AudioNode = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(bus);
    osc.start(start);
    osc.stop(start + dur + release + 0.05);
  }

  private noiseHit(bus: AudioNode, start: number, dur: number, { gain = 0.2, freq = 2000, q = 1, type = 'bandpass' as BiquadFilterType } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  // ---------- Vozes com acústica de bar ----------
  private barReverb: ConvolverNode | null = null;
  private voiceBus: GainNode | null = null;
  private voiceEnd = 0;
  private voiceSources = new Set<AudioBufferSourceNode>();

  /** Para imediatamente todas as falas (botão de mutar vozes). */
  stopVoices() {
    for (const s of this.voiceSources) {
      try {
        s.stop();
      } catch {
        /* já parou */
      }
    }
    this.voiceSources.clear();
    this.voiceEnd = 0;
  }

  /** Resposta de impulso sintética de um salão de bar: madeira, teto baixo, cauda curta (~1,2 s). */
  private ensureVoiceChain() {
    if (!this.ctx || this.voiceBus) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 1.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // reflexões iniciais (paredes próximas) + cauda que decai
        const early = i < ctx.sampleRate * 0.04 && Math.random() < 0.02 ? 0.6 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) + early) * 0.5;
      }
    }
    this.barReverb = ctx.createConvolver();
    this.barReverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    const tone = ctx.createBiquadFilter(); // um pouco abafado, como num salão com gente
    tone.type = 'lowpass';
    tone.frequency.value = 7000;
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(tone);
    tone.connect(this.master);
    this.barReverb.connect(wet);
    wet.connect(this.voiceBus);
  }

  /**
   * Toca uma fala gravada com o eco do bar. Retorna false se não puder tocar agora.
   * `priority: 'low'` não toca se já houver alguém falando; 'high' entra na fila.
   */
  playVoice(buf: AudioBuffer, volume: number, priority: 'low' | 'high'): boolean {
    if (!this.ctx) return false;
    this.ensureVoiceChain();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (priority === 'low' && this.voiceEnd > now) return true;
    const start = Math.max(now + 0.02, this.voiceEnd + 0.15);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.voiceBus!);
    g.connect(this.barReverb!);
    src.start(start);
    this.voiceSources.add(src);
    src.onended = () => this.voiceSources.delete(src);
    this.voiceEnd = start + buf.duration;
    return true;
  }

  // ---------- Efeitos ----------
  play(name: Sfx) {
    if (!this.ctx || !settings.sfxOn || settings.sfxVolume <= 0) return;
    const b = this.sfxBus;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'click':
        this.tone(b, 1200, t, 0.02, { type: 'square', gain: 0.04, release: 0.03 });
        break;
      case 'card':
        this.noiseHit(b, t, 0.09, { gain: 0.35, freq: 3200, q: 0.8 });
        this.tone(b, 180, t, 0.05, { gain: 0.18, slideTo: 90, release: 0.05 });
        break;
      case 'deal':
        for (let i = 0; i < 5; i++) this.noiseHit(b, t + i * 0.06, 0.05, { gain: 0.22, freq: 2800 + i * 150, q: 1 });
        break;
      case 'turn':
        this.tone(b, NOTE(76), t, 0.12, { type: 'triangle', gain: 0.18 });
        this.tone(b, NOTE(81), t + 0.12, 0.2, { type: 'triangle', gain: 0.2, release: 0.3 });
        break;
      case 'bid':
        this.tone(b, NOTE(72), t, 0.06, { type: 'sine', gain: 0.2, slideTo: NOTE(79), release: 0.08 });
        break;
      case 'roundWin':
        [72, 76, 79, 84].forEach((n, i) => this.tone(b, NOTE(n), t + i * 0.07, 0.12, { type: 'triangle', gain: 0.18, release: 0.2 }));
        break;
      case 'roundOther':
        this.tone(b, NOTE(64), t, 0.08, { type: 'sine', gain: 0.1, release: 0.15 });
        this.tone(b, NOTE(67), t + 0.08, 0.1, { type: 'sine', gain: 0.08, release: 0.2 });
        break;
      case 'handHit':
        [67, 72, 76, 79].forEach((n, i) => this.tone(b, NOTE(n), t + i * 0.09, 0.16, { type: 'square', gain: 0.07, filter: 2500, release: 0.25 }));
        this.tone(b, NOTE(84), t + 0.36, 0.4, { type: 'triangle', gain: 0.18, release: 0.5 });
        break;
      case 'handMiss':
        this.tone(b, NOTE(62), t, 0.25, { type: 'sawtooth', gain: 0.08, filter: 1200, slideTo: NOTE(58) });
        this.tone(b, NOTE(55), t + 0.28, 0.45, { type: 'sawtooth', gain: 0.08, filter: 900, slideTo: NOTE(50), release: 0.3 });
        break;
      case 'gameWin':
        [60, 64, 67, 72, 67, 72, 76].forEach((n, i) =>
          this.tone(b, NOTE(n + 12), t + i * 0.13, i === 6 ? 0.8 : 0.12, { type: 'square', gain: 0.07, filter: 3000, release: 0.3 }),
        );
        [48, 55, 60].forEach((n) => this.tone(b, NOTE(n), t + 0.78, 0.9, { type: 'triangle', gain: 0.12, release: 0.6 }));
        break;
      case 'gameOver':
        [72, 67, 64, 60].forEach((n, i) => this.tone(b, NOTE(n), t + i * 0.16, 0.18, { type: 'triangle', gain: 0.15, release: 0.3 }));
        break;
      case 'tiebreak':
        for (let i = 0; i < 14; i++) this.noiseHit(b, t + i * 0.045, 0.05, { gain: 0.08 + i * 0.012, freq: 900, q: 0.7 });
        this.tone(b, 70, t + 0.65, 0.4, { gain: 0.5, slideTo: 40, release: 0.3 });
        this.noiseHit(b, t + 0.65, 0.6, { gain: 0.3, freq: 5000, q: 0.3, type: 'highpass' });
        break;
      case 'shuffle':
        // Embaralhar (riffle): estalos rápidos que aceleram, depois o "tap" do baralho na mesa
        for (let i = 0; i < 26; i++) {
          const k = i / 26;
          this.noiseHit(b, t + k * k * 0.75 + Math.random() * 0.01, 0.025, { gain: 0.12 + Math.random() * 0.08, freq: 2400 + Math.random() * 2000, q: 1.2 });
        }
        this.tone(b, 160, t + 0.85, 0.05, { gain: 0.2, slideTo: 80, release: 0.05 });
        this.noiseHit(b, t + 0.85, 0.06, { gain: 0.25, freq: 900, q: 0.8 });
        break;
      case 'join':
        this.tone(b, NOTE(79), t, 0.08, { type: 'sine', gain: 0.12 });
        this.tone(b, NOTE(84), t + 0.08, 0.1, { type: 'sine', gain: 0.12 });
        break;
    }
  }

  // ---------- Música: blues de bar procedural (Lá menor, swing, ~78 bpm) ----------
  private startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextStep = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 40);
  }

  private stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule() {
    const ctx = this.ctx!;
    const stepDur = 60 / 78 / 2; // colcheias a 78 bpm
    while (this.nextStep < ctx.currentTime + 0.25) {
      // Swing: colcheias pares adiantadas, ímpares atrasadas (sensação de blues de bar).
      const swing = this.step % 2 === 1 ? stepDur * 0.32 : 0;
      this.playStep(this.step, this.nextStep + swing, stepDur);
      this.nextStep += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  /** Piano elétrico: senoide com leve brilho e tremolo curto. */
  private keys(freq: number, t: number, dur: number, gain: number) {
    this.tone(this.musicBus, freq, t, dur, { type: 'sine', gain, attack: 0.01, release: 0.5 });
    this.tone(this.musicBus, freq * 2, t, dur * 0.4, { type: 'triangle', gain: gain * 0.18, attack: 0.005, release: 0.2, filter: 2200 });
  }

  private playStep(step: number, t: number, sd: number) {
    const b = this.musicBus;
    // Blues menor em Lá: Am7 | Dm7 | E7 | Am7  /  Dm7 | Am7 | E7 | E7
    const prog = [
      { root: 45, voicing: [57, 60, 64, 67] },
      { root: 50, voicing: [53, 57, 60, 65] },
      { root: 52, voicing: [56, 59, 62, 64] },
      { root: 45, voicing: [55, 60, 64, 67] },
      { root: 50, voicing: [57, 60, 62, 65] },
      { root: 45, voicing: [57, 60, 64, 67] },
      { root: 52, voicing: [56, 59, 62, 64] },
      { root: 52, voicing: [56, 59, 62, 65] },
    ];
    const bar = Math.floor(step / 8) % 8;
    const pos = step % 8;
    const c = prog[bar];

    // Piano: acorde no 1 e "empurrão" sincopado no "e" do 2
    if (pos === 0) c.voicing.forEach((n) => this.keys(NOTE(n), t, sd * 3, 0.03));
    if (pos === 3) c.voicing.slice(1).forEach((n) => this.keys(NOTE(n), t, sd * 1.2, 0.022));
    // Pequena frase de blues no fim de cada 2 compassos
    if (bar % 2 === 1 && pos >= 5) {
      const lick = [69, 72, 74, 76][(pos - 5 + bar) % 4];
      this.keys(NOTE(lick), t, sd * 0.8, 0.02);
    }

    // Baixo caminhante (semínimas)
    if (pos % 2 === 0) {
      const walk = [0, 3, 5, 6][pos / 2];
      const next = prog[(bar + 1) % 8].root;
      const n = pos === 6 ? next - 1 : c.root + walk;
      this.tone(b, NOTE(n - 12), t, sd * 1.6, { type: 'triangle', gain: 0.17, attack: 0.01, release: 0.12, filter: 700 });
    }

    // Bateria com vassourinha: prato de condução swingado, caixa escovada no 2 e 4, bumbo suave
    this.noiseHit(b, t, pos % 2 === 0 ? 0.18 : 0.08, { gain: pos % 2 === 0 ? 0.035 : 0.022, freq: 7000, q: 0.4, type: 'highpass' });
    if (pos === 2 || pos === 6) this.noiseHit(b, t, 0.22, { gain: 0.05, freq: 2500, q: 0.4 });
    if (pos === 0 || (pos === 5 && bar % 2 === 0)) this.tone(b, 90, t, 0.1, { gain: 0.16, slideTo: 45, release: 0.05 });

    // Chiado de vinil
    if (Math.random() < 0.35) this.noiseHit(b, t + Math.random() * sd, 0.008, { gain: 0.03 + Math.random() * 0.03, freq: 4000, q: 2 });
  }
}

export const engine = new AudioEngine();

export function sfx(name: Sfx) {
  engine.play(name);
}

// O primeiro toque/clique na página libera o áudio; depois cada clique em botão faz um "tic".
if (typeof window !== 'undefined') {
  const unlock = () => engine.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  window.addEventListener(
    'click',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest('button');
      if (el && !el.hasAttribute('data-card') && !(el as HTMLButtonElement).disabled) engine.play('click');
    },
    { capture: true },
  );
}
