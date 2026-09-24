// Better Auth owns the merchant credentials, password reset tokens and session
// cookies. The existing atelier tables are only linked by the stable user ID;
// no legacy password is sent to the browser or re-hashed during migration.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {betterAuth} from 'better-auth';
import {getMigrations} from 'better-auth/db/migration';
import {toNodeHandler,fromNodeHeaders} from 'better-auth/node';
import {Pool} from 'pg';
import Database from 'better-sqlite3';
import {db,hostedDb,sessionKey} from './db.js';

const postgresUrl=process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const port=Number(process.env.PORT||3000);
const production=process.env.NODE_ENV==='production';
const canonical=(process.env.PUBLIC_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') || `http://127.0.0.1:${port}`).replace(/\/+$/,'');
const preview=process.env.E2B_SANDBOX_ID?`https://${port}-${process.env.E2B_SANDBOX_ID}.e2b.app`:null;
export const resetAvailable=Boolean(process.env.RESEND_API_KEY && process.env.RESET_FROM_EMAIL);
const authSecret=crypto.createHmac('sha256',sessionKey).update('kouturepro-better-auth-v1').digest('hex');
let singleton;

async function sendResetEmail({user,url}) {
 if(!resetAvailable)throw new Error('Réinitialisation par e-mail indisponible : configurez RESEND_API_KEY et RESET_FROM_EMAIL dans Vercel.');
 // Await in serverless: an unawaited request may be cancelled when the Function exits.
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',headers:{'Authorization':`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
  body:JSON.stringify({from:process.env.RESET_FROM_EMAIL,to:[user.email],subject:'Réinitialiser votre mot de passe KouturePro',
   text:`Pour choisir un nouveau mot de passe, ouvrez ce lien privé : ${url}\n\nSi vous n’avez pas fait cette demande, ignorez ce message. Le lien expire dans une heure.`})
 });
 if(!response.ok)throw new Error('Le service de courrier a refusé l’envoi du lien de réinitialisation.');
}

async function importLegacyEmailUsers(pool,local) {
 const legacy=db.prepare("SELECT id,name,email,password_hash,created_at,org_id FROM users WHERE email IS NOT NULL AND email <> '' AND password_hash <> ''").all();
 for(const user of legacy){
  if(production&&user.org_id&&db.prepare('SELECT is_demo FROM organizations WHERE id=?').get(user.org_id)?.is_demo)continue;
  const email=user.email.trim().toLowerCase();
  if(!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))continue;
  const when=user.created_at&&Date.parse(user.created_at)?new Date(user.created_at):new Date();
  if(local){
   const existing=local.prepare('SELECT id FROM "user" WHERE lower(email)=?').get(email);
   if(existing&&existing.id!==user.id)throw new Error('Conflit entre un compte Better Auth et un compte existant. Migration arrêtée.');
   local.prepare('INSERT OR IGNORE INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)')
    .run(user.id,user.name,email,0,when.getTime(),when.getTime());
   local.prepare('INSERT OR IGNORE INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)')
    .run('legacy-'+user.id,user.id,'credential',user.id,user.password_hash,when.getTime(),when.getTime());
  }else{
   const existing=await pool.query('SELECT id FROM merchant_auth."user" WHERE lower(email)=$1',[email]);
   if(existing.rows.length&&existing.rows[0].id!==user.id)throw new Error('Conflit entre un compte Better Auth et un compte existant. Migration arrêtée.');
   await pool.query('INSERT INTO merchant_auth."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,$2,$3,false,$4,$4) ON CONFLICT (id) DO NOTHING',
    [user.id,user.name,email,when]);
   await pool.query('INSERT INTO merchant_auth.account (id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6) ON CONFLICT (id) DO NOTHING',
    ['legacy-'+user.id,user.id,'credential',user.id,user.password_hash,when]);
  }
 }
}

export async function merchantAuth() {
 if(singleton)return singleton;
 singleton=(async()=>{
  let database,pool,local;
  if(hostedDb){
   if(!postgresUrl)throw new Error('L’authentification des marchands nécessite la connexion Neon existante.');
   pool=new Pool({connectionString:postgresUrl,options:'-c search_path=merchant_auth,public',max:2,connectionTimeoutMillis:9000});
   await pool.query('CREATE SCHEMA IF NOT EXISTS merchant_auth');
   database=pool;
  }else{
   const file=path.resolve(process.env.DATA_DIR||'data','merchant-auth.sqlite');
   fs.mkdirSync(path.dirname(file),{recursive:true});
   local=new Database(file);local.pragma('journal_mode=WAL');local.pragma('busy_timeout=5000');database=local;
  }
  const auth=betterAuth({
   database,secret:authSecret,baseURL:canonical,basePath:'/api/m-auth',
   advanced:{database:{validateSchema:false}}, // official migrations run below before routes are mounted
   trustedOrigins:production?[canonical]:[canonical,`http://localhost:${port}`,`http://127.0.0.1:${port}`,...(preview?[preview]:[])],
   emailAndPassword:{enabled:true,minPasswordLength:10,maxPasswordLength:72,
    password:{hash:async password=>bcrypt.hash(password,12),verify:async({hash,password})=>bcrypt.compare(password,hash)},
    sendResetPassword:sendResetEmail,resetPasswordTokenExpiresIn:3600,revokeSessionsOnPasswordReset:true},
   rateLimit:{enabled:true,storage:'database',window:60,max:80,customRules:{
    '/sign-in/email':{window:900,max:12},'/sign-up/email':{window:3600,max:10},
    '/request-password-reset':{window:900,max:6},'/reset-password':{window:900,max:8},
    '/change-password':{window:900,max:8}
   }}
  });
  // Idempotent official Better Auth migrations, serialized across Vercel cold
  // starts. A separate PostgreSQL schema leaves existing accounts untouched.
  let lock;
  try{
   if(pool){lock=await pool.connect();await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(7489417)');}
   const migration=await getMigrations(auth.options);
   await migration.runMigrations();
   await importLegacyEmailUsers(pool,local);
   if(lock)await lock.query('COMMIT');
  }catch(error){if(lock)await lock.query('ROLLBACK').catch(()=>{});throw error;}
  finally{lock?.release();}
  return auth;
 })();
 try{return await singleton}catch(error){singleton=null;throw error;}
}

export async function mountMerchantAuth(app) {
 const auth=await merchantAuth();
 app.post('/api/m-auth/request-password-reset',(req,res,next)=>{
  if(!resetAvailable)return res.status(503).json({error:'Réinitialisation indisponible : l’adresse d’envoi doit être configurée par le propriétaire du service.'});
  next();
 });
 app.all('/api/m-auth/*',toNodeHandler(auth));
}

export async function merchantSession(req) {
 const auth=await merchantAuth();
 const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
 return session?.user||null;
}
