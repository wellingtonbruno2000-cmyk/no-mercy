// Prepara a pasta app/: servidor do jogo empacotado num único arquivo + interface já compilada.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'app');

if (!existsSync(path.join(root, 'client', 'dist', 'index.html')) || process.env.REBUILD_CLIENT !== '0') {
  console.log('• Compilando a interface…');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log('• Empacotando o servidor…');
await build({
  entryPoints: [path.join(root, 'server', 'src', 'index.ts')],
  outfile: path.join(out, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Dependências CommonJS (express, socket.io) precisam de "require" dentro de um módulo ESM.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});

console.log('• Copiando a interface…');
cpSync(path.join(root, 'client', 'dist'), path.join(out, 'client'), { recursive: true });

// Endereço do servidor online padrão (opcional): NOMERCY_ONLINE_URL=https://seu-jogo.onrender.com
writeFileSync(path.join(out, 'defaults.json'), JSON.stringify({ onlineUrl: process.env.NOMERCY_ONLINE_URL ?? '' }, null, 2));
console.log('✓ app/ pronto');
