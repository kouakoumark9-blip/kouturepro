// Manual merchant payments: this module never calls a payment, SMS or WhatsApp
// provider. All tenant IDs come from a verified Better Auth session. Public
// links store only a SHA-256 digest, expire after 48h and cannot mark paid.
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import {parsePhoneNumberFromString} from 'libphonenumber-js';
import {db,hostedDb,uuid,iso,encrypt,decrypt,sessionKey} from './db.js';
import {merchantSession} from './merchant-auth.js';

const error=(status,message)=>Object.assign(new Error(message),{status});
const asyncRoute=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res,next)).catch(next);
const value=(v,max=200)=>String(v??'').trim().slice(0,max);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function mutationId(raw){
 if(raw===undefined)return uuid();
 if(typeof raw!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw))throw error(400,'Identifiant de synchronisation invalide.');
 return raw;
}
const e164=/^\+[1-9][0-9]{1,14}$/;
const qrUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024},fileFilter:(req,file,cb)=>cb(null,['image/png','image/jpeg','image/webp'].includes(file.mimetype))});
const localLimits=new Map();
function rateLimit(ip,scope,max,period){
 const key=crypto.createHmac('sha256',sessionKey).update(`merchant-pay:${scope}:${ip}`).digest('hex'),now=Date.now();
 if(hostedDb){
  const row=db.prepare(`INSERT INTO rate_limits(id,started,hits) VALUES (?,?,1)
   ON CONFLICT(id) DO UPDATE SET hits=CASE WHEN rate_limits.started<? THEN 1 ELSE rate_limits.hits+1 END,
   started=CASE WHEN rate_limits.started<? THEN ? ELSE rate_limits.started END RETURNING hits`)
   .get(key,now,now-period,now-period,now);
  if(row.hits>max)throw error(429,'Trop de demandes. Réessayez dans quelques minutes.');
 }else{
  const prev=localLimits.get(key);const entry=prev&&now-prev.started<period?prev:{started:now,hits:0};
  if(++entry.hits>max)throw error(429,'Trop de demandes. Réessayez dans quelques minutes.');
  localLimits.set(key,entry);
  if(localLimits.size>20000)for(const[k,v]of localLimits)if(now-v.started>period)localLimits.delete(k);
 }
}
function phoneNumber(raw,country){
 const matched=db.prepare('SELECT code FROM mp_countries WHERE code=? AND active=1').get(country);
 if(!matched)throw error(400,'Choisissez un pays valide.');
 const parsed=parsePhoneNumberFromString(String(raw||'').trim(),country);
 if(!parsed?.isValid()||parsed.country!==country||!e164.test(parsed.number))throw error(400,'Vérifiez le numéro et son indicatif international.');
 return parsed.number;
}
function merchantClient(req,id){
 const client=db.prepare('SELECT * FROM mp_clients WHERE id=? AND org_id=?').get(id,req.member.org_id);
 if(!client)throw error(404,'Client introuvable.');return client;
}
function merchantOrder(req,id){
 const order=db.prepare('SELECT * FROM mp_orders WHERE id=? AND org_id=?').get(id,req.member.org_id);
 if(!order)throw error(404,'Commande introuvable.');return order;
}
const clientOut=c=>({id:c.id,name:c.name,phone_country:c.phone_country,phone:decrypt(c.phone_encrypted),notes:decrypt(c.notes_encrypted),
 consent:!!c.consent,consent_at:c.consent_at||'',consent_revoked_at:c.consent_revoked_at||'',created_at:c.created_at});
const orderOut=o=>({...o,amount_minor:Number(o.amount_minor)});
function requireOwner(req){if(req.member.role!=='marchand')throw error(403,'Seul le propriétaire peut modifier ces paramètres.');}
function restoreLegacyOwner(user){
 // A Better Auth migration keeps the historical user ID, but a profile may
 // have been created before memberships existed. Link only that same legacy
 // owner, never an account merely sharing an e-mail or a staff role.
 const row=db.prepare(`SELECT u.org_id,u.email,u.role,o.is_demo FROM users u
  JOIN organizations o ON o.id=u.org_id JOIN mp_merchant_profiles p ON p.org_id=u.org_id WHERE u.id=?`).get(user.id);
 if(row?.role==='owner'&&row.email?.toLowerCase()===user.email.toLowerCase()&&
    (process.env.NODE_ENV!=='production'||!row.is_demo))
  db.prepare('INSERT OR IGNORE INTO mp_memberships(user_id,org_id,role,email,joined_at) VALUES (?,?,?,?,?)')
   .run(user.id,row.org_id,'marchand',user.email.toLowerCase(),iso());
}
function templateSeed(orgId){
 const now=iso();for(const [locale,kind,body] of [
  ['fr','payment_link','Bonjour {client}, pour votre commande chez {entreprise}, le montant à régler est de {montant}. Voici votre lien de paiement : {lien}'],
  ['fr','payment_confirmed','Bonjour {client}, votre paiement de {montant} pour {entreprise} a été vérifié et confirmé. Référence : {reference}. Merci !'],
  ['en','payment_link','Hello {client}, the amount due for your order with {entreprise} is {montant}. Here is your payment link: {lien}'],
  ['en','payment_confirmed','Hello {client}, your payment of {montant} to {entreprise} has been checked and confirmed. Reference: {reference}. Thank you!']
 ])db.prepare('INSERT OR IGNORE INTO mp_message_templates(org_id,locale,kind,body,updated_at) VALUES (?,?,?,?,?)').run(orgId,locale,kind,body,now);
}
function textMessage(req,kind,order,client,url,reference){
 templateSeed(req.member.org_id);
 const locale=req.member.locale==='en'?'en':'fr',t=db.prepare('SELECT body FROM mp_message_templates WHERE org_id=? AND locale=? AND kind=?').get(req.member.org_id,locale,kind);
 const amount=Number(order.amount_minor)/10**req.member.decimals;
 const formatted=new Intl.NumberFormat(locale==='fr'?'fr-FR':'en-GB',{style:'currency',currency:order.currency,maximumFractionDigits:req.member.decimals,minimumFractionDigits:req.member.decimals}).format(amount);
 return t.body.replace(/\{(client|entreprise|montant|lien|reference)\}/g,(_,field)=>({client:client.name,entreprise:req.member.business_name,montant:formatted,lien:url||'',reference:reference||''})[field]);
}
function shareLinks(number,message){return {whatsapp:`https://wa.me/${number.slice(1)}?text=${encodeURIComponent(message)}`,
 sms:`sms:${number}?body=${encodeURIComponent(message)}`,message};}
function validToken(raw){return typeof raw==='string'&&/^[A-Za-z0-9_-]{43,128}$/.test(raw);}
function publicLink(raw){
 if(!validToken(raw))throw error(404,'Lien de paiement invalide ou expiré.');
 const link=db.prepare('SELECT * FROM mp_payment_links WHERE token_hash=?').get(sha(raw));
 if(!link||link.revoked_at||Date.parse(link.expires_at)<=Date.now())throw error(404,'Lien de paiement invalide ou expiré.');
 const order=db.prepare('SELECT * FROM mp_orders WHERE id=? AND org_id=?').get(link.order_id,link.org_id);
 if(!order||order.status==='cancelled')throw error(404,'Cette commande n’est plus disponible.');
 return {link,order};
}

export function mountMerchantApi(app,{baseUrl}) {
 const member=async(req,res,next)=>{
  try{
   const session=await merchantSession(req);
   if(!session)throw error(401,'Connectez-vous pour continuer.');
   restoreLegacyOwner(session);
   const chosen=value(req.get('X-Merchant-Id'),80),memberships=db.prepare(`SELECT m.*,p.country_code,p.locale,c.currency,c.decimals,o.name AS business_name
    FROM mp_memberships m JOIN mp_merchant_profiles p ON p.org_id=m.org_id
    JOIN mp_countries c ON c.code=p.country_code JOIN organizations o ON o.id=m.org_id
    WHERE m.user_id=? AND m.active=1`).all(session.id);
   const profile=chosen?memberships.find(m=>m.org_id===chosen):memberships.length===1?memberships[0]:null;
   if(!profile)throw error(403,memberships.length>1?'Choisissez votre entreprise.':'Terminez la création ou l’invitation de votre entreprise.');
   req.merchantUser=session;req.member=profile;next();
  }catch(e){next(e);}
 };
 app.get('/api/merchant/memberships',asyncRoute(async(req,res)=>{
  const user=await merchantSession(req);if(!user)throw error(401,'Connectez-vous pour continuer.');
  restoreLegacyOwner(user);
  const rows=db.prepare(`SELECT m.org_id,m.role,m.active,o.name,p.country_code,p.locale
   FROM mp_memberships m JOIN organizations o ON o.id=m.org_id JOIN mp_merchant_profiles p ON p.org_id=m.org_id
   WHERE m.user_id=? AND m.active=1`).all(user.id);
  res.json({memberships:rows});
 }));
 app.put('/api/merchant/profile',member,asyncRoute((req,res)=>{
  requireOwner(req);
  const country=value(req.body?.country_code,2).toUpperCase(),locale=req.body?.locale;
  if(!['fr','en'].includes(locale)||!db.prepare('SELECT 1 FROM mp_countries WHERE code=? AND active=1').get(country))
   throw error(400,'Pays ou langue indisponible.');
  const changedCountry=country!==req.member.country_code,now=iso();
  if(changedCountry&&db.prepare("SELECT id FROM mp_orders WHERE org_id=? AND status IN ('pending','review') LIMIT 1").get(req.member.org_id))
   throw error(409,'Terminez ou annulez les commandes ouvertes avant de changer de pays et de devise.');
  db.transaction(()=>{
   if(changedCountry){
    // Historical paid orders retain their original currency. Numbers and QR
    // codes of the previous country must be reconfigured before new links.
    db.prepare('UPDATE mp_payment_settings SET enabled=0,updated_at=? WHERE org_id=?').run(now,req.member.org_id);
   }
   db.prepare('UPDATE mp_merchant_profiles SET country_code=?,locale=? WHERE org_id=?').run(country,locale,req.member.org_id);
  })();
  res.json({ok:true,country_code:country,locale,links_revoked:changedCountry});
 }));
 app.get('/api/merchant/dashboard',member,asyncRoute((req,res)=>{
  const id=req.member.org_id;
  templateSeed(id);
  res.json({merchant:{id,name:req.member.business_name,country_code:req.member.country_code,locale:req.member.locale,
   currency:req.member.currency,decimals:req.member.decimals,role:req.member.role},
   clients:db.prepare('SELECT * FROM mp_clients WHERE org_id=? ORDER BY created_at DESC').all(id).map(clientOut),
   orders:db.prepare('SELECT * FROM mp_orders WHERE org_id=? ORDER BY created_at DESC').all(id).map(orderOut),
   settings:db.prepare(`SELECT s.id,s.operator_code,o.name AS operator_name,s.enabled,s.destination_encrypted,s.destination_country,s.bank_encrypted,s.qr_url
    FROM mp_payment_settings s JOIN mp_operators o ON o.code=s.operator_code WHERE s.org_id=? ORDER BY o.name`).all(id)
    .map(s=>({id:s.id,operator_code:s.operator_code,name:s.operator_name,enabled:!!s.enabled,
     destination:decrypt(s.destination_encrypted),destination_country:s.destination_country||req.member.country_code,
     bank_instructions:decrypt(s.bank_encrypted),qr_url:s.qr_url})),
   templates:db.prepare('SELECT locale,kind,body FROM mp_message_templates WHERE org_id=?').all(id),
   team:req.member.role==='marchand'?db.prepare('SELECT user_id,role,email,active,joined_at FROM mp_memberships WHERE org_id=?').all(id):
    db.prepare('SELECT user_id,role,email,active,joined_at FROM mp_memberships WHERE org_id=? AND user_id=?').all(id,req.merchantUser.id),
   invitations:req.member.role==='marchand'?db.prepare('SELECT id,email,expires_at,used_at,revoked_at FROM mp_invitations WHERE org_id=? ORDER BY created_at DESC LIMIT 30').all(id):[],
   events:db.prepare('SELECT * FROM mp_payment_events WHERE org_id=? ORDER BY created_at DESC LIMIT 100').all(id)});
 }));
 app.post('/api/merchant/clients',member,asyncRoute((req,res)=>{
  const country=value(req.body?.phone_country,2).toUpperCase()||req.member.country_code,phone=phoneNumber(req.body?.phone,country);
  const name=value(req.body?.name,120);if(name.length<2)throw error(400,'Indiquez le nom du client.');
  const notes=value(req.body?.notes,1500),consent=req.body?.consent===true,now=iso(),id=mutationId(req.body?.id);
  const existing=db.prepare('SELECT * FROM mp_clients WHERE org_id=? AND id=?').get(req.member.org_id,id);
  if(existing)return res.json({client:clientOut(existing)});
  const lookup=crypto.createHmac('sha256',sessionKey).update(`${req.member.org_id}:${phone}`).digest('hex');
  db.prepare(`INSERT INTO mp_clients(id,org_id,name,phone_country,phone_encrypted,phone_lookup,notes_encrypted,
   consent,consent_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
   .run(id,req.member.org_id,name,country,encrypt(phone),lookup,encrypt(notes),consent?1:0,consent?now:'',now,now);
  res.status(201).json({client:clientOut(merchantClient(req,id))});
 }));
 app.get('/api/merchant/clients/search',member,asyncRoute((req,res)=>{
  const q=value(req.query.q,120).toLowerCase();if(!q)return res.json({clients:[]});
  let phone='';if(/^\+?[\d\s().-]{7,25}$/.test(q))try{phone=phoneNumber(q,req.member.country_code);}catch{}
  const lookup=phone?crypto.createHmac('sha256',sessionKey).update(`${req.member.org_id}:${phone}`).digest('hex'):'';
  const clients=db.prepare('SELECT * FROM mp_clients WHERE org_id=? AND (lower(name) LIKE ? OR phone_lookup=?) LIMIT 30')
   .all(req.member.org_id,'%'+q.replace(/[%_]/g,'\\$&')+'%',lookup).map(clientOut);
  res.json({clients});
 }));
 app.post('/api/merchant/orders',member,asyncRoute((req,res)=>{
  const client=merchantClient(req,value(req.body?.client_id,80)),description=value(req.body?.description,240);
  const amount=Number(req.body?.amount_minor);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000000)throw error(400,'Montant invalide dans la devise de votre pays.');
  const id=mutationId(req.body?.id),now=iso();
  const existing=db.prepare('SELECT * FROM mp_orders WHERE org_id=? AND id=?').get(req.member.org_id,id);
  if(existing)return res.json({order:orderOut(existing)});
  db.prepare(`INSERT INTO mp_orders(id,org_id,client_id,description,amount_minor,currency,country_code,status,created_by,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,req.member.org_id,client.id,description,amount,req.member.currency,req.member.country_code,'pending',req.merchantUser.id,now,now);
  res.status(201).json({order:orderOut(merchantOrder(req,id))});
 }));
 app.put('/api/merchant/settings/:code',member,asyncRoute((req,res)=>{
  requireOwner(req);
  const operator=value(req.params.code,60);
  if(!db.prepare('SELECT 1 FROM mp_country_operators WHERE country_code=? AND operator_code=?').get(req.member.country_code,operator))
   throw error(400,'Cet opérateur n’est pas proposé pour votre pays.');
  const item=db.prepare('SELECT * FROM mp_payment_settings WHERE org_id=? AND operator_code=?').get(req.member.org_id,operator);
  const enabled=req.body?.enabled===true,destination=value(req.body?.destination,40),bank=value(req.body?.bank_instructions,600),qr=value(req.body?.qr_url,500);
  const country=value(req.body?.destination_country||req.member.country_code,2).toUpperCase();
  if(!db.prepare('SELECT 1 FROM mp_countries WHERE code=? AND active=1').get(country))throw error(400,'Indicatif de paiement invalide.');
  let number='';if(destination)number=phoneNumber(destination,country);
  if(qr&&!db.prepare('SELECT 1 FROM uploaded_images WHERE org_id=? AND url=?').get(req.member.org_id,qr))throw error(400,'Importez votre QR depuis votre compte.');
  if(enabled&&!number&&!bank&&!qr)throw error(400,'Ajoutez un numéro, un virement ou un QR avant d’activer ce moyen.');
  const id=item?.id||uuid(),now=iso();
  if(item)db.prepare('UPDATE mp_payment_settings SET enabled=?,destination_encrypted=?,destination_country=?,bank_encrypted=?,qr_url=?,updated_at=? WHERE id=? AND org_id=?')
   .run(enabled?1:0,encrypt(number),country,encrypt(bank),qr,now,id,req.member.org_id);
  else db.prepare('INSERT INTO mp_payment_settings(id,org_id,operator_code,enabled,destination_encrypted,destination_country,bank_encrypted,qr_url,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
   .run(id,req.member.org_id,operator,enabled?1:0,encrypt(number),country,encrypt(bank),qr,now);
  res.json({ok:true,id});
 }));
 app.post('/api/merchant/settings/qr',member,qrUpload.single('image'),asyncRoute(async(req,res)=>{
  requireOwner(req);
  if(!req.file)throw error(400,'QR au format PNG, JPG ou WebP, 2 Mo maximum.');
  const head=req.file.buffer,valid=req.file.mimetype==='image/png'?head.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
   req.file.mimetype==='image/jpeg'?head[0]===255&&head[1]===216&&head[2]===255:
   head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP';
  if(!valid)throw error(400,'Le fichier ne contient pas une image du format annoncé.');
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[req.file.mimetype],name=`${uuid()}.${ext}`;
  let url;
  if(hostedDb){const {put}=await import('@vercel/blob');url=(await put(`merchant-qr/${req.member.org_id}/${name}`,head,{access:'public',contentType:req.file.mimetype})).url;}
  else{const dir=path.resolve(process.env.DATA_DIR||'data','public-uploads');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),head);url='/uploads/'+name;}
  db.prepare('INSERT INTO uploaded_images(url,org_id,created_at) VALUES (?,?,?)').run(url,req.member.org_id,iso());
  res.status(201).json({url});
 }));
 app.post('/api/merchant/orders/:id/link',member,asyncRoute((req,res)=>{
  const order=merchantOrder(req,req.params.id);
  if(!['pending','review'].includes(order.status))throw error(409,'Cette commande ne peut plus recevoir un lien de paiement.');
  if(order.country_code!==req.member.country_code)throw error(409,'Cette commande appartient à un ancien pays. Réglez-la avant de modifier le pays, ou créez une nouvelle commande.');
  const active=db.prepare('SELECT id FROM mp_payment_settings WHERE org_id=? AND enabled=1 LIMIT 1').get(req.member.org_id);
  if(!active)throw error(409,'Activez un moyen de paiement avant de partager un lien.');
  const token=crypto.randomBytes(32).toString('base64url'),now=iso(),expires=new Date(Date.now()+48*3600*1000).toISOString(),id=uuid();
  db.prepare('INSERT INTO mp_payment_links(id,org_id,order_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)')
   .run(id,req.member.org_id,order.id,sha(token),expires,now);
  const origin=baseUrl||`http://127.0.0.1:${process.env.PORT||3000}`;
  res.set('Cache-Control','no-store');res.json({url:`${origin}/pay/${token}`,expires_at:expires,link_id:id});
 }));
 app.post('/api/merchant/orders/:id/share',member,asyncRoute((req,res)=>{
  const order=merchantOrder(req,req.params.id),client=merchantClient(req,order.client_id);
  if(!['pending','review'].includes(order.status))throw error(409,'Cette commande ne peut plus recevoir de lien.');
  if(!client.consent||client.consent_revoked_at)throw error(403,'Le client n’a pas donné son accord pour être contacté.');
  // The original token cannot be retrieved from its hash. Pass it in a POST
  // body so it is not exposed in reverse-proxy URL logs or browser history.
  const url=value(req.body?.url,600);
  if(!url)throw error(400,'Créez un nouveau lien pour préparer le message.');
  let parsed;try{parsed=new URL(url);}catch{throw error(400,'Lien invalide.');}
  const token=parsed.pathname.match(/^\/pay\/([A-Za-z0-9_-]{43,128})$/)?.[1];
  if(parsed.origin!==(baseUrl||`http://127.0.0.1:${process.env.PORT||3000}`)||!token||parsed.search||parsed.hash)throw error(400,'Lien invalide.');
  const valid=db.prepare('SELECT id FROM mp_payment_links WHERE org_id=? AND order_id=? AND token_hash=? AND revoked_at=? AND expires_at>?')
   .get(req.member.org_id,order.id,sha(token),'',iso());
  if(!valid)throw error(400,'Le lien de paiement ne correspond pas à cette commande.');
  const message=textMessage(req,'payment_link',order,client,url,'');
  res.set('Cache-Control','no-store');res.json(shareLinks(decrypt(client.phone_encrypted),message));
 }));
 app.put('/api/merchant/templates/:locale/:kind',member,asyncRoute((req,res)=>{
  requireOwner(req);
  const {locale,kind}=req.params,body=value(req.body?.body,2000);
  if(!['fr','en'].includes(locale)||!['payment_link','payment_confirmed'].includes(kind)||!body)throw error(400,'Modèle de message invalide.');
  if(/\{[^{}]*\}/.test(body.replace(/\{(?:client|entreprise|montant|lien|reference)\}/g,'')))throw error(400,'Utilisez uniquement les variables proposées.');
  templateSeed(req.member.org_id);
  db.prepare('UPDATE mp_message_templates SET body=?,updated_at=? WHERE org_id=? AND locale=? AND kind=?')
   .run(body,iso(),req.member.org_id,locale,kind);
  res.json({ok:true});
 }));
 app.get('/api/merchant/pay/:token',asyncRoute((req,res)=>{
  rateLimit(req.ip,'read-ip',200,15*60*1000);
  rateLimit(req.ip,'read:'+sha(String(req.params.token)),80,15*60*1000);
  const {link,order}=publicLink(req.params.token),org=db.prepare('SELECT name FROM organizations WHERE id=?').get(link.org_id);
  const methods=db.prepare(`SELECT s.operator_code,o.name,s.destination_encrypted,s.bank_encrypted,s.qr_url
   FROM mp_payment_settings s JOIN mp_operators o ON o.code=s.operator_code WHERE s.org_id=? AND s.enabled=1 ORDER BY o.name`).all(link.org_id)
   .map(s=>({code:s.operator_code,name:s.name,destination:decrypt(s.destination_encrypted),bank_instructions:decrypt(s.bank_encrypted),qr_url:s.qr_url}));
  res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});
  const country=db.prepare('SELECT decimals FROM mp_countries WHERE code=?').get(order.country_code);
  res.json({merchant:org.name,amount_minor:Number(order.amount_minor),currency:order.currency,decimals:country?.decimals??2,status:order.status,
   expires_at:link.expires_at,methods});
 }));
 app.post('/api/merchant/pay/:token/claim',asyncRoute((req,res)=>{
  rateLimit(req.ip,'claim-ip',30,15*60*1000);
  rateLimit(req.ip,'claim:'+sha(String(req.params.token)),8,15*60*1000);
  const reference=value(req.body?.reference,120);
  if(reference.length<2||!/[\p{L}\d]/u.test(reference))throw error(400,'Saisissez la référence de votre transaction.');
  const {link,order}=publicLink(req.params.token);
  if(order.status==='paid')throw error(409,'Ce paiement a déjà été confirmé.');
  if(!['pending','review'].includes(order.status))throw error(409,'Ce paiement ne peut plus être déclaré.');
  const now=iso();
  db.transaction(()=>{
   const changed=db.prepare("UPDATE mp_orders SET status='review',updated_at=? WHERE id=? AND org_id=? AND status IN ('pending','review')")
    .run(now,order.id,link.org_id);
   if(!changed.changes)throw error(409,'Cette commande a changé. Rechargez la page.');
   const duplicate=db.prepare('SELECT id FROM mp_payment_claims WHERE org_id=? AND order_id=? AND reference=?').get(link.org_id,order.id,reference);
   if(!duplicate){
    db.prepare('INSERT INTO mp_payment_claims(id,org_id,order_id,link_id,reference,submitted_at) VALUES (?,?,?,?,?,?)')
     .run(uuid(),link.org_id,order.id,link.id,reference,now);
    db.prepare('INSERT INTO mp_payment_events(id,org_id,order_id,action,actor_name,reference,previous_status,new_status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
     .run(uuid(),link.org_id,order.id,'reference_submitted','Client',reference,order.status,'review',now);
   }
  })();
  res.set('Cache-Control','no-store');res.json({status:'review',message:'Votre référence a été enregistrée. Le marchand vérifiera le paiement.'});
 }));
 app.post('/api/merchant/orders/:id/paid',member,asyncRoute((req,res)=>{
  const order=merchantOrder(req,req.params.id);
  if(order.status!=='review')throw error(409,'Attendez la déclaration du client avant de valider le paiement.');
  const claim=db.prepare('SELECT reference FROM mp_payment_claims WHERE org_id=? AND order_id=? ORDER BY submitted_at DESC LIMIT 1').get(req.member.org_id,order.id);
  if(!claim)throw error(409,'La référence de paiement manque.');
  const now=iso();
  db.transaction(()=>{
   const changed=db.prepare("UPDATE mp_orders SET status='paid',updated_at=? WHERE id=? AND org_id=? AND status='review'")
    .run(now,order.id,req.member.org_id);
   if(!changed.changes)throw error(409,'Cette commande a déjà changé.');
   db.prepare('INSERT INTO mp_payment_events(id,org_id,order_id,action,actor_id,actor_name,reference,previous_status,new_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(uuid(),req.member.org_id,order.id,'marked_paid',req.merchantUser.id,req.merchantUser.name,claim.reference,'review','paid',now);
  })();
  const client=merchantClient(req,order.client_id);
  const confirmation=client.consent&&!client.consent_revoked_at?
   shareLinks(decrypt(client.phone_encrypted),textMessage(req,'payment_confirmed',order,client,'',claim.reference)):null;
  res.json({status:'paid',confirmation});
 }));
 app.post('/api/merchant/orders/:id/cancel',member,asyncRoute((req,res)=>{
  requireOwner(req);const order=merchantOrder(req,req.params.id);
  if(order.status==='paid')throw error(409,'Un paiement confirmé ne peut pas être annulé sans procédure de remboursement.');
  const now=iso();db.transaction(()=>{
   db.prepare("UPDATE mp_orders SET status='cancelled',updated_at=? WHERE id=? AND org_id=?").run(now,order.id,req.member.org_id);
   db.prepare("UPDATE mp_payment_links SET revoked_at=? WHERE order_id=? AND org_id=? AND revoked_at=''").run(now,order.id,req.member.org_id);
   db.prepare('INSERT INTO mp_payment_events(id,org_id,order_id,action,actor_id,actor_name,previous_status,new_status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(uuid(),req.member.org_id,order.id,'cancelled',req.merchantUser.id,req.merchantUser.name,order.status,'cancelled',now);
  })();res.json({status:'cancelled'});
 }));
 app.post('/api/merchant/clients/:id/revoke-consent',member,asyncRoute((req,res)=>{
  const client=merchantClient(req,req.params.id),now=iso();db.prepare('UPDATE mp_clients SET consent=0,consent_revoked_at=?,updated_at=? WHERE id=? AND org_id=?')
   .run(now,now,client.id,req.member.org_id);res.json({ok:true});
 }));
 app.post('/api/merchant/invitations',member,asyncRoute((req,res)=>{
  requireOwner(req);rateLimit(req.ip,'invitations:'+req.member.org_id,30,60*60*1000);const email=value(req.body?.email,254).toLowerCase();if(!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw error(400,'E-mail du membre invalide.');
  const token=crypto.randomBytes(32).toString('base64url'),now=iso(),expiry=new Date(Date.now()+72*3600*1000).toISOString();
  const id=uuid();db.prepare('INSERT INTO mp_invitations(id,org_id,email,token_hash,created_by,expires_at,created_at) VALUES (?,?,?,?,?,?,?)')
   .run(id,req.member.org_id,email,sha(token),req.merchantUser.id,expiry,now);
  res.set('Cache-Control','no-store');res.json({id,url:(baseUrl||`http://127.0.0.1:${process.env.PORT||3000}`)+'/marchands/invite/'+token,expires_at:expiry});
 }));
 app.post('/api/merchant/invitations/accept',asyncRoute(async(req,res)=>{
  rateLimit(req.ip,'invitation-accept',25,15*60*1000);
  const user=await merchantSession(req);if(!user)throw error(401,'Connectez-vous avec l’e-mail invité.');
  const token=req.body?.token;
  if(!validToken(token))throw error(404,'Invitation invalide.');
  const invite=db.prepare('SELECT * FROM mp_invitations WHERE token_hash=?').get(sha(token));
  if(!invite||invite.revoked_at||invite.used_at||Date.parse(invite.expires_at)<=Date.now())throw error(404,'Invitation expirée ou déjà utilisée.');
  if(invite.email.toLowerCase()!==user.email.toLowerCase())throw error(403,'Utilisez l’e-mail auquel l’invitation est adressée.');
  const now=iso();db.transaction(()=>{
   const changed=db.prepare("UPDATE mp_invitations SET used_at=? WHERE id=? AND used_at='' AND revoked_at='' AND expires_at>?")
    .run(now,invite.id,now);
   if(!changed.changes)throw error(409,'Invitation déjà utilisée.');
   db.prepare('INSERT OR IGNORE INTO mp_memberships(user_id,org_id,role,email,joined_at) VALUES (?,?,?,?,?)').run(user.id,invite.org_id,'personnel',user.email.toLowerCase(),now);
  })();res.json({ok:true,merchant_id:invite.org_id});
 }));
 app.delete('/api/merchant/invitations/:id',member,asyncRoute((req,res)=>{
  requireOwner(req);
  const changed=db.prepare("UPDATE mp_invitations SET revoked_at=? WHERE id=? AND org_id=? AND used_at='' AND revoked_at=''")
   .run(iso(),req.params.id,req.member.org_id);
  if(!changed.changes)throw error(404,'Invitation non trouvée ou déjà utilisée.');
  res.json({ok:true});
 }));
 app.patch('/api/merchant/team/:userId',member,asyncRoute((req,res)=>{
  requireOwner(req);
  if(req.params.userId===req.merchantUser.id)throw error(400,'Vous ne pouvez pas désactiver votre propre compte propriétaire ici.');
  const enabled=req.body?.active===true;
  const changed=db.prepare("UPDATE mp_memberships SET active=? WHERE user_id=? AND org_id=? AND role='personnel'")
   .run(enabled?1:0,req.params.userId,req.member.org_id);
  if(!changed.changes)throw error(404,'Membre du personnel introuvable.');
  res.json({ok:true,active:enabled});
 }));
 app.delete('/api/merchant/team/:userId',member,asyncRoute((req,res)=>{
  requireOwner(req);
  if(req.params.userId===req.merchantUser.id)throw error(400,'Vous ne pouvez pas supprimer votre compte propriétaire ici.');
  const removed=db.prepare("DELETE FROM mp_memberships WHERE user_id=? AND org_id=? AND role='personnel'").run(req.params.userId,req.member.org_id);
  if(!removed.changes)throw error(404,'Membre du personnel introuvable.');
  res.json({ok:true});
 }));
}
