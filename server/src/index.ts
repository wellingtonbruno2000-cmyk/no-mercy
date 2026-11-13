import { randomBytes, randomInt as cryptoRandomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { GameError, type Ack, type ClientToServerEvents, type ServerToClientEvents } from '@nomercy/shared';
import { DEFAULT_TIMINGS, RoomError, RoomManager, type Timings } from './rooms';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface ServerOptions {
  port?: number;
  timings?: Partial<Timings>;
  staticDir?: string | null;
  /** Interface de rede (padrão: todas). O app de PC usa 127.0.0.1. */
  host?: string;
}

/** TIMING_SCALE=0.2 acelera bots e transições (útil para testes manuais/E2E). */
function scaledTimings(): Timings {
  const scale = Number(process.env.TIMING_SCALE ?? 1);
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return DEFAULT_TIMINGS;
  const t = { ...DEFAULT_TIMINGS };
  for (const k of Object.keys(t) as (keyof Timings)[]) if (k !== 'emptyRoomTtlMs') t[k] = Math.max(1, Math.round(t[k] * scale));
  return t;
}

/** Fonte de aleatoriedade criptográfica do servidor. */
const secureRandomInt = (max: number) => cryptoRandomInt(0, max);

export async function startServer(opts: ServerOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ ok: true, name: 'NO MERCY' }));

  const staticDir =
    opts.staticDir === undefined ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist') : opts.staticDir;
  // Endereço público do site (para Google e prévias de link). Defina SITE_URL em produção, ex.: https://nomercy.onrender.com
  const siteUrl = (req: express.Request) => {
    if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
    return `${proto}://${req.get('host')}`;
  };

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /socket.io/\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl(req)}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
    );
  });

  if (staticDir && existsSync(staticDir)) {
    const indexHtml = readFileSync(path.join(staticDir, 'index.html'), 'utf8');
    // Verificação do Google Search Console (variável GOOGLE_SITE_VERIFICATION = código do content="...").
    const gsv = (process.env.GOOGLE_SITE_VERIFICATION ?? '').replace(/[^A-Za-z0-9_-]/g, '');
    const googleTag = gsv ? `    <meta name="google-site-verification" content="${gsv}" />\n` : '';
    const renderIndex = (req: express.Request) => {
      const base = siteUrl(req);
      return indexHtml
        .replace(/content="\/og-image\.jpg"/g, `content="${base}/og-image.jpg"`)
        .replace(
          '</head>',
          `  <link rel="canonical" href="${base}/" />\n    <meta property="og:url" content="${base}/" />\n${googleTag}  </head>`,
        );
    };
    // Arquivos com hash ficam em cache por 1 ano; service worker, manifesto e página sempre revalidam.
    app.use(
      express.static(staticDir, {
        index: false,
        setHeaders(res, file) {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else if (/sw\.js$|manifest\.webmanifest$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
          else res.setHeader('Cache-Control', 'public, max-age=3600');
        },
      }),
    );
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(renderIndex(req));
    });
  }

  const http = createHttpServer(app);
  const io: IO = new Server(http, {
    cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? true },
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  /** token secreto do cliente -> id público do jogador */
  const sessions = new Map<string, string>();

  const manager = new RoomManager(
    {
      onChange(room) {
        for (const m of room.members) {
          if (m.isBot || manager.playerRoom.get(m.id) !== room.code) continue;
          io.to(`p:${m.id}`).emit('room:update', manager.viewFor(room, m.id));
        }
      },
      onClosed(_room, ids, reason) {
        for (const id of ids) io.to(`p:${id}`).emit('room:closed', { reason });
      },
    },
    secureRandomInt,
    { ...scaledTimings(), ...opts.timings },
  );

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) {
      return next(new Error('Sessão inválida'));
    }
    let playerId = sessions.get(token);
    if (!playerId) {
      playerId = `p_${randomBytes(9).toString('base64url')}`;
      sessions.set(token, playerId);
    }
    socket.data.playerId = playerId;
    next();
  });

  io.on('connection', (socket: ClientSocket) => {
    const playerId: string = socket.data.playerId;
    socket.join(`p:${playerId}`);

    const room = manager.roomOf(playerId);
    if (room) {
      manager.setConnected(playerId, true);
    }

    const handle = <A extends unknown[]>(fn: (...args: A) => object | void) =>
      (...args: [...A, Ack | undefined]) => {
        const ack = args[args.length - 1] as Ack | undefined;
        const callback = typeof ack === 'function' ? ack : undefined;
        try {
          const result = fn(...(args.slice(0, -1) as A));
          callback?.({ ok: true, ...(result ?? {}) });
        } catch (err) {
          if (err instanceof GameError || err instanceof RoomError) callback?.({ ok: false, error: err.message });
          else {
            console.error('Erro inesperado', err);
            callback?.({ ok: false, error: 'Erro inesperado no servidor.' });
          }
        }
      };

    const obj = (p: unknown): Record<string, unknown> => (p && typeof p === 'object' ? (p as Record<string, unknown>) : {});

    socket.on('room:create', handle((p: unknown) => {
      const { name, solo, botCount } = obj(p);
      const r = manager.create(playerId, String(name ?? ''));
      if (solo) {
        const total = typeof botCount === 'number' ? Math.round(botCount) + 1 : 4;
        manager.fillBots(playerId, total);
        manager.start(playerId);
      }
      return { code: r.code };
    }) as never);

    socket.on('room:join', handle((p: unknown) => {
      const { code, name } = obj(p);
      const r = manager.join(String(code ?? ''), playerId, String(name ?? ''));
      return { code: r.code };
    }) as never);

    socket.on('room:leave', handle(() => manager.leave(playerId)) as never);
    socket.on('room:addBot', handle(() => manager.addBot(playerId)) as never);
    socket.on('room:fillBots', handle(() => manager.fillBots(playerId)) as never);
    socket.on('room:removePlayer', handle((p: unknown) => manager.removePlayer(playerId, String(obj(p).playerId ?? ''))) as never);
    socket.on('room:settings', handle((p: unknown) => {
      const ts = obj(p).turnSeconds;
      manager.updateSettings(playerId, typeof ts === 'number' ? { turnSeconds: ts } : {});
    }) as never);
    socket.on('room:rename', handle((p: unknown) => manager.rename(playerId, String(obj(p).name ?? ''))) as never);
    socket.on('game:start', handle(() => manager.start(playerId)) as never);
    socket.on('game:bid', handle((p: unknown) => manager.bid(playerId, obj(p).value as number)) as never);
    socket.on('game:play', handle((p: unknown) => {
      const { cardId, jokerMode } = obj(p);
      const mode = jokerMode === 'MAX' || jokerMode === 'MIN' ? jokerMode : null;
      manager.play(playerId, cardId as string, mode);
    }) as never);
    socket.on('game:rematch', handle(() => manager.rematch(playerId)) as never);

    // ---- Movimento do mouse (cabeça do boneco no multiplayer): só repassa, com limite de frequência.
    let lastLook = 0;
    socket.on('game:look', (p: unknown) => {
      const now = Date.now();
      if (now - lastLook < 60) return;
      const { x, y } = obj(p);
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
      if (Math.abs(x) > 1 || Math.abs(y) > 1) return;
      lastLook = now;
      const msg = { playerId, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
      for (const to of manager.lookTargets(playerId)) io.to(`p:${to}`).volatile.emit('game:look', msg);
    });

    // ---- Chat de voz: o servidor só repassa a sinalização; o áudio trafega direto entre os navegadores (WebRTC).
    socket.on('voice:join', handle((p: unknown) => ({ peers: manager.voiceJoin(playerId, obj(p).micOn === true) })) as never);
    socket.on('voice:leave', handle(() => manager.voiceLeave(playerId)) as never);
    socket.on('voice:mic', handle((p: unknown) => manager.voiceMic(playerId, obj(p).micOn === true)) as never);
    socket.on('voice:signal', (p: unknown) => {
      const { to, data } = obj(p);
      if (typeof to !== 'string' || !data || typeof data !== 'object') return;
      const d = data as Record<string, unknown>;
      const okType = d.type === 'offer' || d.type === 'answer' || d.type === 'ice';
      if (!okType || JSON.stringify(d).length > 20000) return;
      if (!manager.canSignal(playerId, to)) return;
      io.to(`p:${to}`).emit('voice:signal', { from: playerId, data: d as never });
    });

    socket.on('disconnect', async () => {
      const remaining = await io.in(`p:${playerId}`).fetchSockets();
      if (remaining.length === 0) manager.setConnected(playerId, false);
    });
  });

  const port = opts.port ?? Number(process.env.PORT ?? 3001);
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    if (opts.host) http.listen(port, opts.host, () => resolve());
    else http.listen(port, () => resolve());
  });
  const address = http.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    port: actualPort,
    manager,
    async close() {
      manager.dispose();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startServer().then(({ port }) => {
    console.log(`🃏 NO MERCY rodando em http://localhost:${port}`);
  });
}
