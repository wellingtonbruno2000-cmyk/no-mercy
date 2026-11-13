// Teste de fumaça da interface com Playwright.
// Uso: inicie o servidor (npm run build && npm start) e rode: npm run test:e2e
import { createRequire } from 'node:module';
// Usa o Playwright instalado no sistema (ou no projeto, se adicionado como dependência).
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('•', ...a);

/** Joga automaticamente pela interface até a condição ser satisfeita. */
async function playUntil(page, done, { maxSteps = 400, shots = {} } = {}) {
  for (let step = 0; step < maxSteps; step++) {
    if (await done()) return;
    const chip = (await page.locator('[data-testid=hand-chip]').textContent().catch(() => '')) ?? '';
    for (const [key, fn] of Object.entries(shots)) {
      if (!shots[key].done && (await fn.when(chip))) {
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}${key}.png` });
        shots[key].done = true;
        log('screenshot', key);
      }
    }
    if (await page.locator('[data-testid=bid-panel]').isVisible().catch(() => false)) {
      const buttons = page.locator('[data-testid^=bid-]:not([data-testid=bid-panel]):not([data-testid=bid-confirm]):enabled');
      const n = await buttons.count();
      try {
        await buttons.nth(Math.floor(Math.random() * n)).click({ timeout: 2000 });
        await page.locator('[data-testid=bid-confirm]').click({ timeout: 2000 });
      } catch {
        continue;
      }
      await page.waitForTimeout(200);
      continue;
    }
    const status = (await page.locator('[data-testid=status]').textContent().catch(() => '')) ?? '';
    if (status.includes('Sua vez de jogar')) {
      const cards = page.locator('[data-testid=hand] button');
      const n = await cards.count();
      if (n > 0) {
        try {
          await cards.nth(Math.floor(Math.random() * n)).click({ force: true, timeout: 2000 });
          await page.locator('[data-testid=play-button]').click({ timeout: 2000 });
        } catch {
          continue; // estado mudou durante a animação; tenta de novo
        }
        const joker = page.locator('[data-testid=joker-max]');
        if (await joker.isVisible({ timeout: 400 }).catch(() => false)) {
          if (!shots.joker?.done) {
            await page.waitForTimeout(600);
            await page.screenshot({ path: `${OUT}joker.png` });
            shots.joker = { done: true };
            log('screenshot joker');
          }
          await (Math.random() < 0.5 ? joker : page.locator('[data-testid=joker-min]')).click();
        }
        await page.waitForTimeout(200);
        continue;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error('playUntil: limite de passos atingido');
}

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
let failures = 0;
try {
  // ---------- Desktop: modo solo ----------
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    failures++;
    console.error('pageerror', e);
  });
  await page.goto(BASE);
  await page.getByText('Preveja. Vença. Sem piedade.').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}home.png` });
  log('home ok');

  await page.getByPlaceholder('Como quer ser chamado?').fill('Wellington');
  await page.getByRole('button', { name: 'Jogar contra bots' }).click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.locator('[data-testid=hand-chip]').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}blind.png` });
  log('jogo solo iniciado (partida às cegas)');

  // Privacidade: a própria carta aparece virada na partida às cegas.
  if (!(await page.getByLabel('Sua carta (oculta)').isVisible())) throw new Error('carta própria deveria estar oculta');

  const shots = {
    result1: { when: async () => await page.locator('[data-testid=hand-result]').isVisible() },
    hand3: { when: async (chip) => chip.includes('Partida 3/') && (await page.locator('[data-testid=trick] [data-card]').count()) >= 3 },
    bid4: { when: async (chip) => chip.includes('Partida 4/') && (await page.locator('[data-testid=bid-panel]').isVisible()) },
  };
  await playUntil(page, async () => ((await page.locator('[data-testid=hand-chip]').textContent()) ?? '').includes('Partida 5/'), {
    shots,
    maxSteps: 1500,
  });
  log('desktop: jogou até a partida 5');
  await page.locator('[data-testid=audio-settings]').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}audio-settings.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fechar' }).click().catch(() => undefined);
  await page.getByRole('button', { name: 'Placar' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}scoreboard.png` });
  await page.keyboard.press('Escape');
  await ctx.close();

  // ---------- Multiplayer: dois navegadores ----------
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  await host.goto(BASE);
  await host.getByPlaceholder('Como quer ser chamado?').fill('Ana');
  await host.getByRole('button', { name: 'Criar sala' }).click();
  const code = (await host.locator('[data-testid=room-code]').textContent()).trim();
  log('sala criada', code);

  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  const guest = await phone.newPage();
  guest.on('pageerror', (e) => {
    failures++;
    console.error('pageerror (guest)', e);
  });
  await guest.goto(`${BASE}/?sala=${code}`);
  await guest.getByRole('button', { name: 'Fechar' }).click();
  await guest.getByPlaceholder('Como quer ser chamado?').fill('Bruno');
  await guest.getByRole('button', { name: 'Entrar' }).first().click();
  await guest.getByRole('button', { name: 'Entrar' }).last().click();
  await host.getByText('Bruno').waitFor();
  await host.getByRole('button', { name: 'Completar até 4' }).click();
  await host.getByRole('button', { name: 'Adicionar bot' }).click();
  await host.getByRole('button', { name: 'Adicionar bot' }).click();
  await host.getByRole('button', { name: 'Adicionar bot' }).click();
  await host.waitForTimeout(400);
  await host.screenshot({ path: `${OUT}lobby.png` });
  await host.getByRole('button', { name: /Iniciar jogo/ }).click();
  await guest.locator('[data-testid=hand-chip]').waitFor();
  await guest.waitForTimeout(600);
  await guest.screenshot({ path: `${OUT}mobile-blind.png` });
  await host.context().grantPermissions(['microphone']);
  await guest.context().grantPermissions(['microphone']);
  log('multiplayer iniciado (7 jogadores, 2 humanos)');

  // Chat de voz entre os dois navegadores (microfone falso do Chromium).
  // O chat de voz conecta sozinho (sem clicar) quando há outro jogador humano na sala.
  const voiceOk = async (pg) =>
    pg.waitForFunction(() => {
      const v = window.__voice;
      return v && [...v.peers.values()].some((p) => p.pc.connectionState === 'connected');
    }, null, { timeout: 20000 });
  await Promise.all([voiceOk(host), voiceOk(guest)]);
  log('chat de voz conectou sozinho entre os dois jogadores');
  await guest.locator('[data-testid=mic-button]').click(); // muta
  await host.waitForFunction(() => document.querySelector('[title="Microfone mudo"]'), null, { timeout: 5000 });
  log('mudo refletido para o outro jogador');

  const mobileShots = {
    'mobile-play': { when: async (chip) => chip.includes('Partida 3/') && (await guest.locator('[data-testid=trick] [data-card]').count()) >= 2 },
  };
  const hostLoop = playUntil(host, async () => ((await host.locator('[data-testid=hand-chip]').textContent()) ?? '').includes('Partida 4/'), {
    maxSteps: 1500,
  });
  await playUntil(guest, async () => ((await guest.locator('[data-testid=hand-chip]').textContent()) ?? '').includes('Partida 4/'), {
    shots: mobileShots,
    maxSteps: 1500,
  });
  await hostLoop;
  log('multiplayer: ambos chegaram à partida 4');
  await guest.screenshot({ path: `${OUT}mobile-hand4.png` });

  // ---------- Jogo completo até o campeão (8 jogadores = 6 partidas) ----------
  if (process.env.FULL_GAME) {
    const fctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const fp = await fctx.newPage();
    await fp.goto(BASE);
    await fp.getByPlaceholder('Como quer ser chamado?').fill('Wellington');
    await fp.getByRole('button', { name: 'Jogar contra bots' }).click();
    await fp.getByRole('button', { name: '8', exact: true }).click();
    await fp.getByRole('button', { name: 'Começar' }).click();
    await fp.locator('[data-testid=hand-chip]').waitFor();
    await playUntil(fp, async () => fp.locator('[data-testid=game-over]').isVisible(), { maxSteps: 4000 });
    await fp.waitForTimeout(1500);
    await fp.screenshot({ path: `${OUT}game-over.png` });
    log('jogo completo: campeão =', await fp.locator('[data-testid=champion]').textContent());
    await fctx.close();
  }
} catch (e) {
  failures++;
  console.error(e);
} finally {
  await browser.close();
}
if (failures) {
  console.error(`❌ ${failures} falha(s)`);
  process.exit(1);
}
console.log('✅ Teste de interface concluído. Capturas em e2e/screenshots/');
