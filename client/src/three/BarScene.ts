import * as THREE from 'three';
import type { Card, JokerMode } from '@nomercy/shared';

/**
 * Cena 3D do bar para partidas de 4 jogadores: você em primeira pessoa e três personagens
 * originais (criados por código) sentados à mesa. A cena só desenha — as regras e o estado
 * vêm do servidor através de setState().
 */

export interface SeatState {
  id: string;
  name: string;
  pts: number;
  bid: number | null;
  won: number;
  active: boolean;
  cardsInHand: number;
  /** Na partida às cegas: a carta do adversário, visível para você. */
  blindCard: Card | null;
  participant: boolean;
  speaking: boolean;
  offline: boolean;
  /** Jogador humano: a cabeça do boneco segue o mouse dessa pessoa (multiplayer). */
  human: boolean;
}

export type Mood = 'win' | 'lose' | null;

export interface SceneState {
  /** Adversários na ordem da mesa a partir de você: esquerda, frente, direita. */
  opponents: SeatState[];
  myWon: number;
  /** seat 0 = você; 1..3 = adversários (mesma ordem de opponents). */
  trick: { seat: number; card: Card; jokerMode: JokerMode | null }[];
  winnerSeat: number | null;
  moods: Mood[];
  tiebreak: boolean;
}

/** Sua mão desenhada em 3D (opcional). */
export interface HandState {
  enabled: boolean;
  cards: Card[];
  hiddenCount: number;
  selectedId: string | null;
  interactive: boolean;
}

export interface SceneCallbacks {
  onCardClick?: (cardId: string) => void;
  onCardHover?: (hovering: boolean) => void;
  /** Para onde um jogador humano está olhando (mouse, -1..1). */
  getLook?: (playerId: string) => { x: number; y: number } | null;
  /** O navegador perdeu o contexto 3D: o jogo deve voltar para 2D. */
  onContextLost?: () => void;
}

/** Assentos usados conforme o número de adversários (1 = frente; 2 = laterais; 3 = esquerda, frente, direita). */
const SLOTS: Record<number, number[]> = { 0: [], 1: [2], 2: [1, 3], 3: [1, 2, 3] };

// ---------- utilidades ----------
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Em telas pequenas as texturas são geradas em resolução menor (menos memória de vídeo). */
const TEX_SCALE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700 ? 0.7 : 1;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * TEX_SCALE);
  c.height = Math.round(h * TEX_SCALE);
  const g = c.getContext('2d')!;
  g.scale(TEX_SCALE, TEX_SCALE);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function woodTex(base: string, rep: [number, number]) {
  return canvasTex(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) {
        g.strokeStyle = `rgba(0,0,0,${rnd(0.05, 0.22)})`;
        g.lineWidth = rnd(1, 4);
        g.beginPath();
        const y = rnd(0, h);
        const f = rnd(40, 90);
        const a = rnd(2, 8);
        g.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / f) * a);
        g.stroke();
      }
      for (let i = 0; i < 8; i++) {
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(0, (i * h) / 8, w, 2);
      }
    },
    rep,
  );
}

const CARD_COLORS: Record<Card['color'], string> = {
  BLACK: '#1f1f28',
  BLUE: '#1f3d96',
  RED: '#cf2f40',
  GREEN: '#15985d',
  YELLOW: '#efb51c',
};

const faceCache = new Map<string, THREE.Texture>();
function cardFaceTex(card: Card, mode: JokerMode | null): THREE.Texture {
  const key = `${card.id}:${mode ?? ''}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const joker = card.value === 'JOKER';
  const label = joker ? '★' : String(card.value);
  const t = canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = CARD_COLORS[card.color];
    roundRect(g, 0, 0, w, h, 28);
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.lineWidth = 14;
    for (let i = -h; i < w + h; i += 36) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i - h, h);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.4)';
    g.lineWidth = 5;
    roundRect(g, 10, 10, w - 20, h - 20, 20);
    g.stroke();
    const ink = card.color === 'YELLOW' ? '#2a1d00' : '#ffffff';
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${joker ? 130 : 160}px Rye, Georgia, serif`;
    g.fillText(joker ? '♛' : label, w / 2, h / 2 + 6);
    g.font = '44px Rye, Georgia, serif';
    g.fillText(label, 36, 40);
    if (joker && mode) {
      g.fillStyle = mode === 'MAX' ? '#e3a948' : '#67e8f9';
      g.fillRect(0, h - 64, w, 64);
      g.fillStyle = '#140e0b';
      g.font = 'bold 40px Outfit, sans-serif';
      g.fillText(mode === 'MAX' ? '▲ MAX' : '▼ MIN', w / 2, h - 30);
    }
  });
  faceCache.set(key, t);
  return t;
}

let backTexture: THREE.Texture | null = null;
function cardBackTex(): THREE.Texture {
  if (backTexture) return backTexture;
  backTexture = canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = '#4a1712';
    roundRect(g, 0, 0, w, h, 28);
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(227,169,72,.25)';
    g.lineWidth = 3;
    for (let i = -h; i < w + h; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i - h, h);
      g.stroke();
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = '#e3a948';
    g.lineWidth = 6;
    roundRect(g, 12, 12, w - 24, h - 24, 20);
    g.stroke();
    g.fillStyle = '#e3a948';
    g.font = '64px Rye, Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('NM', w / 2, h / 2);
  });
  return backTexture;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mm of mats) mm.dispose(); // texturas são compartilhadas/cacheadas: não descartar aqui
  });
}

const mat = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });

function flatCard(tex: THREE.Texture, w: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 1.41), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, color: 0xd8d8d8 }));
  m.rotation.x = -Math.PI / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- Personagens ----------
interface Look {
  skin: number;
  coat: number;
  shirt: number;
  hair: number;
  hat: 'fedora' | 'beanie' | 'cowboy' | 'none';
  hatColor: number;
  beard?: boolean;
  mustache?: boolean;
  patch?: boolean;
  cigar?: boolean;
  tie?: number;
  width: number;
  headLong: number;
  nose: number;
  brow: number;
}

/** Três tipos de bar originais: o grandalhão, o mafioso e o veterano. */
export const LOOKS: Look[] = [
  { skin: 0xc58a62, coat: 0x3b4a2a, shirt: 0x8a7a5a, hair: 0x2a160c, hat: 'beanie', hatColor: 0x7a1f1a, beard: true, width: 1.25, headLong: 0.95, nose: 1.4, brow: 0.35 },
  { skin: 0xe2b590, coat: 0x1d1d26, shirt: 0xe8e2d4, tie: 0x8c1d1d, hair: 0x111111, hat: 'fedora', hatColor: 0x2a2a30, mustache: true, cigar: true, width: 1.05, headLong: 1.05, nose: 1.1, brow: 0.45 },
  { skin: 0xd9a37e, coat: 0x6a3a1e, shirt: 0x3d5a6b, hair: 0xb8b0a4, hat: 'cowboy', hatColor: 0x5a3d22, mustache: true, patch: true, width: 0.95, headLong: 1.12, nose: 1.25, brow: 0.2 },
];

class Character {
  group = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private arms: THREE.Group[] = [];
  private fan = new THREE.Group();
  private pile = new THREE.Group();
  private tag: THREE.Sprite;
  private tagKey = '';
  private fanKey = '';
  private blindHeld: THREE.Group | null = null;
  private pileCount = -1;
  private phase = Math.random() * 6;
  mood: Mood = null;
  moodUntil = 0;
  active = false;
  /** Ponto do mundo para onde o personagem olha. */
  lookPoint = new THREE.Vector3(0, 1.5, 2);
  suspicious = false;
  /** Se definido, a cabeça segue SOMENTE o mouse do jogador humano dono deste boneco. */
  lookSource: (() => { x: number; y: number } | null) | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private handMeshes: THREE.Mesh[] = [];
  private brows: { m: THREE.Mesh; base: number }[] = [];
  private playStart = -1;
  private tapStart = -1;
  private bubble: THREE.Sprite | null = null;
  private bubbleUntil = 0;

  constructor(private look: Look) {
    const o = look;
    const skin = mat(o.skin, { roughness: 0.6 });
    // Cadeira
    const wood = mat(0x2b170c);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.5), wood);
    seat.position.y = 0.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.06), wood);
    back.position.set(0, 0.9, -0.24);
    this.group.add(seat, back);
    for (const [x, z] of [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.2], [0.24, 0.2]]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5), mat(0x1d1008));
      l.position.set(x, 0.25, z);
      this.group.add(l);
    }

    this.body.position.y = 0.55;
    this.group.add(this.body);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.23 * o.width, 0.38, 8, 16), mat(o.coat));
    torso.position.y = 0.42;
    torso.scale.set(1, 1, 0.75);
    const vest = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * o.width, 0.3, 6, 12), mat(o.shirt));
    vest.position.set(0, 0.45, 0.12);
    vest.scale.set(1, 1, 0.4);
    this.body.add(torso, vest);
    if (o.tie) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), mat(o.tie));
      tie.position.set(0, 0.5, 0.18);
      this.body.add(tie);
    }

    // Cabeça
    const hp = this.head;
    hp.position.y = 0.85;
    this.body.add(hp);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 12), skin);
    neck.position.y = -0.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 20), skin);
    head.scale.set(1, 1.12 * o.headLong, 1);
    head.position.y = 0.12;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035 * o.nose, 10, 10), skin);
    nose.scale.set(1, 1.2, 1.3);
    nose.position.set(0, 0.1, 0.17);
    hp.add(neck, head, nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(s * 0.17, 0.12, 0);
      const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), mat(0xf3eadb, { roughness: 0.3 }));
      eyeW.position.set(s * 0.062, 0.15, 0.145);
      eyeW.scale.z = 0.5;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), mat(0x120a05, { roughness: 0.2 }));
      pupil.position.set(s * 0.062, 0.15, 0.158);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.02), mat(o.hair));
      brow.position.set(s * 0.062, 0.195, 0.155);
      brow.rotation.z = -s * o.brow;
      this.brows.push({ m: brow, base: -s * o.brow });
      hp.add(ear, eyeW, pupil, brow);
      if (o.patch && s === 1) {
        const patch = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), mat(0x0a0a0a));
        patch.position.set(s * 0.062, 0.15, 0.162);
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.006, 6, 40), mat(0x0a0a0a));
        strap.rotation.set(0, 0, 0.5);
        strap.position.y = 0.16;
        hp.add(patch, strap);
      }
    }
    if (o.beard) {
      const beard = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), mat(o.hair));
      beard.position.set(0, 0.1, 0.03);
      beard.scale.set(1.05, 1.1, 1.05);
      hp.add(beard);
    }
    if (o.mustache) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 16, Math.PI), mat(o.hair));
      m.position.set(0, 0.06, 0.17);
      m.rotation.z = Math.PI;
      hp.add(m);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.01), mat(0x3a1410));
    mouth.position.set(0, 0.045, 0.165);
    hp.add(mouth);
    if (o.cigar) {
      const cig = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13), mat(0x6b3a1e));
      cig.rotation.set(Math.PI / 2, 0, 0.4);
      cig.position.set(0.05, 0.045, 0.22);
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.014), new THREE.MeshBasicMaterial({ color: 0xff5a1a }));
      ember.position.set(0.075, 0.045, 0.28);
      hp.add(cig, ember);
    }
    if (o.hat === 'fedora') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.015, 32), mat(o.hatColor));
      brim.position.y = 0.27;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.15, 24), mat(o.hatColor));
      crown.position.y = 0.34;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.035, 24), mat(0x1a0a05));
      band.position.y = 0.29;
      hp.add(brim, crown, band);
    } else if (o.hat === 'beanie') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.185, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(o.hatColor));
      b.position.y = 0.14;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 8, 24), mat(o.hatColor));
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = 0.2;
      hp.add(b, cuff);
    } else if (o.hat === 'cowboy') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.015, 32), mat(o.hatColor));
      brim.position.y = 0.26;
      brim.scale.z = 0.85;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.17, 24), mat(o.hatColor));
      crown.position.y = 0.34;
      hp.add(brim, crown);
    }

    // Braços apoiados na mesa
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.27 * o.width, 0.62, 0);
      this.body.add(shoulder);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.065 * o.width, 0.24, 6, 10), mat(o.coat));
      upper.position.set(0, -0.14, 0.06);
      upper.rotation.x = 0.5;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.055 * o.width, 0.24, 6, 10), mat(o.coat));
      fore.position.set(-s * 0.06, -0.26, 0.26);
      fore.rotation.set(1.45, 0, s * 0.45);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), skin);
      hand.position.set(-s * 0.13, -0.27, 0.4);
      shoulder.add(upper, fore, hand);
      this.arms.push(shoulder);
      this.handMeshes.push(hand);
    }
    this.fan.position.set(0, 0.4, 0.45);
    this.body.add(this.fan);
    this.group.add(this.pile);

    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.tag.scale.set(0.8, 0.25, 1);
    this.tag.position.y = 1.92;
    this.tag.renderOrder = 10;
    this.group.add(this.tag);

    // Só as peças maiores projetam sombra (desempenho).
    this.group.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingSphere();
      const r = (mesh.geometry.boundingSphere?.radius ?? 0) * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
      mesh.castShadow = r > 0.09;
      mesh.receiveShadow = r > 0.09;
    });
  }

  headAngles() {
    return { yaw: +this.head.rotation.y.toFixed(2), pitch: +this.head.rotation.x.toFixed(2), human: !!this.lookSource };
  }

  /** Posição (no mundo) da mão que joga as cartas. */
  handWorld(target = new THREE.Vector3()) {
    return this.handMeshes[1].getWorldPosition(target);
  }

  /** Estica o braço e joga uma carta na mesa. */
  startPlay() {
    this.playStart = performance.now();
  }

  /** Bate na mesa ao dar o palpite e mostra um balão com o valor. */
  startTap(text: string) {
    this.tapStart = performance.now();
    if (!this.bubble) {
      this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      this.bubble.renderOrder = 11;
      this.bubble.scale.set(0.34, 0.26, 1);
      this.bubble.position.set(0.32, 1.62, 0.1);
      this.group.add(this.bubble);
    }
    const tex = canvasTex(256, 196, (g, w) => {
      g.fillStyle = '#fbf3e4';
      roundRect(g, 8, 8, w - 16, 140, 40);
      g.fill();
      g.beginPath();
      g.moveTo(60, 140);
      g.lineTo(44, 188);
      g.lineTo(100, 142);
      g.fill();
      g.fillStyle = '#1a1008';
      g.font = '900 96px Outfit, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, 82);
    });
    const m = this.bubble.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.map = tex;
    m.needsUpdate = true;
    this.bubble.visible = true;
    this.bubbleUntil = performance.now() + 1800;
  }

  setTag(s: SeatState) {
    const key = JSON.stringify([s.name, s.pts, s.bid, s.won, s.active, s.speaking, s.offline, s.participant]);
    if (key === this.tagKey) return;
    this.tagKey = key;
    const tex = canvasTex(512, 170, (g, w) => {
      g.fillStyle = s.active ? 'rgba(60,36,14,.92)' : 'rgba(20,12,8,.84)';
      roundRect(g, 6, 6, w - 12, 140, 36);
      g.fill();
      g.strokeStyle = s.active ? '#ffd27a' : 'rgba(227,169,72,.45)';
      g.lineWidth = s.active ? 10 : 4;
      g.stroke();
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.font = '800 46px Outfit, sans-serif';
      const name = s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name;
      g.fillText((s.speaking ? '🎙 ' : '') + (s.offline ? '⚠ ' : '') + name, w / 2, 62);
      g.font = '800 34px Outfit, sans-serif';
      g.fillStyle = '#e3a948';
      g.fillText(s.participant ? `${s.pts} pts  ·  ◎ ${s.bid ?? '–'}  ·  🏆 ${s.won}` : `${s.pts} pts · assistindo`, w / 2, 118);
      if (s.active) {
        g.fillStyle = '#ffd27a';
        g.font = '800 26px Outfit, sans-serif';
        g.fillText('NA VEZ…', w / 2, 166);
      }
    });
    const m = this.tag.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.map = tex;
    m.needsUpdate = true;
  }

  setFan(count: number, blindCard: Card | null) {
    const key = blindCard ? `blind:${blindCard.id}` : `n:${count}`;
    if (key === this.fanKey) return;
    this.fanKey = key;
    for (const c of [...this.fan.children]) {
      this.fan.remove(c);
      disposeTree(c);
    }
    this.blindHeld = null;
    if (blindCard) {
      // Partida às cegas: o adversário segura a carta virada para os outros (inclusive você).
      const holder = new THREE.Group();
      holder.position.set(0, 0.32, 0.05);
      const c = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, 0.28),
        new THREE.MeshStandardMaterial({ map: cardFaceTex(blindCard, blindCard.value === 'JOKER' ? 'MAX' : null), emissive: 0x222222, emissiveIntensity: 0.4 }),
      );
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.28), new THREE.MeshStandardMaterial({ map: cardBackTex() }));
      back.position.z = -0.002;
      back.rotation.y = Math.PI;
      holder.add(c, back);
      this.fan.add(holder);
      this.blindHeld = holder;
      return;
    }
    const n = Math.min(count, 13);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.17), new THREE.MeshStandardMaterial({ map: cardBackTex(), side: THREE.DoubleSide }));
      const k = i - (n - 1) / 2;
      c.position.set(k * Math.min(0.045, 0.4 / Math.max(n, 1)), 0.03, i * 0.002);
      c.rotation.z = -k * Math.min(0.22, 1.6 / Math.max(n, 1));
      c.rotation.x = -0.35;
      c.castShadow = true;
      this.fan.add(c);
    }
  }

  setPile(count: number, parentY: number) {
    if (count === this.pileCount) return;
    this.pileCount = count;
    for (const c of [...this.pile.children]) {
      this.pile.remove(c);
      disposeTree(c);
    }
    for (let i = 0; i < Math.min(count, 13); i++) {
      const c = flatCard(cardBackTex(), 0.13);
      c.position.set(0.34, 0.83 + i * 0.007 - parentY, 0.62);
      c.rotation.z = i * 0.17 - 0.3;
      this.pile.add(c);
    }
  }

  setTagScale(w: number) {
    this.tag.scale.set(w, w * 0.32, 1);
  }

  setMood(m: Mood, ms = 2600) {
    this.mood = m;
    this.moodUntil = performance.now() + ms;
  }

  tick(t: number, camPos: THREE.Vector3) {
    if (this.blindHeld) this.blindHeld.lookAt(camPos);
    const now = performance.now();
    if (this.mood && now > this.moodUntil) this.mood = null;
    if (this.bubble && now > this.bubbleUntil) this.bubble.visible = false;
    this.body.scale.y = 1 + Math.sin(t * 1.6 + this.phase) * 0.012;

    // Olhar: converte o ponto do mundo para o espaço do personagem.
    const local = this.group.worldToLocal(this.lookPoint.clone());
    const dx = local.x;
    const dz = local.z;
    const dy = local.y - 1.52;
    let yaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -1.0, 1.0);
    let pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.35, 0.55);
    let bodyY = 0.55;
    let bodyX = 0;
    const armX = [0, 0];
    if (this.active) {
      yaw = 0;
      pitch = 0.28; // olha para as próprias cartas, pensando
      this.fan.rotation.z = Math.sin(t * 2.2) * 0.06;
    } else this.fan.rotation.z *= 0.9;
    if (this.suspicious && !this.active) bodyX = -0.07; // inclina para frente, desconfiado

    // Jogar carta: braço vai até o centro e volta.
    if (this.playStart > 0) {
      const p = (now - this.playStart) / 650;
      if (p >= 1) this.playStart = -1;
      else armX[1] = -0.85 * Math.sin(p * Math.PI);
    }
    // Palpite: duas batidinhas na mesa.
    if (this.tapStart > 0) {
      const p = (now - this.tapStart) / 700;
      if (p >= 1) this.tapStart = -1;
      else armX[0] = -0.35 * Math.abs(Math.sin(p * Math.PI * 2));
    }
    if (this.mood === 'win') {
      armX[0] = -2.5 + Math.sin(t * 9) * 0.25;
      armX[1] = -2.5 + Math.sin(t * 9 + 1) * 0.25;
      bodyY += Math.abs(Math.sin(t * 7)) * 0.06;
      pitch = -0.2;
    } else if (this.mood === 'lose') {
      pitch = 0.5;
      bodyX = 0.18;
    }
    let idle = Math.sin(t * 0.9 + this.phase) * 0.03;
    let idleYaw = Math.sin(t * 0.5 + this.phase) * 0.04;
    if (this.lookSource) {
      // Jogador humano: a cabeça acompanha apenas o mouse dele (direita do mouse = direita do boneco).
      const l = this.lookSource();
      yaw = l ? THREE.MathUtils.clamp(-l.x * 1.0, -1.0, 1.0) : 0;
      pitch = l ? THREE.MathUtils.clamp(l.y * 0.5 + 0.08, -0.4, 0.55) : 0.1;
      idle = 0;
      idleYaw = 0;
    }
    this.lookYaw = THREE.MathUtils.lerp(this.lookYaw, yaw, this.lookSource ? 0.2 : 0.08);
    this.lookPitch = THREE.MathUtils.lerp(this.lookPitch, pitch + idle, this.lookSource ? 0.2 : 0.08);
    this.fan.visible = this.mood !== 'win';
    this.arms.forEach((a, i) => (a.rotation.x = THREE.MathUtils.lerp(a.rotation.x, armX[i], 0.22)));
    this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, bodyY, 0.3);
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, bodyX, 0.1);
    this.head.rotation.x = this.lookPitch;
    this.head.rotation.y = this.lookYaw + idleYaw;
    const browExtra = this.suspicious && !this.lookSource ? 0.3 : 0;
    for (const b of this.brows) b.m.rotation.z = THREE.MathUtils.lerp(b.m.rotation.z, b.base * (1 + browExtra * 2), 0.1);
  }
}

// ---------- Cena ----------
export class BarScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
  private chars: Character[] = [];
  private seatsRoot: THREE.Group[] = [];
  private trickCards = new Map<string, { mesh: THREE.Mesh; target: THREE.Vector3; rot: number }>();
  private myPile = new THREE.Group();
  private myPileCount = -1;
  private feltMat!: THREE.MeshStandardMaterial;
  private lamp = new THREE.Group();
  private spot!: THREE.SpotLight;
  private smokes: THREE.Sprite[] = [];
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;
  private state: SceneState | null = null;
  private portrait = false;
  private disposed = false;
  // Olhar com o mouse / dedo
  private baseLook = new THREE.Vector3(0, 1, -0.45);
  private yaw = 0;
  private pitch = 0;
  private yawT = 0;
  private pitchT = 0;
  private mouse = new THREE.Vector2(0, 0);
  private dragging: { id: number; x: number; y: number; yaw: number; pitch: number } | null = null;
  private lastTap = 0;
  private lastT = 0;
  // Sua mão em 3D
  private handGroup = new THREE.Group();
  private handCards = new Map<string, THREE.Mesh>();
  private handKey = '';
  private hand: HandState = { enabled: false, cards: [], hiddenCount: 0, selectedId: null, interactive: false };
  private hovered: string | null = null;
  private raycaster = new THREE.Raycaster();
  private lookTableUntil = 0;
  private prevBids = new Map<string, number | null>();
  // Qualidade adaptativa
  private quality = 2;
  private frames = 0;
  private fpsWindowStart = performance.now();
  private fps = 60;
  private lowStreak = 0;
  private startedAt = performance.now();

  constructor(private container: HTMLElement, private cb: SceneCallbacks = {}) {
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    // Se a placa de vídeo "perder" o 3D (driver, falta de memória), o jogo volta para a mesa 2D.
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(this.raf);
      this.cb.onContextLost?.();
    });
    container.appendChild(this.renderer.domElement);
    this.build(mobile);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    // Impede que o navegador use o arrasto para rolar/dar zoom (era o que fazia a câmera "bugar" no celular).
    this.renderer.domElement.style.touchAction = 'none';
    (window as unknown as { __nm3dCam: unknown }).__nm3dCam = () => ({ yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), dragging: !!this.dragging });
    // Para testes automatizados: rotação da cabeça de cada boneco.
    (window as unknown as { __nm3dHeads: unknown }).__nm3dHeads = () =>
      this.chars.map((c) => ({ visible: c.group.visible, ...c.headAngles() }));
    // Para testes automatizados: posição na tela das cartas da sua mão 3D.
    (window as unknown as { __nm3dCards: unknown }).__nm3dCards = () => {
      const r = this.container.getBoundingClientRect();
      return [...this.handCards.entries()].map(([id, m]) => {
        const v = m.getWorldPosition(new THREE.Vector3()).project(this.camera);
        return { id, x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      });
    };
    this.loop();
  }

  // ---------- Entrada (mouse / toque) ----------
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      const r = this.container.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      this.mouse.set(THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(-ny, -1, 1));
      // Vira a "cabeça" levemente na direção do mouse.
      this.yawT = -this.mouse.x * 0.3;
      this.pitchT = this.mouse.y * 0.1;
      this.updateHover();
      return;
    }
    // Toque: só o dedo que começou o arrasto move a câmera (um segundo dedo não faz a visão pular).
    if (!this.dragging || e.pointerId !== this.dragging.id) return;
    const r = this.container.getBoundingClientRect();
    const dx = (e.clientX - this.dragging.x) / Math.max(r.width, 1);
    const dy = (e.clientY - this.dragging.y) / Math.max(r.height, 1);
    this.yawT = THREE.MathUtils.clamp(this.dragging.yaw + dx * 1.4, -0.6, 0.6);
    this.pitchT = THREE.MathUtils.clamp(this.dragging.pitch - dy * 0.6, -0.2, 0.2);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.onPointerMove(e);
      const id = this.pickCard();
      if (id) this.cb.onCardClick?.(id);
      return;
    }
    // Toque na carta 3D (se a mão 3D estiver ligada no celular)
    const r = this.container.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    const id = this.pickCard();
    if (id) {
      this.cb.onCardClick?.(id);
      return;
    }
    if (!e.isPrimary || this.dragging) return;
    // Toque duplo: centraliza a visão
    const now = e.timeStamp || performance.now();
    if (now - this.lastTap < 350) {
      this.yawT = 0;
      this.pitchT = 0;
      this.lastTap = 0;
      return;
    }
    this.lastTap = now;
    this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: this.yawT, pitch: this.pitchT };
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* ignora */
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    // A visão fica onde você deixou (toque duplo centraliza).
    if (this.dragging && e.pointerId === this.dragging.id) this.dragging = null;
  };

  private pickCard(): string | null {
    if (!this.hand.enabled || !this.hand.interactive || this.handCards.size === 0) return null;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects([...this.handCards.values()], false);
    return hits.length ? (hits[0].object.userData.cardId as string) : null;
  }

  private updateHover() {
    const id = this.hand.enabled ? (() => {
      if (this.handCards.size === 0) return null;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObjects([...this.handCards.values()], false);
      return hits.length ? (hits[0].object.userData.cardId as string) : null;
    })() : null;
    if (id !== this.hovered) {
      this.hovered = id;
      this.renderer.domElement.style.cursor = id && this.hand.interactive ? 'pointer' : '';
      this.cb.onCardHover?.(!!id);
      this.setSuspicious(!!id);
    }
  }

  /** Personagens desconfiados quando você analisa suas cartas. */
  setSuspicious(on: boolean) {
    for (const c of this.chars) c.suspicious = on;
  }

  private onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else if (!this.disposed) this.loop();
  };

  private build(mobile: boolean) {
    const s = this.scene;
    s.background = new THREE.Color(0x0d0907);
    s.fog = new THREE.Fog(0x0d0907, 6, 15);

    const room = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 14), new THREE.MeshStandardMaterial({ map: woodTex('#3a2416', [6, 1]), side: THREE.BackSide, roughness: 0.9 }));
    room.position.y = 3;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: woodTex('#2a1a10', [5, 5]), roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(room, floor);

    // Prateleira de garrafas e letreiro
    const shelf = new THREE.Group();
    shelf.position.set(0, 1.6, -5.5);
    for (let r = 0; r < 2; r++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(5, 0.06, 0.35), mat(0x2a170d));
      board.position.y = r * 0.7;
      shelf.add(board);
      for (let i = 0; i < 14; i++) {
        const h = rnd(0.25, 0.45);
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.06, h, 10),
          new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rnd(0.05, 0.38), 0.6, rnd(0.15, 0.35)), roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }),
        );
        bottle.position.set(-2.3 + i * 0.35 + rnd(-0.05, 0.05), r * 0.7 + h / 2 + 0.03, 0);
        shelf.add(bottle);
      }
    }
    s.add(shelf);
    const neon = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.6),
      new THREE.MeshBasicMaterial({
        transparent: true,
        map: canvasTex(512, 128, (g, w, h) => {
          g.shadowColor = '#ff4a3a';
          g.shadowBlur = 24;
          g.fillStyle = '#ff6b5a';
          g.font = '84px Rye, Georgia, serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('NO MERCY', w / 2, h / 2 + 6);
        }),
      }),
    );
    neon.position.set(0, 3.2, -5.9);
    const neonLight = new THREE.PointLight(0xff4a3a, 2.5, 6);
    neonLight.position.set(0, 3, -5);
    s.add(neon, neonLight);

    // Mesa
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.08, 64), new THREE.MeshStandardMaterial({ map: woodTex('#5a3420', [2, 2]), roughness: 0.45 }));
    top.position.y = 0.78;
    top.castShadow = top.receiveShadow = true;
    this.feltMat = new THREE.MeshStandardMaterial({
      roughness: 1,
      map: canvasTex(512, 512, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 1.4);
        gr.addColorStop(0, '#2f5a4a');
        gr.addColorStop(1, '#14271f');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 9000; i++) {
          g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${rnd(0.02, 0.06)})`;
          g.fillRect(rnd(0, w), rnd(0, h), 1.5, 1.5);
        }
      }),
    });
    const felt = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.082, 64), this.feltMat);
    felt.position.y = 0.782;
    felt.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.045, 12, 80), mat(0x3b2012, { roughness: 0.35 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.8;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.76, 16), mat(0x24140b));
    leg.position.y = 0.38;
    s.add(top, felt, rim, leg, this.myPile);

    // Luzes
    s.add(new THREE.AmbientLight(0x6b4a33, 0.35), new THREE.HemisphereLight(0xffd8a0, 0x1a0e08, 0.25));
    this.lamp.position.set(0, 3.2, 0);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    wire.position.y = 0.6;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x1d2a22, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
    bulb.position.y = -0.12;
    this.spot = new THREE.SpotLight(0xffc27a, 38, 9, Math.PI / 4.2, 0.55, 1.6);
    this.spot.position.set(0, -0.1, 0);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    this.spot.shadow.bias = -0.0004;
    this.spot.target.position.set(0, -3.2, 0);
    this.lamp.add(wire, shade, bulb, this.spot, this.spot.target);
    const fill = new THREE.PointLight(0xffb070, 3, 5);
    fill.position.set(0, 1.9, 0);
    const back = new THREE.DirectionalLight(0x7a9bff, 0.35);
    back.position.set(0, 3, -6);
    s.add(this.lamp, fill, back);

    // Câmera na cena (para carregar sua mão 3D) e luz suave para as cartas da mão
    s.add(this.camera);
    this.camera.add(this.handGroup);
    const handLight = new THREE.PointLight(0xffd9a0, 1.2, 2.5);
    handLight.position.set(0, 0.2, 0.2);
    this.camera.add(handLight);

    // Personagens
    for (let i = 0; i < 3; i++) {
      const root = new THREE.Group();
      const ch = new Character(LOOKS[i]);
      root.add(ch.group);
      s.add(root);
      this.chars.push(ch);
      this.seatsRoot.push(root);
    }

    // Fumaça
    const smokeTex = canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(220,210,190,.35)');
      gr.addColorStop(1, 'rgba(220,210,190,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    for (let i = 0; i < (mobile ? 14 : 26); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: rnd(0.12, 0.3) }));
      sp.position.set(rnd(-3, 3), rnd(1.6, 3.2), rnd(-4, 1));
      const sc = rnd(1, 2.6);
      sp.scale.set(sc, sc, 1);
      s.add(sp);
      this.smokes.push(sp);
    }
  }

  /** Posição de cada assento ao redor da mesa (0 = você). */
  private seatLayout() {
    if (this.portrait) {
      return [
        { x: 0, z: 1.2, ry: Math.PI },
        { x: -1.12, z: -0.55, ry: Math.PI / 2 - 0.55 },
        { x: 0, z: -1.55, ry: 0 },
        { x: 1.12, z: -0.55, ry: -Math.PI / 2 + 0.55 },
      ];
    }
    return [
      { x: 0, z: 1.6, ry: Math.PI },
      { x: -1.55, z: -0.3, ry: Math.PI / 2 - 0.25 },
      { x: 0, z: -1.6, ry: 0 },
      { x: 1.55, z: -0.3, ry: -Math.PI / 2 + 0.25 },
    ];
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.portrait = w / h < 0.9;
    const cam = this.camera;
    cam.aspect = w / h;
    if (this.portrait) {
      cam.fov = 70;
      cam.position.set(0, 2.7, 3.0);
      this.baseLook.set(0, 0.45, -0.5);
    } else {
      cam.fov = 50;
      cam.position.set(0, 2.05, 2.85);
      this.baseLook.set(0, 1.0, -0.45);
    }
    cam.updateProjectionMatrix();
    const layout = this.seatLayout();
    this.seatsRoot.forEach((r, i) => {
      const p = layout[i + 1];
      r.position.set(p.x, 0, p.z);
      r.rotation.y = p.ry;
      this.chars[i]?.setTagScale(this.portrait ? 0.74 : 0.8);
    });
    this.applyCamera();
    this.myPileCount = -1;
    this.handKey = '';
    if (this.state) this.setState(this.state);
    this.layoutHand();
  }

  private applyCamera() {
    const cam = this.camera;
    const d = this.baseLook.clone().sub(cam.position);
    d.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
    d.applyAxisAngle(right, this.pitch);
    cam.lookAt(cam.position.clone().add(d));
  }

  /** Ponto na mesa onde cada assento coloca a carta jogada. */
  private trickSpot(seat: number) {
    const layout = this.seatLayout()[seat];
    const v = new THREE.Vector3(-layout.x, 0, -layout.z).normalize();
    const pos = new THREE.Vector3(layout.x, 0.835, layout.z).add(v.multiplyScalar(seat === 0 ? 1.15 : 1.0));
    if (seat === 0) pos.set(0, 0.835, 0.38);
    return pos;
  }

  setState(st: SceneState) {
    this.state = st;
    const layout = this.seatLayout();
    // Personagens (cada adversário ocupa um assento conforme o número de jogadores)
    const slots = SLOTS[Math.min(st.opponents.length, 3)] ?? [];
    const used = new Set(slots);
    this.chars.forEach((c, idx) => (c.group.visible = used.has(idx + 1)));
    st.opponents.slice(0, 3).forEach((o, i) => {
      const ch = this.chars[slots[i] - 1];
      if (!ch) return;
      ch.lookSource = o.human && this.cb.getLook ? () => this.cb.getLook!(o.id) : null;
      ch.setTag(o);
      ch.setFan(o.participant ? o.cardsInHand : 0, o.blindCard);
      ch.setPile(o.won, 0);
      if (ch.active !== o.active) ch.active = o.active;
      const mood = st.moods[i];
      if (mood && ch.mood !== mood) ch.setMood(mood);
      // Palpite novo: batidinha na mesa + balão com o número
      const prev = this.prevBids.get(o.id);
      if (o.bid !== null && (prev === null || prev === undefined)) ch.startTap(String(o.bid));
      this.prevBids.set(o.id, o.bid);
    });

    // Feltro vermelho no desempate
    this.feltMat.color.set(st.tiebreak ? 0xff8a7a : 0xffffff);

    // Seu monte de rodadas feitas
    if (st.myWon !== this.myPileCount) {
      this.myPileCount = st.myWon;
      for (const c of [...this.myPile.children]) {
        this.myPile.remove(c);
        disposeTree(c);
      }
      for (let i = 0; i < Math.min(st.myWon, 13); i++) {
        const c = flatCard(cardBackTex(), 0.15);
        c.position.set(this.portrait ? 0.55 : 0.7, 0.83 + i * 0.007, this.portrait ? 0.6 : 0.75);
        c.rotation.z = i * 0.17 + 0.2;
        this.myPile.add(c);
      }
    }

    // Cartas da rodada
    const keep = new Set<string>();
    st.trick.forEach((p, order) => {
      keep.add(p.card.id);
      let entry = this.trickCards.get(p.card.id);
      const slot = p.seat === 0 ? 0 : slots[p.seat - 1] ?? p.seat;
      const target = this.trickSpot(slot);
      target.y += order * 0.002;
      if (!entry) {
        const mesh = flatCard(cardFaceTex(p.card, p.jokerMode), 0.24);
        let start: THREE.Vector3;
        if (p.seat === 0) {
          const fromHand = this.handCards.get(p.card.id);
          start = fromHand ? fromHand.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.6, 2.4);
          this.lookTableUntil = performance.now() + 1500; // todos olham a carta que você jogou
        } else {
          const ch = this.chars[slot - 1];
          ch?.startPlay();
          start = ch ? ch.handWorld() : new THREE.Vector3(layout[slot].x, 1.3, layout[slot].z);
          start.y += 0.05;
        }
        mesh.position.copy(start);
        this.scene.add(mesh);
        entry = { mesh, target, rot: rnd(-0.25, 0.25) };
        this.trickCards.set(p.card.id, entry);
      }
      entry.target.copy(target);
      const winner = st.winnerSeat === p.seat;
      const m = entry.mesh.material as THREE.MeshStandardMaterial;
      m.emissive.set(winner ? 0x7a5410 : 0x000000);
      m.color.set(st.winnerSeat !== null && !winner ? 0x8a8a8a : 0xd8d8d8);
      if (winner) entry.target.y += 0.06;
    });
    for (const [id, e] of this.trickCards) {
      if (!keep.has(id)) {
        this.scene.remove(e.mesh);
        disposeTree(e.mesh);
        this.trickCards.delete(id);
      }
    }
  }

  /** Atualiza sua mão 3D (cartas seguradas na parte de baixo da visão). */
  setHand(h: HandState) {
    this.hand = h;
    const key = JSON.stringify([h.enabled, h.cards.map((c) => c.id), h.hiddenCount]);
    if (key !== this.handKey) {
      this.handKey = key;
      for (const m of this.handCards.values()) disposeTree(m);
      for (const c of [...this.handGroup.children]) {
        this.handGroup.remove(c);
        disposeTree(c);
      }
      this.handCards.clear();
      if (h.enabled) {
        const list: (Card | null)[] = h.cards.length ? h.cards : Array.from({ length: h.hiddenCount }, () => null);
        list.forEach((card) => {
          const tex = card ? cardFaceTex(card, null) : cardBackTex();
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.1, 0.141),
            new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6 }),
          );
          mesh.userData.cardId = card?.id ?? null;
          if (card) this.handCards.set(card.id, mesh);
          this.handGroup.add(mesh);
        });
        // Mãos (luvas de couro) segurando o leque
        const skin = mat(0xd6a07a, { roughness: 0.6 });
        const sleeve = mat(0x2a1a12);
        for (const sgn of [-1, 1]) {
          const g = new THREE.Group();
          const palm = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), skin);
          palm.scale.set(1, 1.15, 0.7);
          const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.03, 4, 8), skin);
          thumb.position.set(-sgn * 0.022, 0.025, 0.012);
          thumb.rotation.z = sgn * 0.6;
          const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.09, 12), sleeve);
          cuff.position.set(sgn * 0.02, -0.06, -0.01);
          cuff.rotation.z = sgn * 0.35;
          g.add(palm, thumb, cuff);
          g.userData.hand = sgn;
          this.handGroup.add(g);
        }
      }
    }
    this.layoutHand();
  }

  private layoutHand() {
    if (!this.hand.enabled) return;
    const cam = this.camera;
    const dist = 0.62;
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist;
    const halfW = halfH * cam.aspect;
    const cards = this.handGroup.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    const n = cards.length;
    const cardW = Math.min(0.085, (halfW * 1.5) / Math.max(n * 0.62, 1.6));
    const spacing = n > 1 ? Math.min(cardW * 0.78, (halfW * 1.4 - cardW) / (n - 1)) : 0;
    const baseY = -halfH + cardW * 1.41 * 0.62;
    cards.forEach((m, i) => {
      const k = i - (n - 1) / 2;
      const id = m.userData.cardId as string | null;
      const sel = id && id === this.hand.selectedId;
      const hov = id && id === this.hovered && this.hand.interactive;
      m.scale.setScalar(cardW / 0.1);
      m.userData.target = ((m.userData.target as THREE.Vector3 | undefined) ?? new THREE.Vector3()).set(k * spacing, baseY - Math.abs(k) * cardW * 0.06 + (sel ? cardW * 0.45 : hov ? cardW * 0.18 : 0), -dist + i * 0.001);
      m.rotation.set(-0.12, 0, -k * 0.07);
    });
    const span = n > 1 ? ((n - 1) / 2) * spacing + cardW * 0.4 : cardW * 0.5;
    for (const g of this.handGroup.children) {
      const sgn = g.userData.hand as number | undefined;
      if (!sgn) continue;
      g.position.set(sgn * span, baseY - cardW * 0.55, -dist + 0.03);
      g.scale.setScalar(cardW / 0.1);
    }
  }

  /** Atualiza para onde cada personagem olha. */
  private updateLooks() {
    const now = performance.now();
    const st = this.state;
    const layout = this.seatLayout();
    const activeOpp = st ? st.opponents.findIndex((o) => o.active) : -1;
    const slots = st ? SLOTS[Math.min(st.opponents.length, 3)] ?? [] : [];
    const activeSlot = activeOpp >= 0 ? slots[activeOpp] : -1;
    // "Você": um ponto perto da câmera que acompanha o mouse
    const you = this.camera.position.clone().add(new THREE.Vector3(this.mouse.x * 0.5, -0.35 + this.mouse.y * 0.25, -0.2));
    const hand = this.camera.position.clone().add(new THREE.Vector3(0, -0.6, -0.6));
    const table = new THREE.Vector3(0, 0.85, 0.2);
    this.chars.forEach((ch, i) => {
      if (now < this.lookTableUntil) ch.lookPoint.copy(table);
      else if (this.hovered) ch.lookPoint.copy(hand);
      else if (activeSlot > 0 && activeSlot !== i + 1) {
        const p = layout[activeSlot];
        ch.lookPoint.set(p.x, 1.5, p.z);
      } else ch.lookPoint.copy(you);
    });
  }

  /** Reduz a qualidade automaticamente se o aparelho não acompanhar (evita travamentos). */
  private adaptQuality(now: number) {
    this.frames++;
    // Ignora os primeiros segundos (compilação dos shaders e carregamento deixam tudo lento no começo).
    if (now - this.startedAt < 8000) {
      this.frames = 0;
      this.fpsWindowStart = now;
      return;
    }
    const elapsed = now - this.fpsWindowStart;
    if (elapsed < 2000) return;
    this.fps = (this.frames * 1000) / elapsed;
    this.frames = 0;
    this.fpsWindowStart = now;
    this.lowStreak = this.fps < 40 ? this.lowStreak + 1 : 0;
    if (this.lowStreak >= 3 && this.quality > 0) {
      this.lowStreak = 0;
      this.quality--;
      if (this.quality === 1) {
        this.renderer.setPixelRatio(1);
        this.smokes.forEach((sp, i) => (sp.visible = i % 2 === 0));
        this.resize();
      } else if (this.quality === 0) {
        this.renderer.shadowMap.enabled = false;
        this.spot.castShadow = false;
        this.scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m) m.needsUpdate = true;
        });
        this.smokes.forEach((sp) => (sp.visible = false));
      }
    }
    (window as unknown as { __nm3d: unknown }).__nm3d = {
      fps: Math.round(this.fps),
      logicMs: +this.cpuMs.toFixed(2),
      renderMs: +this.renderMs.toFixed(2),
      quality: this.quality,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }

  private cpuMs = 0;
  private renderMs = 0;
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const t0 = performance.now();
    const t = this.clock.getElapsedTime();
    this.lamp.rotation.z = Math.sin(t * 0.6) * 0.03;
    this.lamp.rotation.x = Math.cos(t * 0.5) * 0.02;
    // Suavização independente da taxa de quadros (fica igual em celular lento ou rápido).
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const k = 1 - Math.exp(-dt * (this.dragging ? 18 : 6));
    this.yaw += (this.yawT - this.yaw) * k;
    this.pitch += (this.pitchT - this.pitch) * k;
    this.applyCamera();
    this.updateLooks();
    for (const c of this.chars) c.tick(t, this.camera.position);
    if (this.hand.enabled) {
      this.layoutHand();
      for (const m of this.handGroup.children) {
        const tgt = m.userData.target as THREE.Vector3 | undefined;
        if (tgt) m.position.lerp(tgt, 0.25);
      }
    }
    for (const e of this.trickCards.values()) {
      e.mesh.position.lerp(e.target, 0.16);
      e.mesh.rotation.z = THREE.MathUtils.lerp(e.mesh.rotation.z, e.rot, 0.12);
    }
    this.smokes.forEach((sp, i) => {
      sp.position.y += 0.0015;
      sp.position.x += Math.sin(t * 0.3 + i) * 0.0008;
      if (sp.position.y > 3.6) sp.position.y = 1.4;
    });
    const t1 = performance.now();
    this.renderer.render(this.scene, this.camera);
    const t2 = performance.now();
    // Médias móveis: tempo da lógica/animação e do envio para a placa de vídeo
    this.cpuMs = this.cpuMs * 0.95 + (t1 - t0) * 0.05;
    this.renderMs = this.renderMs * 0.95 + (t2 - t1) * 0.05;
    this.adaptQuality(t2);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) {
        (x as THREE.MeshStandardMaterial).map?.dispose();
        x.dispose();
      }
    });
    faceCache.clear();
    backTexture = null;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
