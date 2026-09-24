import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {Client} from 'pg';

// Never run against Neon or a shared database. PostgreSQL test URL must point
// to a dedicated loopback database with an explicitly disposable name.
const pgUrl=process.env.TEST_MERCHANT_POSTGRES_URL;
if(pgUrl){const url=new URL(pgUrl);
 if(!['127.0.0.1','localhost','::1'].includes(url.hostname)||!/^\/merchant_validation_[a-z0-9_]+$/.test(url.pathname))
  throw Error('Refusing non-disposable PostgreSQL URL. Use a local merchant_validation_* database.');
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kp-merchant-api-'));
const port=40200+crypto.randomInt(0,700),base=`http://127.0.0.1:${port}`;
const canonical=pgUrl?'https://merchant-validation.example':base;
const mailFile=path.join(dir,'fake-mail.jsonl');
const secret=crypto.randomBytes(32).toString('hex');
const env={...process.env,DATA_DIR:dir,PORT:String(port),USE_POSTGRES:pgUrl?'1':'0',
 DATABASE_URL_UNPOOLED:pgUrl||'',NODE_ENV:pgUrl?'production':'development',API_ONLY:'1',SEED_DEMO:'0',
 APP_ENCRYPTION_KEY:secret,SESSION_SECRET:crypto.randomBytes(32).toString('hex'),PUBLIC_BASE_URL:canonical,
 RESEND_API_KEY:'local-mock-only',RESET_FROM_EMAIL:'KouturePro <reset@merchant-validation.example>',KP_TEST_MAIL_FILE:mailFile};
const server=spawn(process.execPath,['--import','./tests/support/mock-resend.mjs','server/index.js'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
async function ready(){for(let i=0;i<260;i++){
 if(server.exitCode!==null)throw Error('Server exited: '+log);
 try{if((await fetch(base+'/api/health')).ok)return}catch{}
 await new Promise(done=>setTimeout(done,100));
}throw Error('Health timeout: '+log)}
async function request(route,{method='GET',body,cookie='',merchant='',raw=false,origin=canonical}={}){
 const form=body instanceof FormData;
 const response=await fetch(base+route,{method,headers:{'X-Requested-With':'KouturePro',
  ...(merchant?{'X-Merchant-Id':merchant}:{}),...(cookie?{Cookie:cookie}:{}),
  ...(origin?{Origin:origin}:{}),...(body!==undefined&&!form?{'Content-Type':'application/json'}:{})},
  body:body===undefined?undefined:form?body:JSON.stringify(body)});
 const contentType=response.headers.get('content-type')||'';
 const data=raw?await response.text():contentType.includes('json')?await response.json():await response.text();
 return {status:response.status,data,headers:response.headers};
}
const expect=(result,status,context)=>{assert.equal(result.status,status,`${context||''}: ${JSON.stringify(result.data)}`);return result.data};
const cookie=result=>result.headers.getSetCookie?.().map(x=>x.split(';')[0]).filter(x=>x.includes('session_token')).join('; ')||
  result.headers.get('set-cookie')?.split(';')[0]||'';
let db;
async function digestOnDisk(token){
 if(pgUrl){const client=new Client({connectionString:pgUrl});await client.connect();try{
  const r=await client.query('SELECT token_hash FROM kouturepro.mp_payment_links WHERE token_hash=$1',[crypto.createHash('sha256').update(token).digest('hex')]);
  return r.rows[0]?.token_hash;
 }finally{await client.end()}}
 const row=db.prepare('SELECT token_hash FROM mp_payment_links WHERE token_hash=?').get(crypto.createHash('sha256').update(token).digest('hex'));
 return row?.token_hash;
}
try{
 await ready();
 if(!pgUrl)db=new Database(path.join(dir,'kouturepro.sqlite'),{readonly:true});
 const email=`owner-${crypto.randomUUID()}@test.invalid`,password='SecureAccount2026!';
 const sign=await request('/api/m-auth/sign-up/email',{method:'POST',body:{name:'Marchand test',email,password}});
 expect(sign,200,'signup owner');const ownerCookie=cookie(sign);assert.match(ownerCookie,/session_token=/);
 const gh=expect(await request('/api/merchant/register',{method:'POST',cookie:ownerCookie,
  body:{business_name:'Accra Payments Test',country_code:'GH',phone:'+233241234567',locale:'en'}}),201,'register GH');
 const org=gh.merchant.id;
 const countries=expect(await request('/api/merchant/countries'),200);
 assert.equal(countries.countries.length,16);assert.equal(countries.reset_email_available,true);
 const before=expect(await request('/api/merchant/dashboard',{cookie:ownerCookie,merchant:org}),200);
 assert.equal(before.merchant.currency,'GHS');assert.equal(before.merchant.decimals,2);
 const noConsentId=crypto.randomUUID();
 const noConsent=expect(await request('/api/merchant/clients',{method:'POST',cookie:ownerCookie,merchant:org,
  body:{id:noConsentId,name:'Client sans accord',phone_country:'CI',phone:'07 12 34 56 78',consent:false}}),201);
 assert.equal(noConsent.client.phone,'+2250712345678');assert.equal(noConsent.client.consent,false);
 expect(await request('/api/merchant/clients',{method:'POST',cookie:ownerCookie,merchant:org,
  body:{id:noConsentId,name:'Client sans accord',phone_country:'CI',phone:'+2250712345678',consent:false}}),200,'client idempotent');
 const unpaid=expect(await request('/api/merchant/orders',{method:'POST',cookie:ownerCookie,merchant:org,
  body:{client_id:noConsentId,description:'Opt-out order',amount_minor:1500}}),201).order;
 assert.equal(unpaid.currency,'GHS');
 expect(await request('/api/merchant/orders/'+unpaid.id+'/link',{method:'POST',cookie:ownerCookie,merchant:org}),409,'no method');
 expect(await request('/api/merchant/settings/mtn_momo',{method:'PUT',cookie:ownerCookie,merchant:org,
  body:{destination_country:'GH',destination:'+233241234568',enabled:true}}),200,'enable payment method');
 const optOutLink=expect(await request('/api/merchant/orders/'+unpaid.id+'/link',{method:'POST',cookie:ownerCookie,merchant:org}),200);
 expect(await request('/api/merchant/orders/'+unpaid.id+'/share',{method:'POST',cookie:ownerCookie,merchant:org,
  body:{url:optOutLink.url}}),403,'opt-out blocks WhatsApp/SMS share');
 const consentClient=expect(await request('/api/merchant/clients',{method:'POST',cookie:ownerCookie,merchant:org,
  body:{name:'Client avec accord',phone_country:'CI',phone:'+2250723456789',consent:true}}),201).client;
 const orderId=crypto.randomUUID();
 const order=expect(await request('/api/merchant/orders',{method:'POST',cookie:ownerCookie,merchant:org,
  body:{id:orderId,client_id:consentClient.id,description:'Article test',amount_minor:12350}}),201).order;
 assert.equal(expect(await request('/api/merchant/orders',{method:'POST',cookie:ownerCookie,merchant:org,
  body:{id:orderId,client_id:consentClient.id,description:'Article test',amount_minor:12350}}),200).order.id,order.id);
 const created=await request('/api/merchant/orders/'+order.id+'/link',{method:'POST',cookie:ownerCookie,merchant:org});
 const link=expect(created,200);assert.ok(Date.parse(link.expires_at)>Date.now()+47*3600_000);
 const token=link.url.split('/').pop();assert.match(token,/^[A-Za-z0-9_-]{43,}$/);
 assert.equal(await digestOnDisk(token),crypto.createHash('sha256').update(token).digest('hex'));
 const share=expect(await request('/api/merchant/orders/'+order.id+'/share',{method:'POST',cookie:ownerCookie,merchant:org,body:{url:link.url}}),200);
 assert.match(share.whatsapp,/^https:\/\/wa.me\/225/);assert.match(share.sms,/^sms:\+225/);
 const html=await request('/pay/'+token,{raw:true});expect(html,200,'payment HTML');
 assert.match(html.headers.get('cache-control'),/no-store/);
 assert.equal(html.headers.get('referrer-policy'),'no-referrer');assert.match(html.headers.get('x-robots-tag'),/noindex/);
 const publicInfo=expect(await request('/api/merchant/pay/'+token),200);
 assert.equal(publicInfo.decimals,2);assert.equal(publicInfo.status,'pending');assert.equal(publicInfo.methods[0].destination,'+233241234568');
 expect(await request('/api/merchant/orders/'+order.id+'/paid',{method:'POST'}),401,'anonymous cannot mark paid');
 const claim=expect(await request('/api/merchant/pay/'+token+'/claim',{method:'POST',body:{reference:'MTN-987654'}}),200);
 assert.equal(claim.status,'review');
 const otherEmail=`other-${crypto.randomUUID()}@test.invalid`;
 const otherSign=await request('/api/m-auth/sign-up/email',{method:'POST',body:{name:'Autre marchand',email:otherEmail,password}});
 expect(otherSign,200,'other signup');const otherCookie=cookie(otherSign);
 const otherOrg=expect(await request('/api/merchant/register',{method:'POST',cookie:otherCookie,
  body:{business_name:'Boutique Côte d’Ivoire',country_code:'CI',phone:'+2250701234567',locale:'fr'}}),201).merchant.id;
 assert.equal(expect(await request('/api/merchant/dashboard',{cookie:otherCookie,merchant:otherOrg}),200).orders.length,0);
 expect(await request('/api/merchant/orders/'+order.id+'/paid',{method:'POST',cookie:otherCookie,merchant:otherOrg}),404,'isolation on order');
 expect(await request('/api/merchant/orders/'+order.id+'/share',{method:'POST',cookie:otherCookie,merchant:otherOrg,body:{url:link.url}}),404,'isolation on link');
 const paid=expect(await request('/api/merchant/orders/'+order.id+'/paid',{method:'POST',cookie:ownerCookie,merchant:org}),200);
 assert.equal(paid.status,'paid');assert.match(paid.confirmation.message,/MTN-987654/);
 assert.equal(expect(await request('/api/merchant/pay/'+token),200).status,'paid');
 const audit=expect(await request('/api/merchant/dashboard',{cookie:ownerCookie,merchant:org}),200).events;
 assert.ok(audit.some(x=>x.action==='marked_paid'&&x.reference==='MTN-987654'&&x.actor_id===sign.data.user.id));
 // Explicitly test consent revocation and single-use invitations.
 expect(await request('/api/merchant/clients/'+consentClient.id+'/revoke-consent',{method:'POST',cookie:ownerCookie,merchant:org}),200);
 const invitedEmail=`staff-${crypto.randomUUID()}@test.invalid`;
 const invite=expect(await request('/api/merchant/invitations',{method:'POST',cookie:ownerCookie,merchant:org,
  body:{email:invitedEmail}}),200);
 const inviteToken=invite.url.split('/').pop();assert.match(inviteToken,/^[A-Za-z0-9_-]{43,}$/);
 expect(await request('/api/merchant/invitations/accept',{method:'POST',cookie:otherCookie,body:{token:inviteToken}}),403,'wrong invite email');
 const staffSign=await request('/api/m-auth/sign-up/email',{method:'POST',body:{name:'Personnel test',email:invitedEmail,password}});
 expect(staffSign,200,'staff signup');const staffCookie=cookie(staffSign);
 const accepted=expect(await request('/api/merchant/invitations/accept',{method:'POST',cookie:staffCookie,body:{token:inviteToken}}),200);
 assert.equal(accepted.merchant_id,org);
 expect(await request('/api/merchant/invitations/accept',{method:'POST',cookie:staffCookie,body:{token:inviteToken}}),404,'one-time invite');
 assert.equal(expect(await request('/api/merchant/dashboard',{cookie:staffCookie,merchant:org}),200).merchant.role,'personnel');
 expect(await request('/api/merchant/profile',{method:'PUT',cookie:staffCookie,merchant:org,body:{country_code:'CI',locale:'fr'}}),403,'staff cannot change country');
 expect(await request('/api/merchant/settings/mtn_momo',{method:'PUT',cookie:staffCookie,merchant:org,body:{enabled:false}}),403,'staff cannot change number');
 expect(await request('/api/merchant/settings/qr',{method:'POST',cookie:staffCookie,merchant:org,body:new FormData()}),403,'staff cannot upload QR');
 expect(await request('/api/merchant/profile',{method:'PUT',cookie:ownerCookie,merchant:org,body:{country_code:'CI',locale:'fr'}}),409,'open orders block country change');
 expect(await request('/api/merchant/orders/'+unpaid.id+'/cancel',{method:'POST',cookie:ownerCookie,merchant:org}),200);
 expect(await request('/api/merchant/profile',{method:'PUT',cookie:ownerCookie,merchant:org,
  body:{country_code:'GH',locale:'fr'}}),200,'owner may change locale');
 // A mock Resend email is deliberately captured in /tmp; no email is sent.
 expect(await request('/api/m-auth/request-password-reset',{method:'POST',body:{email,redirectTo:canonical+'/marchands/reset'}}),200,'password reset request');
 const mail=JSON.parse(fs.readFileSync(mailFile,'utf8').trim().split('\n').at(-1));
 assert.equal(mail.to[0],email);assert.match(mail.text,/réinitialisation|nouveau mot de passe/i);
 const resetUrl=mail.text.match(/https?:\/\/[^\s]+/)?.[0];assert.ok(resetUrl,'Resend mock must contain a reset URL');
 const parsedReset=new URL(resetUrl);
 const mailLink=await fetch(base+parsedReset.pathname+parsedReset.search,{redirect:'manual'});
 assert.ok([301,302,303,307].includes(mailLink.status),`Reset mail GET redirected: ${mailLink.status}`);
 const browserReset=new URL(mailLink.headers.get('location'));
 assert.equal(browserReset.origin,canonical);
 assert.equal(browserReset.pathname,'/marchands/reset');
 const resetToken=browserReset.searchParams.get('token');assert.ok(resetToken,'No token in browser reset URL');
 expect(await request('/api/m-auth/reset-password',{method:'POST',body:{token:resetToken,newPassword:'NewSecureAccount2026!'}}),200,'reset password');
 const stale=expect(await request('/api/m-auth/get-session',{cookie:ownerCookie}),200);
 assert.equal(stale?.user??null,null,'old merchant session revoked after password reset');
 expect(await request('/api/m-auth/sign-in/email',{method:'POST',body:{email,password}}),401,'old password invalid');
 const relog=await request('/api/m-auth/sign-in/email',{method:'POST',body:{email,password:'NewSecureAccount2026!'}});
 expect(relog,200,'new password valid');
 const newCookie=cookie(relog);assert.equal(expect(await request('/api/merchant/dashboard',{cookie:newCookie,merchant:org}),200).orders.length,2);
 if(!pgUrl){
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+U1D0AAAAASUVORK5CYII=','base64');
  const upload=new FormData();upload.append('image',new Blob([image],{type:'image/png'}),'qr.png');
  const qr=expect(await request('/api/merchant/settings/qr',{method:'POST',cookie:newCookie,merchant:org,body:upload}),201);
  assert.match(qr.url,/^\/uploads\//);
  expect(await request('/api/merchant/settings/mtn_momo',{method:'PUT',cookie:newCookie,merchant:org,
   body:{destination_country:'GH',destination:'+233241234568',qr_url:qr.url,enabled:true}}),200,'enable QR');
 }
 // Per-IP and per-token claim limits persist across requests. Use a fresh link
 // to avoid already-paid status and keep all attempts inside the disposable DB.
 const spamOrder=expect(await request('/api/merchant/orders',{method:'POST',cookie:newCookie,merchant:org,
  body:{client_id:noConsentId,description:'Rate limit test',amount_minor:1000}}),201).order;
 const spamLink=expect(await request('/api/merchant/orders/'+spamOrder.id+'/link',{method:'POST',cookie:newCookie,merchant:org}),200).url.split('/').pop();
 for(let i=0;i<8;i++)expect(await request('/api/merchant/pay/'+spamLink+'/claim',{method:'POST',body:{reference:'TEST-'+i}}),200,'claim limit #'+i);
 expect(await request('/api/merchant/pay/'+spamLink+'/claim',{method:'POST',body:{reference:'TEST-9'}}),429,'claim rate limit');
 // Owner can deactivate team access immediately without deleting old orders.
 expect(await request('/api/merchant/team/'+staffSign.data.user.id,{method:'PATCH',cookie:newCookie,merchant:org,body:{active:false}}),200);
 expect(await request('/api/merchant/dashboard',{cookie:staffCookie,merchant:org}),403,'disabled staff');
 let signInLimited=false;
 for(let i=0;i<20;i++){
  const attempt=await request('/api/m-auth/sign-in/email',{method:'POST',body:{email:'not-registered@test.invalid',password:'WrongPassword2026!'}});
  assert.ok([401,429].includes(attempt.status),`Bad login should fail: ${attempt.status} ${JSON.stringify(attempt.data)}`);
  if(attempt.status===429){signInLimited=true;break;}
 }
 assert.equal(signInLimited,true,'Better Auth sign-in rate limit must be enforced');
 let resetLimited=false;
 for(let i=0;i<10;i++){
  const attempt=await request('/api/m-auth/request-password-reset',{method:'POST',body:{email:`missing${i}@test.invalid`,redirectTo:canonical+'/marchands/reset'}});
  assert.ok([200,429].includes(attempt.status),`Reset request should be private and limited: ${attempt.status}`);
  if(attempt.status===429){resetLimited=true;break;}
 }
 assert.equal(resetLimited,true,'Better Auth reset rate limit must be enforced');
 console.log(`✓ ${pgUrl?'PostgreSQL':'SQLite'} manual payments, consent, QR (SQLite only), isolation, invitation, reset mock, rate limits`);
}finally{
 db?.close();server.kill('SIGTERM');
 fs.rmSync(dir,{recursive:true,force:true});
}
