// Gera o instalador .exe a partir de release/win-unpacked usando o NSIS (funciona no Windows, Linux e macOS).
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8'));

if (process.argv.includes('--pack')) {
  execSync('npm run prepare-app && npx electron-builder --win dir --x64 --publish never', { cwd: here, stdio: 'inherit' });
}

function findMakensis() {
  if (process.env.MAKENSIS) return { bin: process.env.MAKENSIS, env: {} };
  const cache = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache', 'nsis', 'nsis-3.0.4.1')
    : path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches' : '.cache', 'electron-builder', 'nsis', 'nsis-3.0.4.1');
  const bin = process.platform === 'win32' ? path.join(cache, 'makensis.exe') : path.join(cache, process.platform === 'darwin' ? 'mac' : 'linux', 'makensis');
  if (existsSync(bin)) return { bin, env: { NSISDIR: cache } };
  return { bin: 'makensis', env: {} }; // instalado no sistema
}

const { bin, env } = findMakensis();
const flag = process.platform === 'win32' ? '/' : '-';
execFileSync(bin, [`${flag}DVERSION=${version}`, `${flag}V2`, 'no-mercy.nsi'], {
  cwd: path.join(here, 'installer'),
  stdio: 'inherit',
  env: { ...process.env, ...env },
});
console.log(`✓ release/NO-MERCY-Setup-${version}.exe`);
