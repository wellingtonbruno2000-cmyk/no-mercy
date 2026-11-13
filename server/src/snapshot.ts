import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Cópia de segurança da partida guardada pelos próprios jogadores (no navegador).
 * É compactada e CRIPTOGRAFADA (AES-256-GCM): ninguém consegue ler as cartas dos outros
 * nem alterar o conteúdo — se mexer, a verificação falha e a cópia é recusada.
 * Defina GAME_SECRET no servidor (Render → Environment) para uma chave só sua.
 */
const SECRET = process.env.GAME_SECRET || 'no-mercy-chave-padrao-defina-GAME_SECRET';
const KEY = createHash('sha256').update('snapshot:' + SECRET).digest();

export function seal(data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(deflateRawSync(Buffer.from(JSON.stringify(data)))), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function open<T>(sealed: unknown): T | null {
  try {
    if (typeof sealed !== 'string' || sealed.length > 3_000_000) return null;
    const [v, iv, tag, body] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || !body) return null;
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]);
    return JSON.parse(inflateRawSync(plain).toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Id público estável derivado do token secreto do navegador: o mesmo jogador continua sendo ele após um reinício. */
export function playerIdFromToken(token: string): string {
  return 'p_' + createHmac('sha256', 'player:' + SECRET).update(token).digest('base64url').slice(0, 16);
}
