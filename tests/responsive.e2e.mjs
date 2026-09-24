import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

// A disposable local database: never create demonstration users or orders on Neon.
// TEST_WEBKIT=1 uses Playwright WebKit when it is installed (iPhone/iPad engine).
const engine = process.env.TEST_WEBKIT === '1' ? webkit : chromium;
const full = process.env.RESPONSIVE_FULL === '1';
const sizes = full ? [
  [320, 568], [375, 667], [390, 844], [430, 932], [667, 375],
  [768, 1024], [820, 1180], [844, 390], [1024, 768], [1280, 800], [1440, 900],
] : [[320, 568], [390, 844], [667, 375], [768, 1024], [1024, 768], [1440, 900]];
const paths = ['/app', '/app/clients', '/app/orders', '/app/production', '/app/payments',
  '/app/stock', '/app/team', '/app/showcase', '/app/stats', '/app/settings'];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-responsive-'));
const port = 49500 + crypto.randomInt(0, 450), base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.js'], { cwd: process.cwd(),
  env: { ...process.env, DATA_DIR: dir, PORT: String(port), NODE_ENV: 'development',
    SEED_DEMO: '1', USE_POSTGRES: '0', SERVE_BUILD: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
server.stdout.on('data', data => output += data);
server.stderr.on('data', data => output += data);
let browser;
const delay = t => new Promise(resolve => setTimeout(resolve, t));
async function ready() {
  for (let i = 0; i < 160; i++) {
    if (server.exitCode !== null) throw Error('Serveur arrêté : ' + output);
    try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
    await delay(100);
  }
  throw Error('Serveur indisponible : ' + output);
}
async function inspect(page, label, touch) {
  const result = await page.evaluate(touch => {
    const width = document.documentElement.clientWidth;
    const overflow = [...document.querySelectorAll('body *')].filter(el => {
      const box = el.getBoundingClientRect(), style = getComputedStyle(el);
      if (box.width < 10 || box.height < 10 || box.left >= width || box.right <= width + 2 ||
          style.display === 'none' || style.visibility === 'hidden' ||
          style.position === 'fixed' || style.position === 'absolute') return false;
      // Tabs and the Kanban columns intentionally scroll in their own regions.
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) return false;
      }
      return true;
    }).slice(0, 3).map(el => el.className || el.tagName);
    const targets = touch ? ['.auth-submit', '.auth-tabs button', '.bottom-nav button',
      '.public-menu-button', '.public-header-cta', '.topbar-bell', '.topbar-search',
      '.icon-button', '.modal-card .btn'] : [];
    const small = targets.flatMap(selector => [...document.querySelectorAll(selector)].filter(el => {
      const style = getComputedStyle(el), box = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0 &&
        (box.width < 40 || box.height < 40);
    }).map(el => `${selector}:${Math.round(el.getBoundingClientRect().height)}px`));
    return { width, scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth, overflow, small };
  }, touch);
  assert.ok(result.scroll <= result.width + 1 && result.body <= result.width + 1,
    `${label} : débordement horizontal ${JSON.stringify(result)}`);
  assert.deepEqual(result.overflow, [], `${label} : contenu coupé hors du viewport`);
  assert.deepEqual(result.small, [], `${label} : commande tactile trop petite`);
}
try {
  await ready();
  browser = await engine.launch(engine === chromium ? { headless: true, args: ['--no-sandbox'] } : { headless: true });
  for (const [width, height] of sizes) {
    const touch = width <= 1100;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 900,
      hasTouch: touch, deviceScaleFactor: touch ? 2 : 1, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base + '/auth');
      await page.getByRole('tab', { name: 'Connexion' }).waitFor();
      await inspect(page, `${width}×${height} connexion`, touch);
      if (width < 900) {
        const font = await page.getByLabel('E-mail ou numéro de téléphone').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        assert.ok(font >= 16, `iOS peut zoomer automatiquement ce champ (${font}px)`);
      }
      await page.getByLabel('E-mail ou numéro de téléphone').fill('demo@kouturepro.test');
      await page.getByLabel(/^Mot de passe/).fill('Atelier2026!');
      await page.getByRole('button', { name: 'Se connecter' }).click();
      await page.getByRole('heading', { name: /Bonjour Awa/ }).waitFor();
      if (width < 900) {
        const hiddenLabels = await page.locator('.bottom-item>span:last-child').evaluateAll(labels =>
          labels.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
        assert.deepEqual(hiddenLabels, [], `${width}×${height} : libellé du menu masqué`);
      }
      for (const route of paths) {
        await page.goto(base + route);
        await page.locator('.app-shell').waitFor();
        await inspect(page, `${width}×${height} ${route}`, touch);
      }
      if (width < 900) {
        await page.goto(base + '/app/production');
        const board = page.getByRole('region', { name: /Étapes de production/ });
        const boardScroll = await board.evaluate(el => { const range = el.scrollWidth - el.clientWidth; el.scrollLeft = range; return [range, el.scrollLeft]; });
        assert.ok(boardScroll[0] > 0 && boardScroll[1] > 0, 'Les cinq étapes doivent être accessibles au balayage.');
        await page.goto(base + '/app/orders?new=1');
        const form = page.getByRole('dialog', { name: 'Nouvelle commande' });
        await form.waitFor();
        await inspect(page, `${width}×${height} formulaire de commande`, touch);
        const client = await page.request.get(base + '/api/bootstrap');
        assert.equal(client.status(), 200);
        await form.getByLabel(/^Client/).selectOption((await client.json()).clients[0].id);
        await form.getByLabel('Modèle / description').fill('Tenue adaptée');
        await form.getByRole('button', { name: /Continuer/ }).click();
        await form.getByLabel('Prix total (FCFA)').waitFor();
        await form.getByRole('button', { name: 'Créer la commande' }).scrollIntoViewIfNeeded();
        await inspect(page, `${width}×${height} deuxième étape commande`, touch);
      }
      await page.goto(base + '/atelier-kone');
      await page.locator('.public-site').waitFor();
      await inspect(page, `${width}×${height} vitrine publique`, touch);
      if (width <= 760) {
        await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
        await page.getByRole('link', { name: 'Réalisations' }).first().click();
      }
      await page.getByRole('button', { name: /Prendre rendez-vous/ }).first().click();
      await page.getByRole('dialog', { name: 'Prenons rendez-vous' }).waitFor();
      await inspect(page, `${width}×${height} rendez-vous`, touch);
      assert.deepEqual(errors, [], `${width}×${height} : erreur JavaScript`);
      console.log(`✓ ${engine === webkit ? 'WebKit' : 'Chromium'} ${width}×${height} : connexion, 10 rubriques, commandes, vitrine, rendez-vous`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  fs.rmSync(dir, { recursive: true, force: true });
}
