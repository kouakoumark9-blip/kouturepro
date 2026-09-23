import { parentPort, workerData } from 'node:worker_threads';
import pg from 'pg';

// INTEGER columns and ordinary sums fit in JS's exact integer range for this app.
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);
const pool = new pg.Pool({ connectionString: workerData.connectionString, max: 1, connectionTimeoutMillis: 12000,
  idleTimeoutMillis: 15000, statement_timeout: 18000, application_name: 'kouturepro-vercel',
  options: '-c search_path=kouturepro,public' });
let transactionClient;
parentPort.once('message', ({ port }) => {
  port.on('message', async ({ sql, args, signal }) => {
    let result, error;
    try {
      if (sql === 'BEGIN') {
        if (transactionClient) throw new Error('Transaction déjà ouverte.');
        transactionClient = await pool.connect();
        await transactionClient.query('BEGIN');
        result = { rows: [], rowCount: 0 };
      } else if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        if (!transactionClient) throw new Error('Aucune transaction ouverte.');
        try { await transactionClient.query(sql); }
        finally { transactionClient.release(); transactionClient = undefined; }
        result = { rows: [], rowCount: 0 };
      } else {
        const reply = await (transactionClient || pool).query(sql, args);
        result = { rows: reply.rows || [], rowCount: reply.rowCount || 0 };
      }
    } catch (e) { error = { message: e.message, code: e.code }; }
    port.postMessage({ result, error });
    const status = new Int32Array(signal);
    Atomics.store(status, 0, 1);
    Atomics.notify(status, 0);
  });
});
