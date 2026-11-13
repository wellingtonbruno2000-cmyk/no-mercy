// NO MERCY — aplicativo para PC (Electron).
// Modo offline: um servidor do jogo roda dentro do próprio programa (jogar contra bots sem internet).
// Modo online: abre o servidor público do jogo para jogar com amigos.
const { app, BrowserWindow, Menu, shell, dialog, session, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const APP_DIR = path.join(__dirname, 'app');
const ICON = path.join(__dirname, 'build', 'icon.png');
const LOCAL_PORT = 47321; // porta fixa: mantém nome, preferências e sessão entre aberturas

let win = null;
let localUrl = null;

// ---------- Configuração ----------
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}
function getConfig() {
  const defaults = readJson(path.join(APP_DIR, 'defaults.json'));
  return { onlineUrl: '', ...defaults, ...readJson(cfgFile()) };
}
function saveConfig(patch) {
  const next = { ...readJson(cfgFile()), ...patch };
  fs.mkdirSync(path.dirname(cfgFile()), { recursive: true });
  fs.writeFileSync(cfgFile(), JSON.stringify(next, null, 2));
  return getConfig();
}
function normalizeUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const url = new URL(u);
    return url.origin;
  } catch {
    return '';
  }
}

// ---------- Servidor local (offline) ----------
async function startLocalServer() {
  if (localUrl) return localUrl;
  const { startServer } = await import(pathToFileURL(path.join(APP_DIR, 'server.mjs')).href);
  const opts = { host: '127.0.0.1', staticDir: path.join(APP_DIR, 'client') };
  let srv;
  try {
    srv = await startServer({ ...opts, port: LOCAL_PORT });
  } catch {
    srv = await startServer({ ...opts, port: 0 }); // porta ocupada: usa qualquer uma livre
  }
  localUrl = `http://127.0.0.1:${srv.port}`;
  return localUrl;
}

// ---------- Navegação ----------
function showLauncher() {
  win.loadFile(path.join(__dirname, 'launcher.html'));
}
async function playOffline() {
  try {
    const url = await startLocalServer();
    await win.loadURL(url);
  } catch (err) {
    dialog.showErrorBox('NO MERCY', 'Não foi possível iniciar o modo offline.\n\n' + (err && err.message ? err.message : err));
  }
}
async function playOnline() {
  const { onlineUrl } = getConfig();
  if (!onlineUrl) {
    showLauncher();
    return;
  }
  try {
    await win.loadURL(onlineUrl);
  } catch {
    const r = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'NO MERCY',
      message: 'Não foi possível conectar ao servidor online.',
      detail: `${onlineUrl}\n\nVerifique sua internet. Se o servidor estava "dormindo" (plano gratuito), aguarde 1 minuto e tente de novo.`,
      buttons: ['Tentar de novo', 'Jogar offline', 'Menu inicial'],
    });
    if (r.response === 0) return playOnline();
    if (r.response === 1) return playOffline();
    showLauncher();
  }
}

ipcMain.handle('nm:getConfig', () => getConfig());
ipcMain.handle('nm:setOnlineUrl', (_e, raw) => {
  const url = normalizeUrl(raw);
  if (raw && !url) return { ok: false, error: 'Endereço inválido.' };
  return { ok: true, config: saveConfig({ onlineUrl: url }) };
});
ipcMain.handle('nm:playOnline', () => playOnline());
ipcMain.handle('nm:playOffline', () => playOffline());

function buildMenu() {
  const template = [
    {
      label: 'Jogo',
      submenu: [
        { label: 'Menu inicial', accelerator: 'CmdOrCtrl+M', click: showLauncher },
        { label: 'Jogar online (com amigos)', click: playOnline },
        { label: 'Jogar offline (contra bots)', click: playOffline },
        { type: 'separator' },
        { label: 'Tela cheia', accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => win.webContents.reload() },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'zoomIn', label: 'Aumentar zoom' },
        { role: 'zoomOut', label: 'Diminuir zoom' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o NO MERCY',
          click: () =>
            dialog.showMessageBox(win, {
              title: 'NO MERCY',
              message: `NO MERCY ${app.getVersion()}`,
              detail: 'Jogo de cartas estratégico. Preveja exatamente quantas rodadas vai vencer.\n\nAperte Alt para mostrar este menu.',
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: '#140e0b',
    title: 'NO MERCY',
    icon: ICON,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  // Links externos abrem no navegador padrão.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  showLauncher();
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  // Permite o microfone (chat de voz) e o áudio do jogo.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'audioCapture', 'speaker-selection', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ['media', 'audioCapture', 'speaker-selection'].includes(permission));
  buildMenu();
  createWindow();
  startLocalServer().catch(() => undefined); // pré-aquece o modo offline
});

app.on('window-all-closed', () => app.quit());
