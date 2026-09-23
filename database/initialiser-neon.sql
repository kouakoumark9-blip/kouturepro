-- KouturePro : initialisation du schéma PostgreSQL dans une base Neon EXISTANTE.
-- À exécuter dans l'éditeur SQL Neon de la bonne branche/base (Production ou Preview).
-- N'exécutez pas ce script dans une autre application par erreur. Sauvegardez une
-- base ayant déjà des données avant toute migration. Ne crée AUCUN compte fictif.
-- Les tables d'authentification Neon restent intactes dans leur propre schéma.
-- Idempotent pour un schéma KouturePro créé avec cette version.
-- Généré automatiquement depuis server/schema.js par npm run db:sql.
BEGIN;
SELECT pg_advisory_xact_lock(7489201);
CREATE SCHEMA IF NOT EXISTS kouturepro;
SET LOCAL search_path TO kouturepro, public;
CREATE TABLE IF NOT EXISTS organizations (
 id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '',
 address TEXT DEFAULT '', city TEXT DEFAULT '', neighborhood TEXT DEFAULT '', whatsapp_phone TEXT DEFAULT '',
 specialties TEXT DEFAULT '[]', logo_url TEXT DEFAULT '', cover_url TEXT DEFAULT '',
 plan TEXT DEFAULT 'starter', currency TEXT DEFAULT 'XOF', reminders_sms INTEGER DEFAULT 0,
 reminders_whatsapp INTEGER DEFAULT 0, is_demo INTEGER DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS branches (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL,
 address TEXT DEFAULT '', city TEXT DEFAULT '', phone TEXT DEFAULT '', is_primary INTEGER DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, org_id TEXT REFERENCES organizations(id), branch_id TEXT REFERENCES branches(id),
 name TEXT NOT NULL, phone TEXT UNIQUE, email TEXT UNIQUE, password_hash TEXT NOT NULL DEFAULT '',
 auth_version INTEGER NOT NULL DEFAULT 1, role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clients (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), branch_id TEXT NOT NULL REFERENCES branches(id),
 name TEXT NOT NULL, phone_encrypted TEXT NOT NULL DEFAULT '', address_encrypted TEXT NOT NULL DEFAULT '',
 notes_encrypted TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS measurements (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), client_id TEXT NOT NULL REFERENCES clients(id),
 type TEXT NOT NULL, value_encrypted TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'cm', voice_id TEXT DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS voices (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), client_id TEXT NOT NULL REFERENCES clients(id),
 mime TEXT NOT NULL, file_path TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suppliers (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL,
 phone TEXT DEFAULT '', city TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fabrics (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), branch_id TEXT NOT NULL REFERENCES branches(id),
 name TEXT NOT NULL, category TEXT DEFAULT 'Tissu', color TEXT DEFAULT '', quantity REAL NOT NULL DEFAULT 0,
 unit TEXT DEFAULT 'm', unit_cost INTEGER DEFAULT 0, threshold REAL DEFAULT 3, supplier_id TEXT REFERENCES suppliers(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patterns (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL,
 garment_type TEXT DEFAULT '', description TEXT DEFAULT '', image_url TEXT DEFAULT '', measurements_json TEXT DEFAULT '{}',
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), branch_id TEXT NOT NULL REFERENCES branches(id),
 client_id TEXT NOT NULL REFERENCES clients(id), reference TEXT NOT NULL, model TEXT NOT NULL, garment_type TEXT DEFAULT 'Tenue',
 fabric_id TEXT REFERENCES fabrics(id), fabric_source TEXT DEFAULT 'client', fabric_quantity REAL DEFAULT 0,
 pattern_id TEXT REFERENCES patterns(id), price INTEGER NOT NULL, material_cost INTEGER DEFAULT 0,
 due_date TEXT NOT NULL, fitting_date TEXT DEFAULT '', notes TEXT DEFAULT '', stage INTEGER DEFAULT 0,
 status TEXT DEFAULT 'active', assigned_user_id TEXT REFERENCES users(id), commission INTEGER DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, delivered_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS stock_movements (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), fabric_id TEXT NOT NULL REFERENCES fabrics(id),
 kind TEXT NOT NULL, quantity REAL NOT NULL, order_id TEXT REFERENCES orders(id), note TEXT DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), order_id TEXT NOT NULL REFERENCES orders(id),
 amount INTEGER NOT NULL, method TEXT NOT NULL, provider TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'paid',
 transaction_id TEXT UNIQUE, payment_url TEXT DEFAULT '', created_at TEXT NOT NULL, confirmed_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS expenses (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), branch_id TEXT NOT NULL REFERENCES branches(id),
 category TEXT NOT NULL, label TEXT NOT NULL, amount INTEGER NOT NULL, supplier_id TEXT REFERENCES suppliers(id),
 fabric_id TEXT REFERENCES fabrics(id), quantity REAL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS appointments (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, phone TEXT NOT NULL,
 preferred_date TEXT NOT NULL, message TEXT DEFAULT '', status TEXT DEFAULT 'new', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS showcase_items (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), title TEXT NOT NULL,
 image_url TEXT NOT NULL, description TEXT DEFAULT '', price INTEGER DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL,
 rating INTEGER NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS savings_plans (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), order_id TEXT NOT NULL REFERENCES orders(id),
 target INTEGER NOT NULL, frequency TEXT DEFAULT 'mensuel', note TEXT DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS savings_contributions (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), plan_id TEXT NOT NULL REFERENCES savings_plans(id),
 amount INTEGER NOT NULL, method TEXT NOT NULL DEFAULT 'espèces', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminder_log (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), order_id TEXT NOT NULL REFERENCES orders(id),
 channel TEXT NOT NULL, kind TEXT NOT NULL, date_key TEXT NOT NULL, sent_at TEXT NOT NULL,
 UNIQUE(order_id, channel, kind, date_key)
);
CREATE TABLE IF NOT EXISTS uploaded_images (
 url TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
 id TEXT PRIMARY KEY, started BIGINT NOT NULL, hits INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_clients_org ON clients(org_id);
CREATE INDEX IF NOT EXISTS ix_orders_org_due ON orders(org_id,due_date);
CREATE INDEX IF NOT EXISTS ix_payments_org ON payments(org_id);
CREATE INDEX IF NOT EXISTS ix_measures_client ON measurements(client_id);
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users(email);
COMMIT;

-- Contrôle sans modification : 21 tables attendues, aucune donnée fictive importée.
SELECT current_database() AS base, COUNT(*) AS tables_kouturepro
  FROM information_schema.tables
  WHERE table_schema = 'kouturepro' AND table_type = 'BASE TABLE';
SELECT COUNT(*) AS ateliers_deja_presents FROM kouturepro.organizations;
