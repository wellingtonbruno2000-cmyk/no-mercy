import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Cópia de segurança da partida guardada pelos próprios jogadores (no navegador).
 * É compactada e CRIPTOGRAFADA (AES-256-GCM): ninguém consegue ler as cartas dos outros
 * nem alterar o conteúdo — se mexer, a verificação falha e a cópia é recusada.
 * Defina GAME_SECRET no servidor (Render → Environment) para uma chave só sua.
 */
const DEFAULT_SECRET = 'no-mercy-chave-padrao-defina-GAME_SECRET';
const SECRET = process.env.GAME_SECRET || DEFAULT_SECRET;
const KEY = createHash('sha256').update('snapshot:' + SECRET).digest();
const DEFAULT_KEY = createHash('sha256').update('snapshot:' + DEFAULT_SECRET).digest();
const BOOT = Date.now();

export function seal(data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(deflateRawSync(Buffer.from(JSON.stringify(data)))), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function open<T>(sealed: unknown): T | null {
  const r = openWith<T>(sealed, KEY);
  if (r) return r;
  // Transição: quem acabou de definir GAME_SECRET ainda tem cópias feitas com a chave padrão.
  // Elas são aceitas só nos primeiros 30 minutos após o servidor iniciar.
  if (SECRET !== DEFAULT_SECRET && Date.now() - BOOT < 30 * 60 * 1000) return openWith<T>(sealed, DEFAULT_KEY);
  return null;
}

function openWith<T>(sealed: unknown, key: Buffer): T | null {
  try {
    if (typeof sealed !== 'string' || sealed.length > 3_000_000) return null;
    const [v, iv, tag, body] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || !body) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]);
    return JSON.parse(inflateRawSync(plain).toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Id público estável derivado do token secreto do navegador: o mesmo jogador continua sendo ele após um reinício. */
export function playerIdFromToken(token: string): string {
  // O token já é secreto e só o navegador o conhece; o id não depende de GAME_SECRET.
  return 'p_' + createHmac('sha256', 'no-mercy-player-id-v1').update(token).digest('base64url').slice(0, 16);
}
