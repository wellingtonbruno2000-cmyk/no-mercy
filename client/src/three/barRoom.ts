import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Ambiente do bar ao redor da mesa (original): balcão com banquetas, prateleiras de garrafas com
 * espelho, janelas com a cidade à noite, jukebox, mesinhas, quadros, arandelas e letreiros neon.
 * Peças estáticas são fundidas por material (poucas chamadas de desenho = leve no celular).
 */

const TEX_SCALE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700 ? 0.6 : 1;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
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

function planksTex(base: string, rep: [number, number], rows = 8) {
  return tex(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let r = 0; r < rows; r++) {
        const y0 = (r * h) / rows;
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,220,170'},${rnd(0.02, 0.09)})`;
        g.fillRect(0, y0, w, h / rows);
        for (let i = 0; i < 18; i++) {
          g.strokeStyle = `rgba(0,0,0,${rnd(0.05, 0.16)})`;
          g.lineWidth = rnd(0.8, 2.5);
          g.beginPath();
          const y = y0 + rnd(2, h / rows - 2);
          g.moveTo(0, y);
          for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / rnd(40, 90)) * rnd(0.5, 2));
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(0, y0, w, 2);
        const cut = rnd(0, w);
        g.fillRect(cut, y0, 2, h / rows);
      }
    },
    rep,
  );
}

function brickTex(rep: [number, number]) {
  return tex(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#3a2219';
      g.fillRect(0, 0, w, h);
      const bh = 32;
      const bw = 96;
      for (let r = 0; r < h / bh; r++) {
        const off = r % 2 ? bw / 2 : 0;
        for (let c = -1; c < w / bw + 1; c++) {
          const l = rnd(26, 40);
          g.fillStyle = `hsl(${rnd(10, 22)},${rnd(38, 55)}%,${l}%)`;
          g.fillRect(c * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
          g.fillStyle = `rgba(0,0,0,${rnd(0, 0.18)})`;
          g.fillRect(c * bw + off + 3, r * bh + bh / 2, bw - 6, bh / 2 - 3);
        }
      }
    },
    rep,
  );
}

function glowTex(color: string) {
  return tex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

function neonText(text: string, color: string, glow: string, w = 512, h = 128, font = '84px Rye, Georgia, serif') {
  return tex(w, h, (g) => {
    g.shadowColor = glow;
    g.shadowBlur = 26;
    g.fillStyle = color;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 6);
    g.shadowBlur = 8;
    g.fillStyle = '#fff6ea';
    g.globalAlpha = 0.55;
    g.fillText(text, w / 2, h / 2 + 6);
  });
}

function nightTex() {
  return tex(256, 320, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0b1230');
    gr.addColorStop(0.6, '#2a1f4a');
    gr.addColorStop(1, '#4a2a3a');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4ecd0';
    g.beginPath();
    g.arc(w * 0.72, h * 0.18, 16, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd(0.3, 0.9)})`;
      g.fillRect(rnd(0, w), rnd(0, h * 0.45), 1.5, 1.5);
    }
    let x = -10;
    while (x < w) {
      const bw = rnd(28, 60);
      const bh = rnd(h * 0.3, h * 0.7);
      g.fillStyle = `hsl(250,25%,${rnd(7, 13)}%)`;
      g.fillRect(x, h - bh, bw, bh);
      for (let yy = h - bh + 8; yy < h - 6; yy += 12)
        for (let xx = x + 5; xx < x + bw - 6; xx += 10)
          if (Math.random() < 0.35) {
            g.fillStyle = Math.random() < 0.8 ? '#ffd27a' : '#9fd8ff';
            g.fillRect(xx, yy, 5, 6);
          }
      x += bw + rnd(2, 8);
    }
  });
}

function posterTex(title: string, sub: string, bg: string, ink: string, icon: 'gun' | 'cards' | 'skull') {
  return tex(256, 360, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = ink;
    g.lineWidth = 6;
    g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.font = 'bold 34px Rye, Georgia, serif';
    title.split('\n').forEach((l, i) => g.fillText(l, w / 2, 62 + i * 38));
    g.font = '18px Georgia, serif';
    g.fillText(sub, w / 2, h - 34);
    g.save();
    g.translate(w / 2, h / 2 + 30);
    if (icon === 'gun') {
      g.fillRect(-70, -14, 110, 20);
      g.beginPath();
      g.arc(-10, -4, 26, 0, Math.PI * 2);
      g.fill();
      g.rotate(0.35);
      g.fillRect(14, 4, 26, 60);
    } else if (icon === 'cards') {
      for (let i = -1; i <= 1; i++) {
        g.save();
        g.rotate(i * 0.3);
        g.fillStyle = i === 0 ? '#f6efe0' : ink;
        g.fillRect(-28, -60, 56, 84);
        g.restore();
      }
    } else {
      g.beginPath();
      g.arc(0, -10, 44, 0, Math.PI * 2);
      g.fill();
      g.fillRect(-26, 20, 52, 30);
      g.fillStyle = bg;
      g.beginPath();
      g.arc(-17, -12, 11, 0, Math.PI * 2);
      g.arc(17, -12, 11, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });
}

function jukeboxTex() {
  return tex(256, 400, (g, w, h) => {
    g.fillStyle = '#1a0d08';
    g.fillRect(0, 0, w, h);
    const cols = ['#ff3b5c', '#ffb030', '#ffe45c', '#3be08a', '#38c6ff', '#b45cff'];
    cols.forEach((c, i) => {
      g.strokeStyle = c;
      g.lineWidth = 10;
      g.shadowColor = c;
      g.shadowBlur = 16;
      g.beginPath();
      g.arc(w / 2, 150, 110 - i * 14, Math.PI, 0);
      g.lineTo(w / 2 + 110 - i * 14, h - 20);
      g.moveTo(w / 2 - 110 + i * 14, 150);
      g.lineTo(w / 2 - 110 + i * 14, h - 20);
      g.stroke();
    });
    g.shadowBlur = 0;
    g.fillStyle = '#2b1810';
    g.fillRect(70, 190, 116, 70);
    g.fillStyle = '#ffd27a';
    for (let i = 0; i < 4; i++) g.fillRect(80, 200 + i * 15, 96, 7);
    g.fillStyle = '#0a0503';
    for (let i = 0; i < 7; i++) g.fillRect(80, 290 + i * 12, 96, 4);
  });
}

function dartTex() {
  return tex(256, 256, (g, w) => {
    const c = w / 2;
    for (let r = 6; r > 0; r--) {
      g.fillStyle = r % 2 ? '#1a1a1a' : '#e8dcc0';
      g.beginPath();
      g.arc(c, c, r * 20, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 20; i++) {
      g.fillStyle = i % 2 ? '#c8202a' : '#1f8a3a';
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, 120, (i * Math.PI) / 10, ((i + 1) * Math.PI) / 10);
      g.arc(c, c, 104, ((i + 1) * Math.PI) / 10, (i * Math.PI) / 10, true);
      g.fill();
    }
    g.fillStyle = '#c8202a';
    g.beginPath();
    g.arc(c, c, 8, 0, Math.PI * 2);
    g.fill();
  });
}

function rugTex() {
  return tex(512, 512, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#331010';
    g.beginPath();
    g.arc(c, c, c, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c99a4a';
    for (const [r, lw] of [[c - 14, 8], [c - 40, 3], [c - 120, 4]] as const) {
      g.lineWidth = lw;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(201,154,74,.28)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath();
      g.arc(c + Math.cos(a) * (c - 80), c + Math.sin(a) * (c - 80), 5, 0, Math.PI * 2);
      g.fill();
    }
    void h;
  });
}

/** Junta geometrias estáticas por material. */
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  add(geo: THREE.BufferGeometry, mat: THREE.Material, base: THREE.Matrix4 | null, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.one);
    if (base) this.m.premultiply(base);
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(this.m);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count * 2) | 0), 2));
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
  }

  /**
   * Junta tudo e "assa" as luzes decorativas nos vértices: o brilho das luminárias, arandelas, velas
   * e neons fica gravado na geometria (mesma fórmula da luz real do three.js), sem custo por quadro.
   */
  flush(parent: THREE.Object3D, baked: BakedLight[], shadowed: Set<THREE.Material>) {
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        merged.setAttribute('bake', bakeLights(merged, baked));
        useBake(mat as THREE.MeshStandardMaterial);
      }
      const mesh = new THREE.Mesh(merged, mat);
      // só o que fica sob a luz da mesa recebe sombra (paredes/teto não precisam calcular)
      mesh.receiveShadow = shadowed.has(mat);
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    this.parts.clear();
  }
}

export interface BakedLight {
  p: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  dist: number;
}

const bl = (color: number, intensity: number, dist: number, x: number, y: number, z: number): BakedLight => ({
  p: new THREE.Vector3(x, y, z),
  color: new THREE.Color(color),
  intensity,
  dist,
});

/** Luz difusa de cada luz pontual em cada vértice (igual ao three.js: queda com distância e decaimento 1.4). */
function bakeLights(g: THREE.BufferGeometry, lights: BakedLight[]) {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const out = new Float32Array(pos.count * 3);
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const L = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    P.fromBufferAttribute(pos, i);
    N.fromBufferAttribute(nor, i);
    let r = 0;
    let gg = 0;
    let bb = 0;
    for (const l of lights) {
      L.subVectors(l.p, P);
      const d = L.length();
      if (d >= l.dist) continue;
      const ndl = Math.max(0, N.dot(L) / (d || 1));
      if (ndl <= 0) continue;
      const f = Math.max(0, 1 - (d / l.dist) ** 4);
      const att = (f * f) / Math.max(d ** 1.4, 0.01);
      const k = (l.intensity * ndl * att) / Math.PI;
      r += l.color.r * k;
      gg += l.color.g * k;
      bb += l.color.b * k;
    }
    out[i * 3] = r;
    out[i * 3 + 1] = gg;
    out[i * 3 + 2] = bb;
  }
  return new THREE.BufferAttribute(out, 3);
}

/** Soma a luz assada no shader padrão (como se fosse luz real, mas pré-calculada). */
function useBake(m: THREE.MeshStandardMaterial) {
  if (m.userData.baked) return;
  m.userData.baked = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bake;\nvarying vec3 vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bake;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBake;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vBake * diffuseColor.rgb;');
  };
  m.customProgramCacheKey = () => 'nm-bake';
}

const at = (x: number, y: number, z: number, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));

export interface BarRoom {
  /** Luzes que piscam suavemente (vela/neon) — atualizadas por `tick`. */
  tick(t: number): void;
}

export function buildBarRoom(scene: THREE.Scene, mobile: boolean): BarRoom {
  const W = 18; // largura (x)
  const D = 15; // profundidade (z)
  const H = 4.2;
  const back = -D / 2;
  const front = D / 2;
  const b = new Batch();
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.75, ...o });

  // ---- materiais
  const mFloor = std({ map: planksTex('#6b4428', [7, 7]), roughness: 0.6 });
  const mBrick = std({ map: brickTex([6, 1.6]), roughness: 0.95 });
  const mBrickSide = std({ map: brickTex([5, 1.6]), roughness: 0.95 });
  const mPanel = std({ map: planksTex('#4f2e19', [8, 1], 4), roughness: 0.6 });
  const mTrim = std({ color: 0x2c170c, roughness: 0.5 });
  const mCeil = std({ map: planksTex('#2e1c10', [6, 6]), roughness: 0.9 });
  const mBeam = std({ color: 0x24140a, roughness: 0.8 });
  const mBar = std({ map: planksTex('#5a3018', [6, 1], 3), roughness: 0.45 });
  const mBarTop = std({ color: 0x3b1e0e, roughness: 0.2, metalness: 0.1 });
  const mBrass = std({ color: 0xc9a050, metalness: 0.9, roughness: 0.3 });
  const mLeather = std({ color: 0x7a1d1d, roughness: 0.5 });
  const mDark = std({ color: 0x1a0f08, roughness: 0.7 });
  const mWood = std({ color: 0x4a2814, roughness: 0.6 });
  const mMirror = std({ color: 0x5a6070, metalness: 1, roughness: 0.12 });
  const mFrame = std({ color: 0x2a160b, roughness: 0.5 });
  const mGlowAmber = new THREE.MeshBasicMaterial({ color: 0xffc77a });
  const mCandle = std({ color: 0xf2e6c8 });
  const mSconce = std({ color: 0xf0d8a8, emissive: 0xffb060, emissiveIntensity: 1.2, side: THREE.DoubleSide });
  const mShade = std({ color: 0x1f3b2c, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide });

  scene.background = new THREE.Color(0x1a110b);
  scene.fog = new THREE.Fog(0x1a110b, 9, 26);

  // ---- piso, teto, paredes
  b.add(new THREE.PlaneGeometry(W, D, 54, 45), mFloor, null, 0, 0, 0, -Math.PI / 2);
  b.add(new THREE.PlaneGeometry(W, D, 27, 22), mCeil, null, 0, H, 0, Math.PI / 2);
  for (let z = back + 1.5; z < front; z += 2.6) b.add(new THREE.BoxGeometry(W, 0.22, 0.25), mBeam, null, 0, H - 0.11, z);
  const walls: [number, number, number, number, number][] = [
    // x, z, ry, largura, (0 fundo/frente, 1 lateral)
    [0, back, 0, W, 0],
    [0, front, Math.PI, W, 0],
    [-W / 2, 0, Math.PI / 2, D, 1],
    [W / 2, 0, -Math.PI / 2, D, 1],
  ];
  for (const [x, z, ry, len, side] of walls) {
    const base = at(x, 0, z, ry);
    b.add(new THREE.PlaneGeometry(len, H, Math.round(len * 3), 14), side ? mBrickSide : mBrick, base, 0, H / 2, 0);
    b.add(new THREE.BoxGeometry(len, 1.2, 0.06, Math.round(len * 3), 4, 1), mPanel, base, 0, 0.6, 0.03);
    b.add(new THREE.BoxGeometry(len, 0.07, 0.1), mTrim, base, 0, 1.22, 0.05);
    b.add(new THREE.BoxGeometry(len, 0.14, 0.08), mTrim, base, 0, 0.07, 0.06);
    b.add(new THREE.BoxGeometry(len, 0.16, 0.12), mTrim, base, 0, H - 0.08, 0.06);
  }

  // ---- tapete sob a mesa
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.35, 48), std({ map: rugTex(), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.006;
  rug.receiveShadow = true;
  scene.add(rug);

  // ---- balcão do bar (fundo)
  const barZ = back + 2.1;
  const barLen = 8.4;
  b.add(new THREE.BoxGeometry(barLen, 1.04, 0.7, 24, 4, 1), mBar, null, 0, 0.52, barZ);
  b.add(new THREE.BoxGeometry(barLen + 0.3, 0.07, 0.95), mBarTop, null, 0, 1.075, barZ + 0.05);
  b.add(new THREE.BoxGeometry(barLen, 0.1, 0.06), mTrim, null, 0, 0.95, barZ + 0.37);
  for (let x = -barLen / 2 + 0.7; x < barLen / 2; x += 1.4) b.add(new THREE.BoxGeometry(1.1, 0.6, 0.02), mTrim, null, x, 0.5, barZ + 0.36);
  b.add(new THREE.CylinderGeometry(0.025, 0.025, barLen, 10), mBrass, null, 0, 0.22, barZ + 0.5, 0, 0, Math.PI / 2);
  for (let x = -barLen / 2 + 0.3; x <= barLen / 2; x += 1.3) b.add(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), mBrass, null, x, 0.12, barZ + 0.47);
  // banquetas
  for (let i = 0; i < 6; i++) {
    const x = -3.25 + i * 1.3;
    const base = at(x, 0, barZ + 0.85, rnd(-0.4, 0.4));
    b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 20), mLeather, base, 0, 0.78, 0);
    b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 10), mBrass, base, 0, 0.38, 0);
    b.add(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), mDark, base, 0, 0.015, 0);
    b.add(new THREE.TorusGeometry(0.15, 0.012, 6, 20), mBrass, base, 0, 0.3, 0, Math.PI / 2);
  }
  // copos e uma garrafa no balcão
  const mGlass = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 });
  for (let i = 0; i < 5; i++) b.add(new THREE.CylinderGeometry(0.04, 0.032, 0.11, 12), mGlass, null, -3 + i * 1.45 + rnd(-0.2, 0.2), 1.165, barZ + rnd(-0.1, 0.2));

  // ---- fundo do bar: armário, espelho, prateleiras com garrafas
  const wallZ = back + 0.02;
  b.add(new THREE.BoxGeometry(8.6, 0.95, 0.55), mBar, null, 0, 0.475, wallZ + 0.28);
  b.add(new THREE.BoxGeometry(8.8, 0.05, 0.6), mBarTop, null, 0, 0.97, wallZ + 0.3);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.7), mMirror);
  mirror.position.set(0, 2.05, wallZ + 0.01);
  scene.add(mirror);
  b.add(new THREE.BoxGeometry(7.9, 0.1, 0.06), mFrame, null, 0, 2.95, wallZ + 0.03);
  b.add(new THREE.BoxGeometry(7.9, 0.1, 0.06), mFrame, null, 0, 1.15, wallZ + 0.03);
  for (const x of [-3.95, 3.95]) b.add(new THREE.BoxGeometry(0.1, 1.9, 0.06), mFrame, null, x, 2.05, wallZ + 0.03);
  const shelfY = [1.42, 1.98, 2.54];
  for (const y of shelfY) {
    b.add(new THREE.BoxGeometry(7.6, 0.045, 0.32), mWood, null, 0, y, wallZ + 0.18);
    b.add(new THREE.BoxGeometry(7.4, 0.02, 0.02), mGlowAmber, null, 0, y - 0.03, wallZ + 0.32);
  }
  // garrafas (instanciadas: um único desenho para todas)
  const prof: THREE.Vector2[] = [
    [0, 0],
    [0.05, 0],
    [0.055, 0.02],
    [0.055, 0.2],
    [0.045, 0.24],
    [0.02, 0.28],
    [0.017, 0.36],
    [0.02, 0.37],
    [0, 0.37],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const perShelf = mobile ? 16 : 22;
  const bottles = new THREE.InstancedMesh(
    new THREE.LatheGeometry(prof, 10),
    new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.88 }),
    shelfY.length * perShelf + 6,
  );
  {
    const mm = new THREE.Matrix4();
    const col = new THREE.Color();
    let n = 0;
    const put = (x: number, y: number, z: number, s: number) => {
      mm.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, rnd(0.8, 1.25) * s, s));
      bottles.setMatrixAt(n, mm);
      const hue = [rnd(0.02, 0.1), rnd(0.25, 0.4), rnd(0.55, 0.62), rnd(0.08, 0.12)][Math.floor(rnd(0, 4))];
      bottles.setColorAt(n, col.setHSL(hue, rnd(0.5, 0.85), rnd(0.25, 0.5)));
      n++;
    };
    for (const y of shelfY) for (let i = 0; i < perShelf; i++) put(-3.6 + (i * 7.2) / (perShelf - 1) + rnd(-0.04, 0.04), y + 0.022, wallZ + 0.18, rnd(0.85, 1.15));
    for (let i = 0; i < 6; i++) put(-3.6 + i * 1.4 + rnd(-0.2, 0.2), 0.995, wallZ + 0.3, 1);
    bottles.count = n;
  }
  scene.add(bottles);

  // letreiros neon (originais)
  const neonPlane = (map: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  };
  neonPlane(neonText('NO MERCY', '#ff6b5a', '#ff4a3a'), 3.2, 0.8, 0, 3.5, wallZ + 0.04);
  neonPlane(neonText('BEBIDAS', '#7af0ff', '#2ad8ff', 512, 128, 'bold 76px Georgia, serif'), 2.2, 0.55, -W / 2 + 0.04, 3.15, -0.6, Math.PI / 2);
  neonPlane(neonText('BLEFE & BALA', '#ff8af0', '#ff3ad8', 512, 128, 'bold 64px Georgia, serif'), 2.6, 0.65, W / 2 - 0.04, 3.15, 0.8, -Math.PI / 2);

  // pendentes sobre o balcão
  const lamps: THREE.Vector3[] = [];
  for (const x of [-2.8, 0, 2.8]) {
    b.add(new THREE.CylinderGeometry(0.006, 0.006, 0.9, 6), mDark, null, x, H - 0.45, barZ);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.22, 24, 1, true), mShade);
    shade.position.set(x, H - 1.0, barZ);
    scene.add(shade);
    b.add(new THREE.SphereGeometry(0.06, 12, 10), mGlowAmber, null, x, H - 1.08, barZ);
    lamps.push(new THREE.Vector3(x, H - 1.15, barZ));
  }

  // ---- parede esquerda: janelas com a cidade à noite e mesinhas
  const night = new THREE.MeshBasicMaterial({ map: nightTex() });
  for (const z of [-3.2, 2.6]) {
    const base = at(-W / 2 + 0.02, 0, z, Math.PI / 2);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.8), night);
    pane.applyMatrix4(new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(0, 2.25, 0.01)));
    scene.add(pane);
    b.add(new THREE.BoxGeometry(1.7, 0.1, 0.12), mFrame, base, 0, 3.2, 0.05);
    b.add(new THREE.BoxGeometry(1.8, 0.1, 0.2), mFrame, base, 0, 1.3, 0.08);
    for (const x of [-0.8, 0.8]) b.add(new THREE.BoxGeometry(0.1, 2.0, 0.12), mFrame, base, x, 2.25, 0.05);
    b.add(new THREE.BoxGeometry(0.04, 1.8, 0.06), mFrame, base, 0, 2.25, 0.04);
    b.add(new THREE.BoxGeometry(1.5, 0.04, 0.06), mFrame, base, 0, 2.25, 0.04);
  }
  // mesinhas com cadeiras e vela
  const candles: THREE.Vector3[] = [];
  const smallTable = (x: number, z: number) => {
    const base = at(x, 0, z, rnd(0, Math.PI));
    b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 28), mBar, base, 0, 0.74, 0);
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 10), mDark, base, 0, 0.37, 0);
    b.add(new THREE.CylinderGeometry(0.3, 0.32, 0.03, 20), mDark, base, 0, 0.015, 0);
    b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), mCandle, base, 0, 0.82, 0);
    for (const a of [0, Math.PI]) {
      const cb = new THREE.Matrix4().multiplyMatrices(base, at(Math.sin(a) * 0.75, 0, Math.cos(a) * 0.75, a + Math.PI));
      b.add(new THREE.BoxGeometry(0.44, 0.05, 0.42), mWood, cb, 0, 0.46, 0);
      b.add(new THREE.BoxGeometry(0.44, 0.55, 0.05), mWood, cb, 0, 0.75, -0.2);
      for (const [lx, lz] of [[-0.19, -0.17], [0.19, -0.17], [-0.19, 0.17], [0.19, 0.17]]) b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), mDark, cb, lx, 0.225, lz);
    }
    candles.push(new THREE.Vector3(x, 0.9, z));
  };
  smallTable(-6.8, -3.2);
  smallTable(-6.8, 2.6);
  smallTable(6.6, 3.4);
  smallTable(5.2, -5.6);

  // ---- parede direita: jukebox, alvo de dardos, quadros
  {
    const base = at(W / 2 - 0.45, 0, -2.4, -Math.PI / 2);
    b.add(new THREE.BoxGeometry(1.1, 1.3, 0.6), mWood, base, 0, 0.65, 0);
    b.add(new THREE.CylinderGeometry(0.55, 0.55, 0.6, 24, 1, false, -Math.PI / 2, Math.PI), mWood, base, 0, 1.3, 0, Math.PI / 2, 0, 0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.55), new THREE.MeshBasicMaterial({ map: jukeboxTex(), transparent: true }));
    face.applyMatrix4(new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(0, 1.05, 0.31)));
    scene.add(face);
  }
  {
    const dart = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), new THREE.MeshStandardMaterial({ map: dartTex(), roughness: 0.9 }));
    dart.position.set(W / 2 - 0.03, 1.75, 1.2);
    dart.rotation.y = -Math.PI / 2;
    scene.add(dart);
    b.add(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 32), mDark, null, W / 2 - 0.02, 1.75, 1.2, 0, 0, Math.PI / 2);
  }
  const poster = (map: THREE.Texture, x: number, y: number, z: number, ry: number) => {
    const base = at(x, 0, z, ry);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.05), new THREE.MeshStandardMaterial({ map, roughness: 0.8 }));
    p.applyMatrix4(new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(0, y, 0.035)));
    scene.add(p);
    b.add(new THREE.BoxGeometry(0.85, 1.15, 0.05), mFrame, base, 0, y, 0.01);
  };
  poster(posterTex('ROLETA\nSEM PIEDADE', 'toda sexta', '#e8d9b5', '#7a1414', 'gun'), W / 2 - 0.02, 2.2, 3.4, -Math.PI / 2);
  poster(posterTex('NOITE DO\nBLEFE', 'mesa 7 · 22h', '#1d2b3a', '#ffcf6b', 'cards'), W / 2 - 0.02, 2.2, -5.2, -Math.PI / 2);
  poster(posterTex('NO MERCY', 'procura-se parceiro', '#d8c49a', '#2a160b', 'skull'), -W / 2 + 0.02, 2.2, -0.3, Math.PI / 2);
  poster(posterTex('TORNEIO\nDE CARTAS', 'prêmio: a casa', '#3a1414', '#ffd27a', 'cards'), -5.5, 2.3, back + 0.02, 0);
  poster(posterTex('SEM FIADO', 'nem amanhã', '#e8d9b5', '#1a1a1a', 'skull'), 5.5, 2.3, back + 0.02, 0);

  // ---- parede da frente (atrás de você): porta e cabideiro
  {
    const base = at(2.5, 0, front - 0.02, Math.PI);
    b.add(new THREE.BoxGeometry(1.2, 2.3, 0.06), mWood, base, 0, 1.15, 0.03);
    b.add(new THREE.BoxGeometry(1.4, 0.12, 0.1), mFrame, base, 0, 2.36, 0.05);
    b.add(new THREE.SphereGeometry(0.04, 10, 8), mBrass, base, 0.45, 1.1, 0.09);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), night);
    pane.applyMatrix4(new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(0, 1.75, 0.065)));
    scene.add(pane);
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8), mDark, null, -1.5, 0.9, front - 0.4);
    b.add(new THREE.CylinderGeometry(0.22, 0.25, 0.03, 16), mDark, null, -1.5, 0.015, front - 0.4);
    b.add(new THREE.SphereGeometry(0.22, 12, 10), mWood, null, -1.5, 1.75, front - 0.4);
  }

  // ---- arandelas nas paredes (brilho sem custo de luz)
  const glowAmber = glowTex('rgba(255,190,110,.85)');
  const sconces: [number, number, number, number][] = [
    [-W / 2 + 0.1, 2.6, -5.6, Math.PI / 2],
    [-W / 2 + 0.1, 2.6, -0.3 - 1.2, Math.PI / 2],
    [-W / 2 + 0.1, 2.6, 5.2, Math.PI / 2],
    [W / 2 - 0.1, 2.6, -4.0, -Math.PI / 2],
    [W / 2 - 0.1, 2.6, 2.3, -Math.PI / 2],
    [W / 2 - 0.1, 2.6, 5.8, -Math.PI / 2],
    [-6.6, 2.6, back + 0.1, 0],
    [6.6, 2.6, back + 0.1, 0],
    [-4.5, 2.6, front - 0.1, Math.PI],
    [5.5, 2.6, front - 0.1, Math.PI],
  ];
  const sconceGlow = new THREE.SpriteMaterial({ map: glowAmber, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
  for (const [x, y, z, ry] of sconces) {
    const base = at(x, 0, z, ry);
    b.add(new THREE.BoxGeometry(0.14, 0.22, 0.04), mBrass, base, 0, y, 0);
    b.add(new THREE.CylinderGeometry(0.1, 0.06, 0.18, 14, 1, true), mSconce, base, 0, y + 0.12, 0.12);
    const g = new THREE.Sprite(sconceGlow);
    g.position.copy(new THREE.Vector3(0, y + 0.12, 0.16).applyMatrix4(base));
    g.scale.set(1.1, 1.1, 1);
    scene.add(g);
  }

  // Luzes decorativas assadas na geometria (custo zero por quadro, em PC e celular)
  const baked: BakedLight[] = [
    ...lamps.map((l) => bl(0xffb870, 5, 6, l.x, l.y, l.z)),
    bl(0x6ad8ff, 3, 6, -W / 2 + 1, 3, -0.6), // neon BEBIDAS
    bl(0xff6ad8, 3, 6, W / 2 - 1.2, 2.2, -1), // jukebox / BLEFE & BALA
    bl(0xffa860, 3.5, 8, -6.6, 1.8, 0),
    bl(0xffa860, 2.5, 7, 6.2, 1.8, 2.5),
    ...sconces.map(([x, y, z, ry]) => {
      const p = new THREE.Vector3(0, y + 0.15, 0.25).applyMatrix4(at(x, 0, z, ry));
      return bl(0xffb36a, 1.6, 3.2, p.x, p.y, p.z);
    }),
    ...candles.map((c) => bl(0xffa050, 0.5, 1.8, c.x, c.y + 0.05, c.z)),
    bl(0x8aa8ff, 0.8, 3, -W / 2 + 0.5, 2.2, -3.2), // luar das janelas
    bl(0x8aa8ff, 0.8, 3, -W / 2 + 0.5, 2.2, 2.6),
  ];
  b.flush(scene, baked, new Set<THREE.Material>([mFloor]));

  // Luzes reais (só 2: também iluminam personagens e garrafas)
  const pl = (color: number, intensity: number, dist: number, p: THREE.Vector3) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.4);
    l.position.copy(p);
    scene.add(l);
    return l;
  };
  pl(0xffb870, 9, 9, new THREE.Vector3(0, 2.6, barZ + 0.6)); // balcão e garrafas
  pl(0xff5a48, 3, 7, new THREE.Vector3(0, 3.3, back + 1)); // neon NO MERCY
  const flameMat = new THREE.SpriteMaterial({ map: glowAmber, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const candleLights = candles.map((c) => {
    const flame = new THREE.Sprite(flameMat);
    flame.position.copy(c);
    flame.scale.set(0.35, 0.45, 1);
    scene.add(flame);
    return flame;
  });

  return {
    tick(t: number) {
      candleLights.forEach((f, i) => {
        const k = 0.85 + Math.sin(t * 9 + i * 2.1) * 0.08 + Math.sin(t * 23 + i) * 0.05;
        f.scale.set(0.35 * k, 0.45 * k, 1);
      });
    },
  };
}
