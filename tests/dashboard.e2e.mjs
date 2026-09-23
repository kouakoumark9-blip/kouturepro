import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { money, today } from '../src/utils.js';

// A disposable server: neither the project demo nor a hosted customer database
// is modified by the dashboard journey.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-dashboard-browser-'));
const port = 45000 + Math.floor(Math.random() * 2000), base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.js'], { cwd: process.cwd(),
  env: { ...process.env, DATA_DIR: dir, PORT: String(port), NODE_ENV: 'development', SEED_DEMO: '1', SERVE_BUILD: '1', USE_POSTGRES: '0' },
  stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';server.stdout.on('data', b => log += b);server.stderr.on('data', b => log += b);
async function wait() {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw Error('Serveur arrêté : ' + log);
    try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Serveur non prêt : ' + log);
}
async function login(page, identifier, password) {
  await page.goto(base + '/auth');
  await page.getByLabel('E-mail ou numéro de téléphone').fill(identifier);
  await page.getByLabel(/^Mot de passe/).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}
let browser;
try {
  await wait(); browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const issues = [],owner = await browser.newPage({ viewport: { width: 390, height: 844 } });
  owner.on('pageerror', e => issues.push(e.message));
  await login(owner, 'demo@kouturepro.test', 'Atelier2026!');
  await owner.getByRole('heading', { name: /Bonjour Awa/ }).waitFor();
  const response = await owner.request.get(base + '/api/bootstrap');assert.equal(response.status(), 200);
  const data = await response.json(), ids = new Set(data.orders.map(o => o.id));
  const revenue = data.payments.filter(p => ids.has(p.order_id) && p.status === 'paid' && p.created_at.startsWith(today().slice(0, 7))).reduce((sum, p) => sum + p.amount, 0);
  assert.ok((await owner.locator('.dashboard-page').innerText()).includes(money(revenue)));
  assert.equal(await owner.locator('.mobile-order-item:visible').count(), 5);
  assert.equal(await owner.locator('.recent-card .table-wrap:visible').count(), 0);
  assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth), 390);
  await owner.locator('.mobile-order-item').first().click();
  await owner.getByRole('heading', { name: /Boubou brodé ivoire/ }).waitFor();
  console.log('✓ Tableau de bord mobile : chiffre lié aux encaissements réels, commandes ouvrables sans débordement');

  await owner.setViewportSize({ width: 1440, height: 900 });
  await owner.goto(base + '/app'); await owner.getByRole('heading', { name: /Bonjour Awa/ }).waitFor();
  await owner.getByRole('button', { name: /Chiffre d'affaires ce mois/i }).focus();
  await owner.keyboard.press('Enter'); await owner.getByRole('heading', { name: 'Paiements & caisse' }).waitFor();
  await owner.goto(base + '/app'); await owner.getByRole('button', { name: 'Nouvelle commande' }).first().click();
  await owner.getByRole('dialog', { name: 'Nouvelle commande' }).waitFor();
  await owner.goto(base + '/app');
  await owner.locator('.recent-order-link').first().focus();
  await owner.keyboard.press('Enter');
  await owner.getByRole('heading', { name: /Boubou brodé ivoire/ }).waitFor();
  console.log('✓ Tableau de bord ordinateur : indicateurs et commandes accessibles au clavier, création directe');

  const newcomer = await browser.newPage({ viewport: { width: 390, height: 844 } });
  newcomer.on('pageerror', e => issues.push(e.message));
  await newcomer.goto(base + '/auth'); await newcomer.getByRole('tab', { name: 'Inscription' }).click();
  await newcomer.getByLabel(/^Votre nom/).fill('Kady Premier Atelier');
  await newcomer.getByLabel('E-mail ou numéro de téléphone').fill(`kady-${Date.now()}@test.invalid`);
  await newcomer.getByLabel(/^Mot de passe/).fill('CoutureDash2026!');
  await newcomer.getByLabel(/^Confirmer le mot de passe/).fill('CoutureDash2026!');
  await newcomer.getByRole('button', { name: 'Créer mon compte' }).click();
  await newcomer.getByRole('heading', { name: 'Comment s’appelle votre atelier ?' }).waitFor();
  await newcomer.getByLabel('Nom de votre atelier').fill('Atelier Premier');
  await newcomer.getByRole('button', { name: /Continuer/ }).click();
  await newcomer.getByLabel('Ville').fill('Abidjan');
  await newcomer.getByLabel('WhatsApp professionnel').fill('+2250701234545');
  await newcomer.getByRole('button', { name: /Continuer/ }).click();
  await newcomer.getByRole('button', { name: /Boubous & ensembles/ }).click();
  await newcomer.getByRole('button', { name: /Continuer/ }).click();
  await newcomer.getByRole('button', { name: 'Ouvrir mon tableau de bord' }).click();
  await newcomer.getByRole('heading', { name: 'Commençons ensemble.' }).waitFor();
  await newcomer.getByRole('heading', { name: 'Vos commandes apparaîtront ici' }).waitFor();
  assert.match(await newcomer.locator('.dashboard-page').innerText(), /0 FCFA/);
  assert.equal((await (await newcomer.request.get(base + '/api/bootstrap')).json()).clients.length, 0);
  await newcomer.locator('.dashboard-starter').getByRole('button', { name: /Ajouter un client/ }).click();
  await newcomer.getByRole('dialog', { name: 'Nouveau client' }).waitFor();
  console.log('✓ Nouvel atelier : zéro donnée fictive, étapes guidées et création du premier client');

  const accountEmail = `comptable-${Date.now()}@test.invalid`;
  const created = await owner.request.post(base + '/api/team', { headers: { 'X-Requested-With': 'KouturePro' },
    data: { name: 'Comptable Test', identifier: accountEmail, password: 'CoutureComptable2026!', role: 'accountant', branch_id: data.user.branch_id } });
  assert.equal(created.status(), 201);
  const accountant = await browser.newPage({ viewport: { width: 390, height: 844 } });
  accountant.on('pageerror', e => issues.push(e.message));
  await login(accountant, accountEmail, 'CoutureComptable2026!');
  await accountant.getByRole('heading', { name: /Bonjour Comptable/ }).waitFor();
  await accountant.getByRole('button', { name: 'Nouvelle dépense' }).click();
  await accountant.getByRole('dialog', { name: 'Nouvelle dépense' }).waitFor();
  console.log('✓ Comptable : action adaptée à ses droits, formulaire de dépense accessible');
  assert.deepEqual(issues, []);
} catch (error) {
  console.error(error);
  throw error;
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve);server.kill('SIGTERM'); });
  fs.rmSync(dir, { recursive: true, force: true });
}
