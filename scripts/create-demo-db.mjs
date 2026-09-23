// Create a fresh, isolated SQLite database with fictional KouturePro data.
// The real data/ directory is never read or modified by this command.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const outputDir = path.resolve(process.argv[2] || path.join(projectRoot, 'demo-data'));
const realDataDir = path.join(projectRoot, 'data');
if (outputDir === projectRoot || outputDir === realDataDir || outputDir.startsWith(realDataDir + path.sep)) {
  throw new Error('Choisissez un dossier séparé de la base de données réelle (data/).');
}
for (const filename of ['kouturepro.sqlite', 'local-secrets.json']) {
  if (fs.existsSync(path.join(outputDir, filename))) {
    throw new Error(`Le dossier contient déjà ${filename}. Rien n’a été écrasé : choisissez un dossier vide.`);
  }
}
fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
process.env.DATA_DIR = outputDir;
process.env.NODE_ENV = 'development';
process.env.SEED_DEMO = '1';
// Never inherit an operator's production encryption key for fictional data.
delete process.env.APP_ENCRYPTION_KEY;
delete process.env.SESSION_SECRET;
delete process.env.DEMO_PASSWORD;

let db;
try {
  const module = await import('../server/db.js');
  db = module.db;
  await module.initialBackup;
  const tables = ['organizations', 'branches', 'users', 'clients', 'measurements', 'orders', 'payments', 'fabrics', 'suppliers', 'showcase_items', 'reviews'];
  const counts = Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]));
  if (counts.organizations !== 1 || db.prepare('SELECT is_demo FROM organizations').get()?.is_demo !== 1 || counts.clients === 0) {
    throw new Error('La base créée ne contient pas uniquement les données fictives attendues.');
  }
  if (db.pragma('integrity_check', { simple: true }) !== 'ok' || db.pragma('foreign_key_check').length) {
    throw new Error('La base fictive a échoué à la vérification d’intégrité SQLite.');
  }
  db.pragma('wal_checkpoint(TRUNCATE)');
  console.log(`Base fictive prête : ${path.join(outputDir, 'kouturepro.sqlite')}`);
  console.log(`Contenu : ${counts.clients} clients, ${counts.orders} commandes, ${counts.payments} paiements, ${counts.users} membres, ${counts.fabrics} tissus.`);
  console.log('Démo (développement uniquement) : demo@kouturepro.test / Atelier2026!');
  console.log(`Démarrer sans toucher à la vraie base : DATA_DIR=${outputDir} npm run dev`);
  console.log('Gardez local-secrets.json avec la base : il sert à déchiffrer les mesures et coordonnées fictives.');
} finally {
  db?.close();
  for (const filename of ['kouturepro.sqlite', 'local-secrets.json']) {
    const file = path.join(outputDir, filename);
    if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
  }
}
