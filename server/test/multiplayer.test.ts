import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  decideBluff,
  decideBid,
  decidePlay,
  isHiddenCard,
  type ClientToServerEvents,
  type RoomView,
  type ServerToClientEvents,
} from '@nomercy/shared';
import { startServer } from '../src/index';

type C = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: Awaited<ReturnType<typeof startServer>>;
let url = '';

beforeAll(async () => {
  server = await startServer({
    port: 0,
    staticDir: null,
    timings: {
      botDelayMin: 1,
      botDelayMax: 3,
      roundResultMs: 2,
      blindResultMs: 2,
      handResultMs: 2,
      dealMs: 1,
      disconnectGraceMs: 50,
    },
  });
  url = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

interface Client {
  socket: C;
  last: RoomView | null;
  views: RoomView[];
}

function client(token = Math.random().toString(36).repeat(4)): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket: C = connect(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    const c: Client = { socket, last: null, views: [] };
    socket.on('room:update', (v) => {
      c.last = v;
      c.views.push(v);
    });
    socket.on('connect', () => resolve(c));
    socket.on('connect_error', reject);
  });
}

function emit<T = Record<string, unknown>>(c: Client, event: string, ...args: unknown[]): Promise<{ ok: boolean; error?: string } & T> {
  return new Promise((resolve) => (c.socket.emit as (...a: unknown[]) => void)(event, ...args, resolve));
}

function waitFor(c: Client, pred: (v: RoomView) => boolean, timeout = 20000): Promise<RoomView> {
  return new Promise((resolve, reject) => {
    if (c.last && pred(c.last)) return resolve(c.last);
    const t = setTimeout(() => reject(new Error('timeout waiting for state')), timeout);
    const h = (v: RoomView) => {
      if (pred(v)) {
        clearTimeout(t);
        c.socket.off('room:update', h);
        resolve(v);
      }
    };
    c.socket.on('room:update', h);
  });
}

/** Faz o cliente jogar automaticamente quando for a vez dele, usando a própria visão. */
function autoplay(c: Client) {
  let busy = false;
  const act = async (v: RoomView) => {
    const g = v.game;
    if (!g || busy) return;
    if (g.phase === 'BIDDING' && g.currentBidderId === v.you) {
      busy = true;
      const res = await emit(c, 'game:bid', { value: decideBid(g) });
      busy = false;
      expect(res.ok).toBe(true);
      if (c.last) void act(c.last); // o estado pode ter mudado enquanto aguardávamos a confirmação
    } else if (g.phase === 'PLAYING' && g.currentPlayerId === v.you) {
      busy = true;
      const d = decidePlay(g);
      const res = await emit(c, 'game:play', d);
      busy = false;
      expect(res.ok).toBe(true);
      if (c.last) void act(c.last);
    }
  };
  c.socket.on('room:update', (v) => void act(v));
  if (c.last) void act(c.last);
}

describe('multiplayer', () => {
  it('cria sala, amigo entra pelo código, completa com bots e joga até o fim', async () => {
    const host = await client();
    const friend = await client();
    const created = await emit<{ code: string }>(host, 'room:create', { name: 'Ana' });
    expect(created.ok).toBe(true);
    // Sozinho na sala não dá para começar (mínimo de 2 jogadores)
    expect((await emit(host, 'game:start')).ok).toBe(false);
    const code = created.code;
    expect(code).toMatch(/^[A-Z2-9]{5}$/);

    const joined = await emit(friend, 'room:join', { code: code.toLowerCase(), name: 'Bruno' });
    expect(joined.ok).toBe(true);
    await waitFor(host, (v) => v.players.length === 2);

    // Amigo não é anfitrião
    expect((await emit(friend, 'game:start')).ok).toBe(false);
    expect((await emit(host, 'room:addBot')).ok).toBe(true);
    expect((await emit(host, 'room:fillBots')).ok).toBe(true);
    await waitFor(host, (v) => v.players.length === 4);

    const third = await client();
    expect((await emit(third, 'room:join', { code, name: 'Carla' })).ok).toBe(true);
    await waitFor(host, (v) => v.players.length === 5);

    expect((await emit(host, 'game:start')).ok).toBe(true);
    const v1 = await waitFor(friend, (v) => v.status === 'PLAYING');
    expect(v1.game!.blind).toBe(true);
    expect(isHiddenCard(v1.game!.myHand[0])).toBe(true);
    expect(Object.keys(v1.game!.visibleHands)).not.toContain(v1.you);

    // Novo jogador não pode entrar com o jogo em andamento
    const late = await client();
    expect((await emit(late, 'room:join', { code, name: 'Diego' })).ok).toBe(false);

    // Jogada fora de hora é rejeitada pelo servidor
    const bad = await emit(friend, 'game:play', { cardId: 'BLACK-10', jokerMode: null });
    expect(bad.ok).toBe(false);

    autoplay(host);
    autoplay(friend);
    autoplay(third);
    const end = await waitFor(host, (v) => v.status === 'FINISHED', 50000);
    expect(end.game!.phase).toBe('GAME_OVER');
    expect(end.game!.handHistory).toHaveLength(11);
    expect(end.game!.championId).toBeTruthy();

    // Nenhuma visão de partida às cegas revelou a própria carta antes da revelação
    for (const c of [host, friend, third]) {
      for (const v of c.views) {
        const g = v.game;
        if (g && g.blind && g.phase === 'BIDDING') expect(g.myHand.every(isHiddenCard)).toBe(true);
        if (g && !g.blind && g.phase === 'PLAYING') expect(g.visibleHands).toEqual({});
      }
    }

    expect((await emit(host, 'game:rematch')).ok).toBe(true);
    const lobby = await waitFor(friend, (v) => v.status === 'LOBBY');
    expect(lobby.players).toHaveLength(5);
    for (const c of [host, friend, third, late]) c.socket.disconnect();
  });

  it('modo solo inicia imediatamente com bots', async () => {
    const solo = await client();
    const res = await emit<{ code: string }>(solo, 'room:create', { name: 'Solo', solo: true, botCount: 7 });
    expect(res.ok).toBe(true);
    const v = await waitFor(solo, (x) => x.status === 'PLAYING');
    expect(v.players).toHaveLength(8);
    expect(v.game!.maxHands).toBe(6);
    autoplay(solo);
    await waitFor(solo, (x) => x.status === 'FINISHED', 50000);
    solo.socket.disconnect();
  });

  it('sala inexistente retorna erro', async () => {
    const c = await client();
    const res = await emit(c, 'room:join', { code: 'ZZZZZ', name: 'X' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/não encontrada/);
    c.socket.disconnect();
  });

  it('reconecta com o mesmo token e jogador desconectado é substituído automaticamente', async () => {
    const token = 'reconnect-token-'.repeat(2);
    const host = await client();
    const created = await emit<{ code: string }>(host, 'room:create', { name: 'Host' });
    let guest = await client(token);
    await emit(guest, 'room:join', { code: created.code, name: 'Guest' });
    await emit(host, 'room:fillBots');
    await emit(host, 'game:start');
    await waitFor(guest, (v) => v.status === 'PLAYING');
    guest.socket.disconnect();
    autoplay(host);
    // Mesmo desconectado, o jogo avança (sistema joga pelo ausente).
    await waitFor(host, (v) => (v.game?.handNumber ?? 0) >= 3, 20000);
    guest = await client(token);
    const back = await waitFor(guest, (v) => v.status === 'PLAYING');
    expect(back.code).toBe(created.code);
    expect(back.players.find((p) => p.id === back.you)!.connected).toBe(true);
    autoplay(guest);
    await waitFor(host, (v) => v.status === 'FINISHED', 50000);
    host.socket.disconnect();
    guest.socket.disconnect();
  });

  it('valida payloads inválidos sem derrubar o servidor', async () => {
    const c = await client();
    await emit(c, 'room:create', { name: '<script>alert(1)</script>'.repeat(3) });
    const v = await waitFor(c, (x) => x.players.length === 1);
    expect(v.players[0].name).not.toContain('<');
    expect(v.players[0].name.length).toBeLessThanOrEqual(16);
    expect((await emit(c, 'game:bid', { value: 'abc' })).ok).toBe(false);
    expect((await emit(c, 'room:settings', { turnSeconds: 7 })).ok).toBe(false);
    expect((await emit(c, 'room:settings', { turnSeconds: 30 })).ok).toBe(true);
    c.socket.disconnect();
  });

  it('chat de voz: repassa sinalização só entre membros da sala que estão na voz', async () => {
    const a = await client();
    const b = await client();
    const c = await client();
    const outsider = await client();
    const { code } = await emit<{ code: string }>(a, 'room:create', { name: 'A' });
    await emit(b, 'room:join', { code, name: 'B' });
    await emit(c, 'room:join', { code, name: 'C' });
    await emit(outsider, 'room:create', { name: 'X' });

    const ja = await emit<{ peers: string[] }>(a, 'voice:join', { micOn: true });
    expect(ja.peers).toEqual([]);
    const jb = await emit<{ peers: string[] }>(b, 'voice:join', { micOn: false });
    const aId = a.last!.you;
    const bId = b.last!.you;
    const cId = (await waitFor(c, (v) => v.players.length === 3)).you;
    expect(jb.peers).toEqual([aId]);
    const v = await waitFor(c, (x) => x.players.filter((p) => p.voice).length === 2);
    expect(v.players.find((p) => p.id === aId)!.micOn).toBe(true);
    expect(v.players.find((p) => p.id === bId)!.micOn).toBe(false);

    const got: { from: string; data: unknown }[] = [];
    const gotC: unknown[] = [];
    a.socket.on('voice:signal', (m) => got.push(m));
    c.socket.on('voice:signal', (m) => gotC.push(m));
    outsider.socket.on('voice:signal', (m) => gotC.push(m));
    b.socket.emit('voice:signal', { to: aId, data: { type: 'offer', sdp: 'v=0' } });
    b.socket.emit('voice:signal', { to: cId, data: { type: 'offer', sdp: 'v=0' } }); // C não está na voz
    b.socket.emit('voice:signal', { to: outsider.last!.you, data: { type: 'offer', sdp: 'v=0' } });
    b.socket.emit('voice:signal', { to: aId, data: { type: 'evil', payload: 1 } } as never);
    await new Promise((r) => setTimeout(r, 200));
    expect(got).toEqual([{ from: bId, data: { type: 'offer', sdp: 'v=0' } }]);
    expect(gotC).toEqual([]);

    expect((await emit(b, 'voice:mic', { micOn: true })).ok).toBe(true);
    await waitFor(a, (x) => x.players.find((p) => p.id === bId)!.micOn);
    b.socket.disconnect();
    await waitFor(a, (x) => !x.players.find((p) => p.id === bId)!.voice);
    for (const x of [a, c, outsider]) x.socket.disconnect();
  });

  it('partida com apenas 2 jogadores humanos', async () => {
    const a = await client();
    const b = await client();
    const { code } = await emit<{ code: string }>(a, 'room:create', { name: 'A' });
    await emit(b, 'room:join', { code, name: 'B' });
    expect((await emit(a, 'game:start')).ok).toBe(true);
    const v = await waitFor(b, (x) => x.status === 'PLAYING');
    expect(v.game!.maxHands).toBe(12);
    expect(v.game!.participants).toHaveLength(2);
    a.socket.disconnect();
    b.socket.disconnect();
  });

  it('repassa o movimento do mouse (cabeça do boneco) só para a sala, com validação', async () => {
    const a = await client();
    const b = await client();
    const out = await client();
    const { code } = await emit<{ code: string }>(a, 'room:create', { name: 'A' });
    await emit(b, 'room:join', { code, name: 'B' });
    await emit(out, 'room:create', { name: 'X' });
    await emit(a, 'game:start');
    await waitFor(b, (x) => x.status === 'PLAYING');
    const gotB: unknown[] = [];
    const gotOut: unknown[] = [];
    b.socket.on('game:look', (m) => gotB.push(m));
    out.socket.on('game:look', (m) => gotOut.push(m));
    a.socket.emit('game:look', { x: 0.5, y: -0.25 });
    await new Promise((r) => setTimeout(r, 120));
    a.socket.emit('game:look', { x: 9, y: 'abc' } as never); // inválido: ignorado
    await new Promise((r) => setTimeout(r, 200));
    expect(gotB).toEqual([{ playerId: a.last!.you, x: 0.5, y: -0.25 }]);
    expect(gotOut).toEqual([]);
    for (const c of [a, b, out]) c.socket.disconnect();
  });

  it('modo Roleta Sem Piedade: partida solo com bots até sobrar um', async () => {
    const c = await client();
    const res = await emit<{ code: string }>(c, 'room:create', { name: 'Solo', solo: true, botCount: 3, mode: 'roleta' });
    expect(res.ok).toBe(true);
    const v = await waitFor(c, (x) => x.status === 'PLAYING' && !!x.bluff);
    expect(v.settings.mode).toBe('roleta');
    expect(v.bluff!.myHand).toHaveLength(5);
    expect(JSON.stringify(v)).not.toContain('bullet');
    let busy = false;
    const act = async (x: typeof v) => {
      const b = x.bluff;
      if (!b || busy || b.phase !== 'TURN' || b.turnId !== x.you) return;
      busy = true;
      const d = decideBluff(b);
      const r = d.call ? await emit(c, 'bluff:call') : await emit(c, 'bluff:play', { cardIds: d.cardIds });
      busy = false;
      expect(r.ok).toBe(true);
      if (c.last) void act(c.last);
    };
    c.socket.on('room:update', (x) => void act(x));
    void act(c.last!);
    const end = await waitFor(c, (x) => x.status === 'FINISHED', 50000);
    expect(end.bluff!.phase).toBe('GAME_OVER');
    expect(end.bluff!.winnerId).toBeTruthy();
    expect(Object.values(end.bluff!.alive).filter(Boolean)).toHaveLength(1);
    c.socket.disconnect();
  });
});
