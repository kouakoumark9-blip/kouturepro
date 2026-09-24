-- KouturePro : schéma de référence dans une base Neon EXISTANTE.
-- NE PAS EXÉCUTER DIRECTEMENT SUR NEON PRODUCTION. Pour une revue ou un essai,
-- utiliser uniquement une branche non productive, avec sauvegarde et droits SQL.
-- La Function applique automatiquement les migrations additives au démarrage.
-- Ne crée AUCUN compte fictif et ne modifie pas les tables Neon Auth.
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
-- Shared country/operator configuration. These are initial data, not JS runtime
-- constants; the owner may choose providers and the catalogue can be edited.
CREATE TABLE IF NOT EXISTS mp_countries (
 code TEXT PRIMARY KEY, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
 flag TEXT NOT NULL, dial_code TEXT NOT NULL, currency TEXT NOT NULL,
 decimals INTEGER NOT NULL DEFAULT 2, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS mp_operators (
 code TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'mobile_money'
);
CREATE TABLE IF NOT EXISTS mp_country_operators (
 country_code TEXT NOT NULL REFERENCES mp_countries(code),
 operator_code TEXT NOT NULL REFERENCES mp_operators(code),
 suggested INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(country_code,operator_code)
);
CREATE TABLE IF NOT EXISTS mp_merchant_profiles (
 org_id TEXT PRIMARY KEY REFERENCES organizations(id),
 country_code TEXT NOT NULL REFERENCES mp_countries(code),
 locale TEXT NOT NULL DEFAULT 'fr', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mp_memberships (
 user_id TEXT NOT NULL, org_id TEXT NOT NULL REFERENCES organizations(id),
 role TEXT NOT NULL DEFAULT 'personnel', active INTEGER NOT NULL DEFAULT 1,
 email TEXT NOT NULL DEFAULT '', joined_at TEXT NOT NULL, PRIMARY KEY(user_id,org_id)
);
CREATE INDEX IF NOT EXISTS ix_mp_memberships_org ON mp_memberships(org_id,active);
CREATE TABLE IF NOT EXISTS mp_clients (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
 name TEXT NOT NULL, phone_country TEXT NOT NULL REFERENCES mp_countries(code),
 phone_encrypted TEXT NOT NULL, phone_lookup TEXT NOT NULL,
 notes_encrypted TEXT NOT NULL DEFAULT '', consent INTEGER NOT NULL DEFAULT 0,
 consent_at TEXT DEFAULT '', consent_revoked_at TEXT DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(org_id,id)
);
CREATE INDEX IF NOT EXISTS ix_mp_clients_org_name ON mp_clients(org_id,name);
CREATE INDEX IF NOT EXISTS ix_mp_clients_org_phone ON mp_clients(org_id,phone_lookup);
CREATE TABLE IF NOT EXISTS mp_orders (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
 client_id TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 amount_minor BIGINT NOT NULL, currency TEXT NOT NULL, country_code TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', created_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(org_id,id),
 FOREIGN KEY(org_id,client_id) REFERENCES mp_clients(org_id,id)
);
CREATE INDEX IF NOT EXISTS ix_mp_orders_org_status ON mp_orders(org_id,status,created_at);
CREATE TABLE IF NOT EXISTS mp_payment_settings (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
 operator_code TEXT NOT NULL REFERENCES mp_operators(code),
 enabled INTEGER NOT NULL DEFAULT 0, destination_encrypted TEXT NOT NULL DEFAULT '',
 destination_country TEXT DEFAULT NULL REFERENCES mp_countries(code),
 bank_encrypted TEXT NOT NULL DEFAULT '', qr_url TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL, UNIQUE(org_id,operator_code)
);
CREATE TABLE IF NOT EXISTS mp_payment_links (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
 order_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL, revoked_at TEXT DEFAULT '', created_at TEXT NOT NULL,
 UNIQUE(org_id,id,order_id),
 FOREIGN KEY(org_id,order_id) REFERENCES mp_orders(org_id,id)
);
CREATE INDEX IF NOT EXISTS ix_mp_links_order ON mp_payment_links(org_id,order_id);
CREATE TABLE IF NOT EXISTS mp_payment_claims (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
 order_id TEXT NOT NULL, link_id TEXT NOT NULL, reference TEXT NOT NULL,
 submitted_at TEXT NOT NULL,
 FOREIGN KEY(org_id,link_id,order_id) REFERENCES mp_payment_links(org_id,id,order_id)
);
CREATE TABLE IF NOT EXISTS mp_payment_events (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
 order_id TEXT NOT NULL, action TEXT NOT NULL, actor_id TEXT DEFAULT '',
 actor_name TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '',
 previous_status TEXT NOT NULL, new_status TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(org_id,order_id) REFERENCES mp_orders(org_id,id)
);
CREATE INDEX IF NOT EXISTS ix_mp_events_order ON mp_payment_events(org_id,order_id,created_at);
CREATE TABLE IF NOT EXISTS mp_message_templates (
 org_id TEXT NOT NULL REFERENCES organizations(id), locale TEXT NOT NULL,
 kind TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(org_id,locale,kind)
);
CREATE TABLE IF NOT EXISTS mp_invitations (
 id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
 email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL,
 expires_at TEXT NOT NULL, used_at TEXT DEFAULT '', revoked_at TEXT DEFAULT '',
 created_at TEXT NOT NULL
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
ALTER TABLE mp_memberships ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE mp_payment_settings ADD COLUMN IF NOT EXISTS destination_country TEXT DEFAULT NULL REFERENCES mp_countries(code);
COMMIT;

-- Contrôle sans modification : 34 tables attendues, aucune donnée fictive importée.
SELECT current_database() AS base, COUNT(*) AS tables_kouturepro
  FROM information_schema.tables
  WHERE table_schema = 'kouturepro' AND table_type = 'BASE TABLE';
SELECT COUNT(*) AS ateliers_deja_presents FROM kouturepro.organizations;
