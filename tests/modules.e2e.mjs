import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';
import { money } from '../src/utils.js';

// All writes stay in this disposable local SQLite database. Never use Neon Production here.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-modules-'));
const port = 47000 + Math.floor(Math.random() * 1500);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, DATA_DIR: dir, PORT: String(port), NODE_ENV: 'development', SEED_DEMO: '0', SERVE_BUILD: '1', USE_POSTGRES: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', part => output += part);
server.stderr.on('data', part => output += part);
const headers = { 'X-Requested-With': 'KouturePro' };
const sections = [
  ['/app', 'Tableau de bord', /^Bonjour/],
  ['/app/clients', 'Clients', 'Clients'],
  ['/app/orders', 'Commandes', 'Commandes'],
  ['/app/production', 'Production', 'Production'],
  ['/app/payments', 'Paiements & caisse', 'Paiements & caisse'],
  ['/app/stock', 'Stock & fournisseurs', 'Stock & fournisseurs'],
  ['/app/team', 'Équipe & succursales', 'Équipe & succursales'],
  ['/app/showcase', 'Vitrine (gestion)', 'Vitrine (gestion)'],
  ['/app/stats', 'Statistiques', 'Statistiques'],
  ['/app/settings', 'Paramètres', 'Paramètres'],
];
async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error('Serveur arrêté : ' + output);
    try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Serveur non prêt : ' + output);
}
async function login(page, identifier, password) {
  await page.goto(base + '/auth');
  await page.getByLabel('E-mail ou numéro de téléphone').fill(identifier);
  await page.getByLabel(/^Mot de passe/).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(base + '/app');
}
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const owner = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  owner.on('pageerror', error => errors.push(error.message));
  const email = `modules-${Date.now()}@test.invalid`;
  const signup = await owner.request.post(base + '/api/auth/signup', { headers, data: { name: 'Aïcha Contrôle', identifier: email, password: 'AtelierModules2026!' } });
  assert.equal(signup.status(), 201);
  const onboarding = await owner.request.post(base + '/api/onboarding', { headers, data: { name: 'Atelier Modules', city: 'Abidjan', whatsapp_phone: '+2250708081010', specialties: ['Boubous & ensembles'] } });
  assert.equal(onboarding.status(), 200);

  await owner.goto(base + '/app');
  await owner.getByRole('heading', { name: /^Bonjour Aïcha/ }).waitFor();
  assert.deepEqual((await owner.locator('.sidebar .nav-item').allTextContents()).map(text => text.trim()), sections.map(row => row[1]));
  console.log('✓ Les 10 rubriques apparaissent dans le bon ordre sur ordinateur');

  for (const width of [1440, 390, 320]) {
    await owner.setViewportSize({ width, height: 844 });
    for (const [route, , heading] of sections) {
      await owner.goto(base + route);
      await owner.getByRole('heading', { name: heading, exact: typeof heading === 'string' }).first().waitFor();
      const viewport = await owner.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(viewport.scroll <= viewport.width + 1, `Débordement sur ${route} en ${width}px : ${viewport.scroll}px`);
    }
  }
  assert.deepEqual(errors, []);
  console.log('✓ Les 10 écrans vides restent utilisables à 320, 390 et 1440 px, sans erreur JavaScript');

  await owner.goto(base + '/app');
  await owner.locator('.bottom-nav button').last().click();
  await owner.locator('.mobile-sheet-links').getByRole('button', { name: 'Stock & fournisseurs' }).click();
  await owner.getByRole('heading', { name: 'Stock & fournisseurs' }).waitFor();
  console.log('✓ Le menu « Plus » donne accès aux rubriques de gestion sur mobile');

  await owner.goto(base + '/app/clients?new=1');
  const clientForm = owner.getByRole('dialog', { name: 'Nouveau client' });
  await clientForm.getByLabel('Nom complet').fill('Mariam Nouvelle');
  await clientForm.getByLabel('Téléphone').fill('+2250704044444');
  await clientForm.getByRole('button', { name: 'Ajouter le client' }).click();
  await owner.getByRole('heading', { name: 'Mariam Nouvelle' }).waitFor();
  let data = await (await owner.request.get(base + '/api/bootstrap')).json();
  assert.equal(data.clients.length, 1);
  const clientId = data.clients[0].id;
  const db = new Database(path.join(dir, 'kouturepro.sqlite'), { readonly: true });
  try {
    const raw = db.prepare('SELECT phone_encrypted FROM clients WHERE id=?').get(clientId)?.phone_encrypted;
    assert.ok(raw && !raw.includes('0704044444'), 'Le numéro doit être chiffré dans la base');
  } finally { db.close(); }
  await owner.reload();
  await owner.getByRole('heading', { name: 'Mariam Nouvelle' }).waitFor();
  console.log('✓ Client créé par l’interface → API → base chiffrée, encore visible après rechargement');

  await owner.goto(base + '/app/team');
  await owner.locator('.tabs').getByRole('button', { name: /Succursales/ }).click();
  await owner.getByRole('button', { name: 'Ajouter une succursale' }).click();
  const branchForm = owner.getByRole('dialog', { name: 'Nouvelle succursale' });
  await branchForm.getByLabel('Nom de la succursale').fill('Succursale Cocody');
  await branchForm.getByLabel('Ville').fill('Abidjan');
  await branchForm.getByRole('button', { name: 'Créer la succursale' }).click();
  await owner.getByRole('heading', { name: 'Succursale Cocody' }).waitFor();
  data = await (await owner.request.get(base + '/api/bootstrap')).json();
  assert.equal(data.branches.length, 2);
  console.log('✓ Succursale créée par l’interface et retrouvée dans la base de l’atelier');

  await owner.goto(base + '/app/orders?new=1');
  const orderForm = owner.getByRole('dialog', { name: 'Nouvelle commande' });
  await orderForm.waitFor();
  await orderForm.getByLabel(/^Client/).selectOption(clientId);
  await orderForm.getByLabel('Modèle / description').fill('Robe test atelier');
  await orderForm.getByRole('button', { name: /Continuer/ }).click();
  await orderForm.getByLabel('Prix total (FCFA)').fill('46000');
  await orderForm.getByLabel('Acompte reçu en espèces').fill('6000');
  await orderForm.getByLabel('Date de livraison').fill(new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10));
  await orderForm.getByRole('button', { name: 'Créer la commande' }).click();
  await owner.getByRole('heading', { name: 'Robe test atelier' }).waitFor();
  data = await (await owner.request.get(base + '/api/bootstrap')).json();
  assert.equal(data.orders.length, 1);
  assert.equal(data.payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0), 6000);
  await owner.goto(base + '/app');
  await owner.getByRole('button', { name: /Chiffre d'affaires ce mois/i }).waitFor();
  assert.ok((await owner.locator('.dashboard-page').innerText()).includes(money(6000)));
  await owner.goto(base + '/app/stats');
  await owner.getByRole('heading', { name: 'Statistiques' }).waitFor();
  assert.ok((await owner.locator('.stats-grid').innerText()).includes(money(6000)));
  console.log('✓ Commande et acompte confirmés : tableau de bord et statistiques persistants');

  await owner.goto(base + '/app/production');
  await owner.getByRole('button', { name: 'Passer Robe test atelier à Découpe' }).click();
  data = await (await owner.request.get(base + '/api/bootstrap')).json();
  assert.equal(data.orders[0].stage, 1);
  console.log('✓ Production : passage à la deuxième étape enregistré dans la base');

  await owner.goto(base + '/app/stock');
  await owner.locator('.tabs').getByRole('button', { name: /Fournisseurs/ }).click();
  await owner.getByRole('button', { name: 'Nouveau fournisseur' }).first().click();
  const supplierForm = owner.getByRole('dialog', { name: 'Nouveau fournisseur' });
  await supplierForm.getByLabel('Nom du fournisseur').fill('Fournitures Awa');
  await supplierForm.getByRole('button', { name: 'Ajouter le fournisseur' }).click();
  await owner.getByRole('heading', { name: 'Fournitures Awa' }).waitFor();
  await owner.locator('.tabs').getByRole('button', { name: /Mes tissus/ }).click();
  await owner.getByRole('button', { name: 'Ajouter un tissu' }).first().click();
  const fabricForm = owner.getByRole('dialog', { name: 'Ajouter un tissu' });
  await fabricForm.getByLabel('Nom du tissu').fill('Wax étoilé');
  await fabricForm.getByLabel('Quantité disponible (m)').fill('6');
  await fabricForm.getByLabel('Coût par mètre (FCFA)').fill('2500');
  await fabricForm.getByRole('button', { name: 'Ajouter au stock' }).click();
  await owner.getByRole('heading', { name: 'Wax étoilé' }).waitFor();
  data = await (await owner.request.get(base + '/api/bootstrap')).json();
  assert.equal(data.suppliers.length, 1);
  assert.equal(data.fabrics.length, 1);
  assert.equal(data.fabrics[0].quantity, 6);
  console.log('✓ Stock & fournisseurs : deux créations par l’interface, données persistées');

  await owner.goto(base + '/app/showcase');
  await owner.getByRole('button', { name: 'Modifier les infos' }).click();
  const vitrine = owner.getByRole('dialog', { name: 'Personnaliser ma vitrine' });
  await vitrine.getByLabel('Votre histoire en quelques mots').fill('Couture sur mesure à Abidjan.');
  await vitrine.getByRole('button', { name: 'Mettre à jour la vitrine' }).click();
  const publicPage = await owner.request.get(base + '/api/public/atelier-modules');
  assert.equal(publicPage.status(), 200);
  assert.equal((await publicPage.json()).organization.description, 'Couture sur mesure à Abidjan.');
  console.log('✓ Vitrine : modification privée visible sur la page publique de l’atelier');

  const tailorEmail = `couturier-modules-${Date.now()}@test.invalid`;
  const teammate = await owner.request.post(base + '/api/team', { headers, data: { name: 'Couturier Vérification', identifier: tailorEmail, password: 'AtelierTailleur2026!', role: 'tailor', branch_id: data.user.branch_id } });
  assert.equal(teammate.status(), 201);
  const tailor = await browser.newPage({ viewport: { width: 390, height: 844 } });
  tailor.on('pageerror', error => errors.push(error.message));
  await login(tailor, tailorEmail, 'AtelierTailleur2026!');
  await tailor.goto(base + '/app/stock');
  await tailor.getByRole('heading', { name: 'Stock & fournisseurs' }).waitFor();
  assert.equal(await tailor.getByRole('button', { name: 'Ajouter un tissu' }).count(), 0);
  await tailor.goto(base + '/app/payments');
  await tailor.getByRole('heading', { name: 'Paiements & caisse' }).waitFor();
  assert.equal(await tailor.getByRole('button', { name: 'Encaisser', exact: true }).count(), 0);
  assert.equal(await tailor.getByRole('button', { name: 'Nouvelle dépense' }).count(), 0);
  await tailor.goto(base + '/app/showcase');
  await tailor.getByRole('heading', { name: 'Vitrine (gestion)' }).waitFor();
  assert.equal(await tailor.getByRole('button', { name: 'Modifier ma vitrine' }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('✓ Couturier : lecture autorisée, actions de caisse/stock/vitrine réservées aux bons rôles');
} catch (error) {
  console.error(error);
  throw error;
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill('SIGTERM'); });
  fs.rmSync(dir, { recursive: true, force: true });
}
