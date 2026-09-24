// Produce the same PostgreSQL tables/upgrades that the API applies at startup.
// No user credentials or fictional customer data are embedded in the SQL.
import { mkdirSync, writeFileSync } from 'node:fs';
import schema, { postgresMigrations } from '../server/schema.js';

const tableCount = (schema.match(/^CREATE TABLE IF NOT EXISTS /gm) || []).length;
const sql = `-- KouturePro : schéma de référence dans une base Neon EXISTANTE.
-- NE PAS EXÉCUTER DIRECTEMENT SUR NEON PRODUCTION. Pour une revue ou un essai,
-- utiliser uniquement une branche non productive, avec sauvegarde et droits SQL.
-- La Function applique automatiquement les migrations additives au démarrage.
-- Ne crée AUCUN compte fictif et ne modifie pas les tables Neon Auth.
-- Généré automatiquement depuis server/schema.js par npm run db:sql.
BEGIN;
SELECT pg_advisory_xact_lock(7489201);
CREATE SCHEMA IF NOT EXISTS kouturepro;
SET LOCAL search_path TO kouturepro, public;
${schema.trim()}
${postgresMigrations.map(statement => statement + ';').join('\n')}
COMMIT;

-- Contrôle sans modification : ${tableCount} tables attendues, aucune donnée fictive importée.
SELECT current_database() AS base, COUNT(*) AS tables_kouturepro
  FROM information_schema.tables
  WHERE table_schema = 'kouturepro' AND table_type = 'BASE TABLE';
SELECT COUNT(*) AS ateliers_deja_presents FROM kouturepro.organizations;
`;
mkdirSync('database', { recursive: true });
writeFileSync('database/initialiser-neon.sql', sql);
console.log('database/initialiser-neon.sql généré à partir du schéma de l’application.');
