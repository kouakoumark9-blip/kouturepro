import 'dotenv/config';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });
const secretPath = path.join(dataDir, 'local-secrets.json');
let localSecrets = {};
try { localSecrets = JSON.parse(fs.readFileSync(secretPath, 'utf8')); } catch {}
if (!localSecrets.encryptionKey || !localSecrets.sessionKey) {
  localSecrets = { encryptionKey: crypto.randomBytes(32).toString('hex'), sessionKey: crypto.randomBytes(32).toString('hex') };
  fs.writeFileSync(secretPath, JSON.stringify(localSecrets), { mode: 0o600 });
}
if (process.env.NODE_ENV === 'production' && (!process.env.APP_ENCRYPTION_KEY || !process.env.SESSION_SECRET)) {
  throw new Error('En production, APP_ENCRYPTION_KEY et SESSION_SECRET sont obligatoires.');
}
const encryptionKey = crypto.createHash('sha256').update(process.env.APP_ENCRYPTION_KEY || localSecrets.encryptionKey).digest();
export const sessionKey = process.env.SESSION_SECRET || localSecrets.sessionKey;
export const db = new Database(path.join(dataDir, 'kouturepro.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export const uuid = () => crypto.randomUUID();
export const iso = () => new Date().toISOString();
export const dateOffset = (days) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export function encrypt(value) {
  if (value == null || value === '') return '';
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, nonce);
  const body = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64');
}
export function decrypt(value) {
  if (!value) return '';
  try {
    const raw = Buffer.from(value, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch { return ''; }
}
export function encryptBuffer(value) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, nonce);
  const body = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]);
}
export function decryptBuffer(value) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]);
}

// All tenant-owned records carry org_id; query helpers in the API always scope to it.
db.exec(`
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
CREATE INDEX IF NOT EXISTS ix_clients_org ON clients(org_id);
CREATE INDEX IF NOT EXISTS ix_orders_org_due ON orders(org_id,due_date);
CREATE INDEX IF NOT EXISTS ix_payments_org ON payments(org_id);
CREATE INDEX IF NOT EXISTS ix_measures_client ON measurements(client_id);
`);

// Existing OTP-era databases had a non-null phone and no password. Rebuild only
// that table to allow email-only accounts while preserving staff/order references.
const userColumns=db.pragma('table_info(users)');
if (userColumns.find(c=>c.name==='phone')?.notnull) {
  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY, org_id TEXT REFERENCES organizations(id), branch_id TEXT REFERENCES branches(id),
        name TEXT NOT NULL, phone TEXT UNIQUE, email TEXT UNIQUE,
        password_hash TEXT NOT NULL DEFAULT '', auth_version INTEGER NOT NULL DEFAULT 1,
        role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL
      );
      INSERT INTO users_new (id,org_id,branch_id,name,phone,role,created_at)
        SELECT id,org_id,branch_id,name,phone,role,created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      COMMIT;`);
  } catch(error){if(db.inTransaction)db.exec('ROLLBACK');throw error;}
  finally{db.pragma('foreign_keys = ON');}
  if(db.pragma('foreign_key_check').length)throw new Error('Migration des comptes : références invalides.');
} else {
  const cols=new Set(userColumns.map(c=>c.name));
  if(!cols.has('email'))db.exec('ALTER TABLE users ADD COLUMN email TEXT; CREATE UNIQUE INDEX ix_users_email ON users(email)');
  if(!cols.has('password_hash'))db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
  if(!cols.has('auth_version'))db.exec('ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1');
}
// The former one-time-code storage is no longer used for authentication.
db.exec('DROP TABLE IF EXISTS otp_requests');

// Light migration for databases created before editable measurements were introduced.
if (!db.pragma('table_info(measurements)').some(c => c.name === 'version')) {
  db.exec('ALTER TABLE measurements ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
}

function seedDemo() {
  if (db.prepare('SELECT id FROM organizations WHERE is_demo=1').get()) return;
  const now = iso();
  const org = 'demo-org'; const branch = 'demo-branch';
  db.prepare(`INSERT INTO organizations (id,slug,name,description,address,city,neighborhood,whatsapp_phone,specialties,logo_url,cover_url,plan,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(org, 'atelier-kone', 'Atelier Koné', 'L’art du sur-mesure, pensé pour vous. Des créations uniques cousues avec passion à Abidjan.', 'Rue des Jardins, Deux Plateaux', 'Abidjan', 'Cocody', '+2250700000000', JSON.stringify(['Tenues de cérémonie', 'Boubous & ensembles', 'Robes sur mesure']), '', '/assets/atelier-hero.jpg', 'business', 1, now);
  db.prepare('INSERT INTO branches (id,org_id,name,address,city,phone,is_primary,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(branch, org, 'Cocody — Atelier principal', 'Rue des Jardins, Deux Plateaux', 'Abidjan', '+2250700000000', 1, now);
  const team = [
    ['demo-owner', 'Awa Koné', '+2250700000000', 'owner'],
    ['demo-tailor', 'Moussa Traoré', '+2250700000001', 'tailor'],
    ['demo-tailor2', 'Clarisse Yao', '+2250700000002', 'tailor'],
    ['demo-apprentice', 'Ismaël Bamba', '+2250700000003', 'apprentice'],
  ];
  for (const [id,name,phone,role] of team) db.prepare('INSERT INTO users (id,org_id,branch_id,name,phone,role,created_at) VALUES (?,?,?,?,?,?,?)').run(id,org,branch,name,phone,role,now);
  const clients = [
    ['c1','Aminata Traoré','+2250708234567','Cocody Riviera 3'],
    ['c2','Fatou Diabaté','+2250555123456','Marcory Zone 4'],
    ['c3','Mariam Coulibaly','+2250142445566','Plateau, Abidjan'],
    ['c4','Yacouba Koné','+2250709765432','Abobo, Abidjan'],
    ['c5','Nadia Koffi','+2250544889900','Bingerville'],
    ['c6','Aïcha Bamba','+2250109778811','Cocody Angré'],
    ['c7','Grâce Yao','+2250745001122','Yopougon'],
    ['c8','Ibrahim Diallo','+2250522334455','Koumassi'],
  ];
  for (const [id,name,phone,address] of clients) db.prepare('INSERT INTO clients (id,org_id,branch_id,name,phone_encrypted,address_encrypted,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id,org,branch,name,encrypt(phone),encrypt(address),now,now);
  const ms = [ ['Poitrine','92'],['Taille','74'],['Hanches','101'],['Épaules','40'],['Longueur robe','110'],['Tour de bras','30'] ];
  for(const [i, client] of clients.entries()) for (const [j,[type,value]] of ms.entries()) {
    db.prepare('INSERT INTO measurements (id,org_id,client_id,type,value_encrypted,unit,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(`m${i}-${j}`,org,client[0],type,encrypt(String(Number(value)+((i*3+j)%7-3))),'cm',now);
  }
  const supplier = [['sup1','Maison du Tissu','+2250701010202','Adjamé'],['sup2','Bazin Ivoire','+2250507070808','Treichville']];
  for (const [id,name,phone,city] of supplier) db.prepare('INSERT INTO suppliers (id,org_id,name,phone,city,created_at) VALUES (?,?,?,?,?,?)').run(id,org,name,phone,city,now);
  const fabrics = [
    ['f1','Wax floral indigo','Wax','Indigo',24,4500,5,'sup1'],
    ['f2','Bazin riche brodé','Bazin','Ivoire',8,9500,4,'sup2'],
    ['f3','Satin duchesse','Satin','Émeraude',3.5,6500,5,'sup1'],
    ['f4','Lin naturel','Lin','Sable',16,3800,4,'sup1'],
    ['f5','Dentelle ivoire','Dentelle','Ivoire',2,12000,3,'sup2'],
  ];
  for (const [id,name,category,color,qty,cost,threshold,sup] of fabrics) db.prepare('INSERT INTO fabrics (id,org_id,branch_id,name,category,color,quantity,unit,unit_cost,threshold,supplier_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,org,branch,name,category,color,qty,'m',cost,threshold,sup,now,now);
  const patterns=[['p1','Robe portefeuille','Robe','Coupe fluide, manches 3/4'],['p2','Boubou classique','Boubou','Broderie col et manches'],['p3','Ensemble deux pièces','Ensemble','Haut cintré et jupe longue']];
  for(const [id,name,type,description] of patterns) db.prepare('INSERT INTO patterns (id,org_id,name,garment_type,description,created_at) VALUES (?,?,?,?,?,?)').run(id,org,name,type,description,now);
  const orders = [
    ['o1','c1','Robe de cérémonie en bazin','Robe',65000,-2,3,'f2',2,'demo-tailor2',22000,25000],
    ['o2','c2','Ensemble pagne wax','Ensemble',42000,0,2,'f1',2,'demo-tailor',15000,20000],
    ['o3','c3','Boubou brodé traditionnel','Boubou',85000,2,1,'f2',2.5,'demo-tailor',26000,35000],
    ['o4','c4','Chemise col officier','Chemise',27000,4,0,'f4',2,'demo-apprentice',7600,10000],
    ['o5','c5','Tailleur deux pièces','Tailleur',90000,6,2,'f3',2,'demo-tailor2',20000,45000],
    ['o6','c6','Robe midi portefeuille','Robe',38000,9,0,'f1',2,'demo-tailor2',10500,0],
    ['o7','c7','Robe de mariage civil','Robe',120000,14,1,'f5',0,'demo-tailor',45000,60000],
    ['o8','c8','Boubou brodé ivoire','Boubou',78000,-5,4,'f2',0,'demo-tailor',27000,78000],
    ['o9','c1','Jupe longue wax','Jupe',32000,-4,4,'f1',0,'demo-tailor2',8000,32000],
  ];
  for(const [id,client,model,type,price,offset,stage,fabric,qty,assigned,cost,paid] of orders){
    const status = ['o8','o9'].includes(id)?'delivered':'active';
    db.prepare(`INSERT INTO orders (id,org_id,branch_id,client_id,reference,model,garment_type,fabric_id,fabric_source,fabric_quantity,price,material_cost,due_date,fitting_date,stage,status,assigned_user_id,commission,created_at,updated_at,delivered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,org,branch,client,`KP-${String(2600+Number(id.slice(1))).padStart(5,'0')}`,model,type,fabric,qty?'atelier':'client',qty,price,cost,dateOffset(offset),offset>1?dateOffset(offset-2):'',stage,status,assigned,Math.round(price*.08),now,now,status==='delivered'?now:'');
    if(paid) db.prepare('INSERT INTO payments (id,org_id,order_id,amount,method,status,created_at,confirmed_at) VALUES (?,?,?,?,?,?,?,?)').run(`pay-${id}`,org,id,paid,id==='o1'?'Wave':id==='o3'?'Orange Money':'Espèces','paid',now,now);
  }
  // Previous months give the charts a meaningful, honest historical baseline.
  const monthly=[ [5,2,123000],[4,6,164000],[3,1,141000],[2,5,197000],[1,7,176000] ];
  for(const [monthsBack,clientIndex,amount] of monthly){
    const date=new Date();date.setUTCMonth(date.getUTCMonth()-monthsBack);date.setUTCDate(12);
    const when=date.toISOString(), id=`history-${monthsBack}`;
    db.prepare(`INSERT INTO orders (id,org_id,branch_id,client_id,reference,model,garment_type,price,due_date,stage,status,created_at,updated_at,delivered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,org,branch,clients[clientIndex][0],`KP-${String(2500+monthsBack).padStart(5,'0')}`,'Créations sur mesure','Ensemble',amount,date.toISOString().slice(0,10),4,'delivered',when,when,when);
    db.prepare('INSERT INTO payments (id,org_id,order_id,amount,method,status,created_at,confirmed_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(`pay-${id}`,org,id,amount,'Espèces','paid',when,when);
  }
  db.prepare('INSERT INTO expenses (id,org_id,branch_id,category,label,amount,created_at) VALUES (?,?,?,?,?,?,?)').run('exp1',org,branch,'Loyer','Loyer atelier — septembre',55000,now);
  const gallery=[
    ['g1','Robe de cérémonie Aya','/assets/gallery-style.jpg','Une silhouette élégante en wax émeraude',65000],
    ['g2','Ensemble homme indigo','/assets/gallery-wax.jpg','L’élégance au quotidien, cousue pour vous',48000],
    ['g3','L’art du détail','/assets/gallery-studio.jpg','Chaque création commence par un geste juste',0],
  ];
  for(const [id,title,url,description,price] of gallery) db.prepare('INSERT INTO showcase_items (id,org_id,title,image_url,description,price,created_at) VALUES (?,?,?,?,?,?,?)').run(id,org,title,url,description,price,now);
  for(const [id,name,rating,text] of [
    ['r1','Aminata T.',5,'Une robe magnifique et livrée avec beaucoup de soin. Je recommande les yeux fermés !'],
    ['r2','Fatou D.',5,'L’équipe a vraiment compris ce que je voulais. Le résultat est parfait.'],
    ['r3','Mariam C.',5,'Des finitions impeccables et un accueil très chaleureux.'],
  ]) db.prepare('INSERT INTO reviews (id,org_id,name,rating,text,created_at) VALUES (?,?,?,?,?,?)').run(id,org,name,rating,text,now);
  db.prepare('INSERT INTO savings_plans (id,org_id,order_id,target,frequency,note,created_at) VALUES (?,?,?,?,?,?,?)').run('plan1',org,'o7',120000,'mensuel','Échelonnement pour la robe de mariage',now);
}
if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO !== '0') {
  seedDemo();
  // Development accounts still require a real password and never bypass login.
  // Only set missing hashes: restarting the server must not override changes.
  const demoPassword=process.env.DEMO_PASSWORD||'Atelier2026!';
  const hash=bcrypt.hashSync(demoPassword,12);
  db.prepare("UPDATE users SET email=? WHERE id='demo-owner' AND (email IS NULL OR email='')").run('demo@kouturepro.test');
  for(const id of ['demo-owner','demo-tailor','demo-tailor2','demo-apprentice'])
    db.prepare("UPDATE users SET password_hash=? WHERE id=? AND password_hash=''").run(hash,id);
}


export function clientOut(c){ if(!c) return null; return {...c,phone:decrypt(c.phone_encrypted),address:decrypt(c.address_encrypted),notes:decrypt(c.notes_encrypted),phone_encrypted:undefined,address_encrypted:undefined,notes_encrypted:undefined}; }
export function measurementOut(m){ if(!m) return null; return {...m,value:decrypt(m.value_encrypted),value_encrypted:undefined}; }
export function orgOut(o){ if(!o) return null; return {...o,specialties:JSON.parse(o.specialties||'[]')}; }
export function orgRow(id){ return db.prepare('SELECT * FROM organizations WHERE id=?').get(id); }
export function orgBySlug(slug){ return db.prepare('SELECT * FROM organizations WHERE slug=?').get(slug); }
export function list(table,orgId){ return db.prepare(`SELECT * FROM ${table} WHERE org_id=? ORDER BY created_at DESC`).all(orgId); }

// SQLite's online backup API produces a consistent snapshot while writes continue.
// Keep seven daily copies; production operators should additionally replicate off-site.
const backupDir = path.join(dataDir, 'backups');
fs.mkdirSync(backupDir, { recursive: true });
let backupRunning = false;
async function dailyBackup() {
  if (backupRunning) return;
  const target = path.join(backupDir, `kouturepro-${new Date().toISOString().slice(0, 10)}.sqlite`);
  if (fs.existsSync(target)) return;
  backupRunning = true;
  try {
    await db.backup(target);
    const old = fs.readdirSync(backupDir).filter(n => /^kouturepro-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n)).sort().reverse().slice(7);
    for (const name of old) fs.unlinkSync(path.join(backupDir, name));
  } catch (error) { console.error('Database backup failed:', error.message); }
  finally { backupRunning = false; }
}
dailyBackup();
setInterval(dailyBackup, 60 * 60 * 1000).unref();
