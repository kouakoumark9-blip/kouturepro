import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Opt-in: local, disposable PostgreSQL only. Never migrate a shared/Production DB during tests.
const connection = process.env.TEST_POSTGRES_URL;
if (connection) {
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
      !/^\/(?:merchant_validation(?:_[a-z0-9_]+)?|kp_test)$/.test(url.pathname)) {
    throw Error('Refusing non-disposable PostgreSQL URL; use local merchant_validation*, or CI kp_test database.');
  }
}
test('Vercel/PostgreSQL : inscription → dashboard → données chiffrées → redémarrage',
  { skip: !connection && 'TEST_POSTGRES_URL requis pour ce test externe', timeout: 90000 }, async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-postgres-test-'));
    const port = 39000 + crypto.randomInt(1, 1800), base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, USE_POSTGRES: '1', SEED_DEMO: '0', NODE_ENV: 'production', API_ONLY: '1',
      DATABASE_URL_UNPOOLED: connection, DATABASE_URL: '', PORT: String(port), DATA_DIR: temp,
      APP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'), SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      PUBLIC_BASE_URL: 'https://example.test', CRON_SECRET: 'cron-test-only' };
    let server;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function start(vercel = false) {
      const program = vercel
        ? ['--input-type=module', '-e', "import('./api/index.js').then(({default:handler})=>import('node:http').then(({createServer})=>createServer((req,res)=>handler(req,res)).listen(process.env.PORT,'127.0.0.1')))" ]
        : ['server/index.js'];
      server = spawn(process.execPath, program, { cwd: process.cwd(),
        env: vercel ? { ...env, VERCEL: '1', API_ONLY: '0' } : env, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '';server.stdout.on('data', chunk => log += chunk);server.stderr.on('data', chunk => log += chunk);
      for (let i = 0; i < 300; i++) {
        if (server.exitCode !== null) throw Error('PostgreSQL indisponible : ' + log);
        try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
        await wait(100);
      }
      throw Error('Démarrage expiré : ' + log);
    }
    async function stop() {
      if (!server || server.exitCode !== null) return;
      const proc = server;
      await new Promise(resolve => { const timer = setTimeout(() => { proc.kill('SIGKILL');resolve(); }, 5000);
        proc.once('exit', () => { clearTimeout(timer); resolve(); });proc.kill('SIGTERM'); });
      server = null;
    }
    let cookie = '';
    async function req(url, method = 'GET', data, auth = cookie) {
      const response = await fetch(base + url, { method, headers: { 'X-Requested-With': 'KouturePro', ...(auth ? { Cookie: auth } : {}),
        ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
      return { status: response.status, json: await response.json(), headers: response.headers };
    }
    try {
      await start();
      assert.equal((await req('/api/health')).json.database, 'ready');
      assert.equal((await req('/api/bootstrap')).status, 401);
      const email = `pg-${crypto.randomUUID()}@test.invalid`, password = 'CoutureDB2026!';
      const signup = await req('/api/auth/signup', 'POST', { name: 'Awa PostgreSQL', identifier: email, password });
      assert.equal(signup.status, 201); cookie = signup.headers.get('set-cookie').split(';')[0];
      assert.equal((await req('/api/bootstrap')).status, 403);
      const org = await req('/api/onboarding', 'POST', { name: 'Maison de test ' + email.slice(3, 11), city: 'Duekoué', whatsapp_phone: '+2250700123456' });
      assert.equal(org.status, 200);
      const client = await req('/api/clients', 'POST', { name: 'Cliente fictive', phone: '+2250700123457', notes: 'Chiffrement PostgreSQL' });
      assert.equal(client.status, 201);
      const measure = await req('/api/measurements', 'POST', { client_id: client.json.item.id, type: 'Poitrine', value: '93' });
      assert.equal(measure.status, 201);
      const order = await req('/api/orders', 'POST', { client_id: client.json.item.id, model: 'Boubou QA', price: 45000,
        due_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) });
      assert.equal(order.status, 201);
      assert.equal((await req('/api/payments', 'POST', { order_id: order.json.item.id, amount: 10000, method: 'Espèces' })).status, 201);
      const share = await req(`/api/orders/${order.json.item.id}/invoice/share`, 'POST', {});
      assert.equal(share.status, 200); assert.match(share.json.url, /^https:\/\/example\.test\/receipt\//);
      assert.equal((await req('/api/cron/reminders')).status, 401);
      await stop();
      assert.equal(fs.existsSync(path.join(temp, 'kouturepro.sqlite')), false, 'Vercel ne doit jamais enregistrer SQLite localement.');
      await start();
      const login = await req('/api/auth/login', 'POST', { identifier: email, password }, '');
      assert.equal(login.status, 200); assert.equal(login.json.needs_onboarding, false);
      cookie = login.headers.get('set-cookie').split(';')[0];
      const saved = await req('/api/bootstrap');
      assert.equal(saved.status, 200); assert.equal(saved.json.organization.id, org.json.organization.id);
      assert.equal(saved.json.clients[0].phone, '+2250700123457');
      assert.equal(saved.json.clients[0].notes, 'Chiffrement PostgreSQL');
      assert.equal(saved.json.measurements[0].value, '93');
      assert.equal(saved.json.orders[0].id, order.json.item.id);
      assert.equal(saved.json.payments[0].amount, 10000);
      const other = await req('/api/auth/signup', 'POST', { name: 'Atelier étranger', identifier: `other-${crypto.randomUUID()}@test.invalid`, password });
      assert.equal(other.status, 201); const otherCookie = other.headers.get('set-cookie').split(';')[0];
      const onboardOther = await req('/api/onboarding', 'POST', { name: 'Autre atelier', city: 'Abidjan', whatsapp_phone: '+2250700123458' }, otherCookie);
      assert.equal(onboardOther.status, 200);
      const isolated = await req('/api/bootstrap', 'GET', undefined, otherCookie);
      assert.equal(isolated.status, 200); assert.equal(isolated.json.clients.length, 0);
      assert.equal((await req(`/api/orders/${order.json.item.id}/invoice`, 'GET', undefined, otherCookie)).status, 404);
      const phone = '+22505' + String(crypto.randomInt(10000000, 99999999));
      const phoneSignup = await req('/api/auth/signup', 'POST', { name: 'Couturier téléphone', identifier: phone, password }, '');
      assert.equal(phoneSignup.status, 201);
      const phoneLogin = await req('/api/auth/login', 'POST', { identifier: phone, password }, '');
      assert.equal(phoneLogin.status, 200); assert.equal(phoneLogin.json.needs_onboarding, true);
      const target = `inconnu-${crypto.randomUUID()}@test.invalid`;
      for (let i = 0; i < 5; i++) assert.equal((await req('/api/auth/login', 'POST', { identifier: target, password }, '')).status, 401);
      await stop(); await start();
      for (let i = 5; i < 10; i++) assert.equal((await req('/api/auth/login', 'POST', { identifier: target, password }, '')).status, 401);
      assert.equal((await req('/api/auth/login', 'POST', { identifier: target, password }, '')).status, 429,
        'Le blocage doit survivre au redémarrage de la fonction.');
      // When the build exists, exercise the actual exported Vercel handler and
      // bundled PostgreSQL Worker; simulate CDN rewrites with __kp_path.
      if (fs.existsSync(path.join(process.cwd(), 'dist/pg-worker.mjs'))) {
        await stop(); await start(true);
        assert.equal((await req('/api/index?__kp_path=/api/health')).json.database, 'ready');
        const html = await fetch(base + '/api/index?__kp_path=/auth');
        assert.equal(html.status, 200); assert.match(await html.text(), /KouturePro/);
        const portal = await req('/api/index?__kp_path=/api/auth/login', 'POST', { identifier: email, password }, '');
        assert.equal(portal.status, 200); cookie = portal.headers.get('set-cookie').split(';')[0];
        assert.equal((await req('/api/index?__kp_path=/api/bootstrap')).json.orders[0].id, order.json.item.id);
      }
    } finally { await stop(); fs.rmSync(temp, { recursive: true, force: true }); }
  });
