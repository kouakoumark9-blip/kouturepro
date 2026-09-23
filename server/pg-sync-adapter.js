// Compatibility layer for the existing synchronous, tenant-scoped business API.
// PostgreSQL work happens in a dedicated worker thread. Queries are serialized
// and parameterized; the calling code's synchronous transactions remain atomic.
// Use only for this small single-workshop workload, not a high-concurrency server.
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import path from 'node:path';

function parameterize(query, parameters) {
  let sql = query.trim(), args = parameters;
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const entries = args[0], values = [], indexes = new Map();
    sql = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      if (!Object.hasOwn(entries, name)) throw new Error('Paramètre SQL manquant : ' + name);
      if (!indexes.has(name)) { values.push(entries[name]); indexes.set(name, values.length); }
      return '$' + indexes.get(name);
    });
    args = values;
  } else {
    let inString = false, count = 0, result = '';
    for (let i = 0; i < sql.length; i++) {
      if (sql[i] === "'" && inString && sql[i + 1] === "'") { result += "''"; i++; continue; }
      if (sql[i] === "'") { inString = !inString; result += sql[i]; continue; }
      result += sql[i] === '?' && !inString ? '$' + (++count) : sql[i];
    }
    if (count !== args.length) throw new Error(`Paramètres SQL : ${count} attendus, ${args.length} reçus.`);
    sql = result;
  }
  if (/^INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql)) {
    sql = sql.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
  }
  return { sql, args };
}

export class PgSyncAdapter {
  constructor(connectionString) {
    if (!connectionString) throw new Error('DATABASE_URL est obligatoire sur Vercel.');
    const channel = new MessageChannel();
    this.port = channel.port1;
    // The Vercel worker is bundled separately into dist so pg and its transitive
    // dependencies are present even when the Function itself is file-traced.
    const workerFile = process.env.VERCEL === '1'
      ? path.resolve(process.cwd(), 'dist/pg-worker.mjs')
      : new URL('./pg-worker.js', import.meta.url);
    this.worker = new Worker(workerFile, { workerData: { connectionString }, execArgv: [] });
    this.worker.postMessage({ port: channel.port2 }, [channel.port2]);
  }
  query(sql, args = []) {
    const signal = new Int32Array(new SharedArrayBuffer(4));
    this.port.postMessage({ sql, args, signal: signal.buffer });
    if (Atomics.wait(signal, 0, 0, 25000) === 'timed-out') {
      // The connection may be unresponsive; fail rather than silently losing a write.
      throw new Error('PostgreSQL ne répond pas (25 secondes).');
    }
    const message = receiveMessageOnPort(this.port)?.message;
    if (!message) throw new Error('Réponse PostgreSQL indisponible.');
    if (message.error) { const error = new Error(message.error.message); error.code = message.error.code; throw error; }
    return message.result;
  }
  prepare(sql) {
    const execute = (params, type) => {
      const { sql: statement, args } = parameterize(sql, params);
      const result = this.query(statement, args);
      return type === 'get' ? result.rows[0] : type === 'all' ? result.rows : { changes: result.rowCount };
    };
    return { get: (...params) => execute(params, 'get'), all: (...params) => execute(params, 'all'), run: (...params) => execute(params, 'run') };
  }
  exec(sql) { return this.query(sql); }
  transaction(fn) {
    return (...args) => {
      this.query('BEGIN');
      try { const value = fn(...args); this.query('COMMIT'); return value; }
      catch (error) { try { this.query('ROLLBACK'); } catch {} throw error; }
    };
  }
  close() { this.port.close(); return this.worker.terminate(); }
}
