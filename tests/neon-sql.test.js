import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import schema, { postgresMigrations } from '../server/schema.js';

const sql = readFileSync(new URL('../database/initialiser-neon.sql', import.meta.url), 'utf8');
test('SQL Neon reproductible, isolé et sans données fictives', () => {
  assert.match(sql, /BEGIN;\s*SELECT pg_advisory_xact_lock\(7489201\);\s*CREATE SCHEMA IF NOT EXISTS kouturepro;\s*SET LOCAL search_path TO kouturepro, public;/);
  assert.ok(sql.includes(schema.trim()), 'Le SQL publié doit refléter le schéma réellement utilisé par le serveur.');
  for (const statement of postgresMigrations) assert.ok(sql.includes(statement + ';'), statement);
  assert.equal((schema.match(/^CREATE TABLE IF NOT EXISTS /gm) || []).length, 34);
  assert.match(sql, /tables_kouturepro/);
  assert.doesNotMatch(sql, /^\s*(?:DROP|TRUNCATE|INSERT|DELETE|UPDATE)\s/mi);
});
