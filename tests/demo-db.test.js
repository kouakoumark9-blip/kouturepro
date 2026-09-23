import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'scripts/create-demo-db.mjs');
const run = (output) => spawnSync(process.execPath, [script, output], { cwd: root, encoding: 'utf8', timeout: 30000 });

test('générer une base fictive isolée, valide et sans écraser une base existante', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kouturepro-fictive-'));
  const output = path.join(temp, 'nouvelle-base');
  try {
    const result = run(output);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(fs.existsSync(path.join(output, 'local-secrets.json')));
    const databasePath = path.join(output, 'kouturepro.sqlite');
    const db = new Database(databasePath, { readonly: true });
    try {
      assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
      assert.deepEqual(db.pragma('foreign_key_check'), []);
      assert.equal(db.prepare('SELECT count(*) n FROM organizations WHERE is_demo=1').get().n, 1);
      assert.equal(db.prepare('SELECT count(*) n FROM clients').get().n, 8);
      assert.equal(db.prepare('SELECT count(*) n FROM orders').get().n, 14);
      assert.equal(db.prepare('SELECT count(*) n FROM payments').get().n, 13);
      assert.equal(db.prepare('SELECT count(*) n FROM measurements').get().n, 48);
      assert.equal(db.prepare("SELECT email FROM users WHERE id='demo-owner'").get().email, 'demo@kouturepro.test');
      assert.match(db.prepare('SELECT phone_encrypted FROM clients LIMIT 1').get().phone_encrypted, /^[A-Za-z0-9+/=]+$/);
    } finally { db.close(); }
    const before = fs.readFileSync(databasePath);
    const repeat = run(output);
    assert.notEqual(repeat.status, 0, 'Ne jamais écraser une base sans accord.');
    assert.deepEqual(fs.readFileSync(databasePath), before);
    const forbidden = run(path.join(root, 'data'));
    assert.notEqual(forbidden.status, 0, 'Ne jamais générer dans le dossier réel data/.');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
