import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = process.cwd();

test('en production : interface API → SQLite → redémarrage, sans démo ni données éphémères', { timeout: 45000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-persistent-test-'));
  const port = 34000 + crypto.randomInt(1, 5000), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, DATA_DIR: dir, PORT: String(port), NODE_ENV: 'production', API_ONLY: '1', SEED_DEMO: '0',
    APP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'), SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    RENDER_EXTERNAL_URL: 'https://kouturepro.example', PUBLIC_BASE_URL: '', CINETPAY_API_KEY: '', CINETPAY_SITE_ID: '' };
  let server;
  const start = async () => {
    server = spawn(process.execPath, ['server/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) throw new Error('Échec au démarrage : ' + log);
      try { const res = await fetch(base + '/api/health'); if (res.ok) { assert.equal((await res.json()).database, 'ready'); return; } } catch {}
      await sleep(100);
    }
    throw new Error('Serveur non prêt : ' + log);
  };
  const stop = async () => {
    if (!server || server.exitCode !== null || server.signalCode !== null) return;
    const proc = server;
    await new Promise(resolve => {
      const timer = setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 5000);
      proc.once('exit', () => { clearTimeout(timer); resolve(); });
      proc.kill('SIGTERM');
    });
    server = undefined;
  };
  const req = async (url, { method = 'GET', cookie = '', body } = {}) => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'KouturePro', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: await response.json(), headers: response.headers };
  };
  try {
    const invalid = spawnSync(process.execPath, ['server/index.js'], { cwd: root, encoding: 'utf8', timeout: 10000,
      env: { ...env, DATA_DIR: path.join(dir, 'missing-disk'), REQUIRE_MOUNTED_DATA_DIR: '1' } });
    assert.notEqual(invalid.status, 0, 'Un disque absent doit empêcher le démarrage.');
    assert.match(invalid.stderr, /Disque persistant absent/);
    assert.equal(fs.existsSync(path.join(dir, 'missing-disk', 'kouturepro.sqlite')), false);

    await start();
    assert.equal((await req('/api/bootstrap')).status, 401);
    assert.equal((await req('/api/auth/login', { method: 'POST', body: { identifier: 'demo@kouturepro.test', password: 'Atelier2026!' } })).status, 401);
    const signup = await req('/api/auth/signup', { method: 'POST', body: { name: 'Awa Test', identifier: 'proprietaire@test.invalid', password: 'ExempleUnique2026!' } });
    assert.equal(signup.status, 201); assert.equal(signup.json.needs_onboarding, true);
    assert.match(signup.headers.get('set-cookie'), /HttpOnly/);
    assert.match(signup.headers.get('set-cookie'), /Secure/);
    const cookie = signup.headers.get('set-cookie').split(';')[0];
    const onboarding = await req('/api/onboarding', { method: 'POST', cookie, body: { name: 'Maison Duekoué', city: 'Duekoué', whatsapp_phone: '+2250700001111', specialties: ['Boubous'], plan: 'starter' } });
    assert.equal(onboarding.status, 200); const slug = onboarding.json.organization.slug;
    const client = await req('/api/clients', { method: 'POST', cookie, body: { id: 'client-persistant', name: 'Client Fictif', phone: '+2250700001122', notes: 'Essai de persistance' } });
    assert.equal(client.status, 201); assert.equal(client.json.item.phone, '+2250700001122');
    const measure = await req('/api/measurements', { method: 'POST', cookie, body: { client_id: 'client-persistant', type: 'Poitrine', value: '92' } });
    assert.equal(measure.status, 201);
    const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const order = await req('/api/orders', { method: 'POST', cookie, body: { id: 'commande-persistante', client_id: 'client-persistant', model: 'Boubou fictif', price: 35000, due_date: due } });
    assert.equal(order.status, 201);
    const payment = await req('/api/payments', { method: 'POST', cookie, body: { id: 'acompte-persistant', order_id: 'commande-persistante', amount: 10000, method: 'Espèces' } });
    assert.equal(payment.status, 201);
    const mobile = await req('/api/payments/mobile', { method: 'POST', cookie, body: { order_id: 'commande-persistante', amount: 5000, provider: 'Wave' } });
    assert.equal(mobile.status, 503, 'Aucun faux paiement mobile sans identifiants marchands.');
    const invoice = await req('/api/orders/commande-persistante/invoice/share', { method: 'POST', cookie });
    assert.equal(invoice.status, 200); assert.match(invoice.json.url, /^https:\/\/kouturepro\.example\/receipt\//);
    const image = new FormData();
    image.append('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg2kAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'logo.png');
    const upload = await fetch(base + '/api/uploads/image', { method: 'POST', headers: { Cookie: cookie, 'X-Requested-With': 'KouturePro' }, body: image });
    assert.equal(upload.status, 201); const { url: imageUrl } = await upload.json();
    assert.equal((await fetch(base + imageUrl)).status, 200);
    await stop();
    assert.equal(fs.existsSync(path.join(dir, 'local-secrets.json')), false, 'Aucune clé de secours locale en production.');
    const sqlite = new Database(path.join(dir, 'kouturepro.sqlite'), { readonly: true });
    try {
      assert.equal(sqlite.prepare('SELECT count(*) AS total FROM clients').get().total, 1);
      const encrypted = sqlite.prepare("SELECT phone_encrypted,notes_encrypted FROM clients WHERE id='client-persistant'").get();
      assert.doesNotMatch(encrypted.phone_encrypted, /0700001122/);
      assert.doesNotMatch(encrypted.notes_encrypted, /Essai de persistance/);
      assert.equal(sqlite.pragma('integrity_check', { simple: true }), 'ok');
    } finally { sqlite.close(); }
    await start();
    const login = await req('/api/auth/login', { method: 'POST', body: { identifier: 'proprietaire@test.invalid', password: 'ExempleUnique2026!' } });
    assert.equal(login.status, 200); assert.equal(login.json.needs_onboarding, false);
    const authCookie = login.headers.get('set-cookie').split(';')[0];
    const bootstrap = await req('/api/bootstrap', { cookie: authCookie });
    assert.equal(bootstrap.status, 200); assert.equal(bootstrap.json.organization.slug, slug);
    assert.equal(bootstrap.json.clients[0].phone, '+2250700001122');
    assert.equal(bootstrap.json.clients[0].notes, 'Essai de persistance');
    assert.equal(bootstrap.json.measurements[0].value, '92');
    assert.equal(bootstrap.json.orders[0].id, 'commande-persistante');
    assert.equal(bootstrap.json.payments[0].amount, 10000);
    assert.equal((await fetch(base + imageUrl)).status, 200);
    const page = await fetch(base + '/' + slug); const html = await page.text();
    assert.equal(page.status, 200); assert.match(html, new RegExp(`<link rel="canonical" href="https://kouturepro\\.example/${slug}"`));
    assert.doesNotMatch(html, /noindex, nofollow/);
    assert.equal((await req('/api/health')).json.database, 'ready');
  } finally { await stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
