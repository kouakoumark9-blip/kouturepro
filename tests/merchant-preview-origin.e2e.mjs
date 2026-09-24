import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Simulate Vercel's Preview origin while using only an isolated local SQLite DB.
// Never point this test at Vercel or Neon Production. Check fail-closed guard
// with a deliberately unroutable host BEFORE any PostgreSQL driver is loaded.
const guard=spawnSync(process.execPath,['-e',"import('./server/db.js').catch(e=>{if(!e.message.includes('Base Preview non confirmée'))process.exit(2);console.log('guarded')})"],{
 cwd:process.cwd(),encoding:'utf8',timeout:10000,env:{...process.env,VERCEL:'1',VERCEL_ENV:'preview',NODE_ENV:'production',
 DATABASE_URL_UNPOOLED:'postgresql://must-not-connect.invalid/unsafe',KP_PREVIEW_DB_CONFIRMED:''}});
assert.equal(guard.status,0,guard.stderr);
assert.match(guard.stdout,/guarded/);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kp-preview-origin-'));
const port=48600+crypto.randomInt(0,400),base=`http://127.0.0.1:${port}`;
const preview='https://merchant-branch.example.test',production='https://kouturepro.example.test';
const server=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),env:{...process.env,
 DATA_DIR:dir,PORT:String(port),NODE_ENV:'production',SEED_DEMO:'0',USE_POSTGRES:'0',API_ONLY:'1',
 PUBLIC_BASE_URL:production,VERCEL_ENV:'preview',VERCEL_URL:new URL(preview).host,
 VERCEL_PROJECT_PRODUCTION_URL:new URL(production).host,VERCEL:'0',
 APP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex'),SESSION_SECRET:crypto.randomBytes(32).toString('hex'),
 RESEND_API_KEY:'',RESET_FROM_EMAIL:''
},stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',x=>output+=x);server.stderr.on('data',x=>output+=x);
try{
 let ready=false;
 for(let i=0;i<200;i++){
  if(server.exitCode!==null)throw Error('Server stopped: '+output);
  try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}
  await new Promise(done=>setTimeout(done,100));
 }
 if(!ready)throw Error('Server unavailable: '+output);
 const post=async(route,body,cookie='',merchant='')=>{
  const response=await fetch(base+route,{method:'POST',headers:{Origin:preview,
   'X-Requested-With':'KouturePro','Content-Type':'application/json',
   ...(cookie?{Cookie:cookie}:{}),...(merchant?{'X-Merchant-Id':merchant}:{})},body:JSON.stringify(body)});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 const sign=await post('/api/m-auth/sign-up/email',{name:'Preview Owner',email:`preview-${crypto.randomUUID()}@test.invalid`,password:'SecurePreview2026!'});
 assert.equal(sign.status,200,JSON.stringify(sign.data));
 assert.ok(sign.cookie?.includes('session_token='),'session created with Preview Origin');
 const registered=await post('/api/merchant/register',{business_name:'Preview Merchant',country_code:'GH',phone:'+233241234567',locale:'en'},sign.cookie);
 assert.equal(registered.status,201,JSON.stringify(registered.data));
 const invited=await post('/api/merchant/invitations',{email:'staff@test.invalid'},sign.cookie,registered.data.merchant.id);
 assert.equal(invited.status,200,JSON.stringify(invited.data));
 assert.ok(invited.data.url.startsWith(preview+'/marchands/invite/'),`wrong invitation origin: ${invited.data.url}`);
 assert.equal(invited.data.url.startsWith(production),false);
 console.log('✓ Vercel Preview uses its own origin for Better Auth and invite links even if PUBLIC_BASE_URL points to Production');
}finally{server.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true})}
