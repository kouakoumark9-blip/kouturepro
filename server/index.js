import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, hostedDb, uuid, iso, encrypt, decryptBuffer, encryptBuffer, sessionKey, clientOut, measurementOut, orgOut, orgRow, orgBySlug, list } from './db.js';

const app = express();
if (process.env.RENDER === 'true' || process.env.VERCEL === '1') app.set('trust proxy', 1);
const port = Number(process.env.PORT || 3000);
const demoMode = process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO !== '0' &&
 (!hostedDb || (process.env.USE_POSTGRES === '1' && process.env.SEED_DEMO === '1'));
const vercelHost = process.env.VERCEL_ENV === 'production' ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL : process.env.VERCEL_URL;
const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || (vercelHost ? `https://${vercelHost}` : '')).replace(/\/+$/,'');
if (process.env.NODE_ENV === 'production' && baseUrl) {
  let valid = false;
  try { const url = new URL(baseUrl); valid = url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash; } catch {}
  if (!valid) throw new Error('PUBLIC_BASE_URL doit être une origine HTTPS publique (sans chemin).');
}
const uploadsDir=hostedDb?null:path.resolve(process.env.DATA_DIR || 'data','uploads');
const publicUploadsDir=hostedDb?null:path.resolve(process.env.DATA_DIR || 'data','public-uploads');
if(!hostedDb){
 fs.mkdirSync(uploadsDir,{recursive:true});fs.mkdirSync(publicUploadsDir,{recursive:true});
 app.use('/uploads',express.static(publicUploadsDir,{maxAge:'1d',immutable:true}));
}
app.disable('x-powered-by');
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:false,limit:'100kb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');next();});
// Same-site cookie sessions plus a non-simple request header block cross-site form CSRF.
app.use('/api',(req,res,next)=>{
 if(['POST','PATCH','PUT','DELETE'].includes(req.method)&&req.path!=='/webhooks/cinetpay'&&req.get('X-Requested-With')!=='KouturePro')
  return res.status(403).json({error:'Requête non autorisée. Actualisez la page et réessayez.'});
 next();
});

const err=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});
const api=(fn)=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
const text=(value,max=250)=>String(value??'').trim().slice(0,max);
const positive=(value)=>Number.isFinite(Number(value)) && Number(value)>0;
const money=(n)=>new Intl.NumberFormat('fr-FR').format(Number(n)||0)+' FCFA';
const validDate=(v)=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')) && !Number.isNaN(Date.parse(v+'T00:00:00Z'));
const requireField=(v,label)=>{ if(!text(v))throw err(400,`${label} est obligatoire.`); };
const normalizePhone=(phone)=>{ const p=String(phone||'').replace(/[\s.()\-]/g,''); if(!/^\+?[0-9]{8,15}$/.test(p)) throw err(400,'Saisissez un numéro de téléphone valide.');return p.startsWith('+')?p:'+'+p; };
function cookie(req){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('kp_session='));return raw?decodeURIComponent(raw.split('=').slice(1).join('=')):'';}
function setSession(res,user){const token=jwt.sign({sub:user.id,v:2,av:user.auth_version},sessionKey,{expiresIn:'30d'});res.cookie('kp_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:30*86400*1000,path:'/'});}
function getUser(req){try{const payload=jwt.verify(cookie(req),sessionKey);if(payload.v!==2)return null;const user=db.prepare('SELECT * FROM users WHERE id=?').get(payload.sub);if(!user?.password_hash||payload.av!==user.auth_version)return null;if(process.env.NODE_ENV==='production'&&user.org_id&&orgRow(user.org_id)?.is_demo)return null;return user;}catch{return null;}}
function auth(req,res,next){req.user=getUser(req);if(!req.user)return next(err(401,'Votre session a expiré. Reconnectez-vous.'));next();}
function withOrg(req,res,next){if(!req.user.org_id)return next(err(403,'Terminez la création de votre atelier.'));req.org=orgRow(req.user.org_id);if(!req.org)return next(err(404,'Atelier introuvable.'));next();}
function roles(...allowed){return (req,res,next)=>allowed.includes(req.user.role)?next():next(err(403,'Vous ne disposez pas de cette autorisation.'));}
function row(req,table,id){const r=db.prepare(`SELECT * FROM ${table} WHERE id=? AND org_id=?`).get(id,req.user.org_id);if(!r)throw err(404,'Élément introuvable.');if(!['owner','accountant'].includes(req.user.role)&&r.branch_id&&r.branch_id!==req.user.branch_id)throw err(403,'Cet élément appartient à une autre boutique.');return r;}
function branchId(req,requested){const id=['owner','accountant'].includes(req.user.role)&&requested?requested:req.user.branch_id;if(!db.prepare('SELECT id FROM branches WHERE id=? AND org_id=?').get(id,req.user.org_id))throw err(400,'Boutique introuvable.');return id;}
function recordId(id){return /^[a-zA-Z0-9_-]{1,90}$/.test(String(id||''))?String(id):uuid();}
function workshopImage(orgId,value){
 const url=text(value,500);if(!url)return '';
 if(/^\/assets\/[a-zA-Z0-9_.-]+$/.test(url))return url;
 if(!hostedDb&&/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(url))return url; // Existing local pictures.
 if(db.prepare('SELECT url FROM uploaded_images WHERE url=? AND org_id=?').get(url,orgId))return url;
 throw err(400,'Choisissez une image envoyée depuis votre atelier.');
}
function transaction(fn){return db.transaction(fn)();}

// Only password-backed sessions are accepted; OTP-era cookies no longer grant access.
function userOut(user){if(!user)return null;const {id,org_id,branch_id,name,phone,email,role,created_at}=user;return {id,org_id,branch_id,name,phone:phone||'',email:email||'',role,created_at};}
function loginIdentifier(value){
 const input=String(value??'').trim();
 if(input.includes('@')){
  const email=input.toLowerCase();
  if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw err(400,'Saisissez une adresse e-mail valide.');
  return {kind:'email',value:email};
 }
 return {kind:'phone',value:normalizePhone(input)};
}
function checkPassword(value){
 if(typeof value!=='string'||value.length<10||Buffer.byteLength(value,'utf8')>72)throw err(400,'Choisissez un mot de passe de 10 à 72 caractères (72 octets maximum).');
 return value;
}
const loginAttempts=new Map(),signupAttempts=new Map();
function limit(map,key,max,period,message='Trop de tentatives. Réessayez un peu plus tard.'){
 const now=Date.now();
 if(hostedDb){
  const id=crypto.createHmac('sha256',sessionKey).update(key).digest('hex');
  const {hits}=db.prepare(`INSERT INTO rate_limits (id,started,hits) VALUES (?,?,1)
   ON CONFLICT(id) DO UPDATE SET hits=CASE WHEN rate_limits.started<? THEN 1 ELSE rate_limits.hits+1 END,
   started=CASE WHEN rate_limits.started<? THEN ? ELSE rate_limits.started END RETURNING hits`)
   .get(id,now,now-period,now-period,now);
  if(hits>max)throw err(429,message);
  return;
 }
 let entry=map.get(key);
 if(!entry||now-entry.from>period)entry={from:now,count:0};
 if(++entry.count>max)throw err(429,message);
 map.set(key,entry);
 if(map.size>12000)for(const [k,v] of map){if(now-v.from>period)map.delete(k);}
}
function resetLimit(map,key){
 if(hostedDb){const id=crypto.createHmac('sha256',sessionKey).update(key).digest('hex');db.prepare('DELETE FROM rate_limits WHERE id=?').run(id);}
 else map.delete(key);
}
const dummyHash=bcrypt.hashSync('not-a-real-password',10);
app.post('/api/auth/signup',api((req,res)=>{
 limit(signupAttempts,req.ip,25,60*60*1000);
 const name=text(req.body?.name,80),{kind,value}=loginIdentifier(req.body?.identifier),password=checkPassword(req.body?.password);
 if(name.length<2)throw err(400,'Saisissez votre nom.');
 if(db.prepare(`SELECT id FROM users WHERE ${kind}=?`).get(value))throw err(409,'Cet identifiant est déjà utilisé. Connectez-vous.');
 const id=uuid();db.prepare('INSERT INTO users (id,name,phone,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)')
  .run(id,name,kind==='phone'?value:null,kind==='email'?value:null,bcrypt.hashSync(password,12),'owner',iso());
 const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
 setSession(res,user);res.status(201).json({user:userOut(user),needs_onboarding:true});
}));
app.post('/api/auth/login',api((req,res)=>{
 const {kind,value}=loginIdentifier(req.body?.identifier),password=String(req.body?.password||'');
 limit(loginAttempts,'ip:'+req.ip,120,15*60*1000);
 limit(loginAttempts,req.ip+':'+value,10,15*60*1000);
 const user=db.prepare(`SELECT * FROM users WHERE ${kind}=?`).get(value);
 if(!bcrypt.compareSync(password,user?.password_hash||dummyHash))throw err(401,'Identifiant ou mot de passe incorrect.');
 if(process.env.NODE_ENV==='production'&&user.org_id&&orgRow(user.org_id)?.is_demo)throw err(403,'Le compte de démonstration est désactivé en production.');
 resetLimit(loginAttempts,req.ip+':'+value);
 setSession(res,user);res.json({user:userOut(user),needs_onboarding:!user.org_id});
}));
app.post('/api/auth/change-password',auth,api((req,res)=>{
 if(!bcrypt.compareSync(String(req.body?.current_password||''),req.user.password_hash))throw err(401,'Mot de passe actuel incorrect.');
 const password=checkPassword(req.body?.new_password);
 if(bcrypt.compareSync(password,req.user.password_hash))throw err(400,'Choisissez un mot de passe différent.');
 db.prepare('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?').run(bcrypt.hashSync(password,12),req.user.id);
 const user=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);setSession(res,user);res.json({ok:true,user:userOut(user)});
}));
app.post('/api/auth/logout',api((req,res)=>{res.clearCookie('kp_session',{path:'/',sameSite:'lax',secure:process.env.NODE_ENV==='production'});res.json({ok:true});}));
app.get('/api/auth/me',api((req,res)=>{const user=getUser(req);if(!user)throw err(401,'Non connecté.');res.json({user:userOut(user),organization:user.org_id?orgOut(orgRow(user.org_id)):null});}));
app.post('/api/onboarding',auth,api((req,res)=>{
 if(req.user.org_id)throw err(409,'Votre atelier est déjà créé.');
 const name=text(req.body.name,100),city=text(req.body.city,80),phone=normalizePhone(req.body.whatsapp_phone||req.user.phone);
 requireField(name,"Le nom de l'atelier");requireField(city,'La ville');
 let slug=text(req.body.slug||name,90).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 if(slug.length<3)slug='atelier-'+crypto.randomInt(1000,9999);
 const original=slug;let i=2;while(orgBySlug(slug))slug=original+'-'+i++;
 const org=uuid(),branch=uuid(),when=iso();const specs=Array.isArray(req.body.specialties)?req.body.specialties.map(x=>text(x,60)).filter(Boolean).slice(0,8):[];
 transaction(()=>{
 db.prepare('INSERT INTO organizations (id,slug,name,city,address,whatsapp_phone,specialties,plan,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(org,slug,name,city,text(req.body.address,200),phone,JSON.stringify(specs),['starter','pro','business'].includes(req.body.plan)?req.body.plan:'starter',when);
 db.prepare('INSERT INTO branches (id,org_id,name,address,city,phone,is_primary,created_at) VALUES (?,?,?,?,?,?,?,?)').run(branch,org,name,text(req.body.address,200),city,phone,1,when);
 db.prepare('UPDATE users SET org_id=?,branch_id=?,name=? WHERE id=?').run(org,branch,text(req.body.owner_name,80)||req.user.name,req.user.id);
 });res.json({ok:true,organization:orgOut(orgRow(org))});
}));

app.get('/api/bootstrap',auth,withOrg,api((req,res)=>{
 const orgId=req.user.org_id;const allowed=['owner','accountant'].includes(req.user.role)?'':' AND branch_id=?';
 const forBranch=(table)=>allowed?db.prepare(`SELECT * FROM ${table} WHERE org_id=?${allowed} ORDER BY created_at DESC`).all(orgId,req.user.branch_id):list(table,orgId);
 const clients=forBranch('clients').map(clientOut),allOrders=forBranch('orders'),apprentice=req.user.role==='apprentice';
 const orders=apprentice?allOrders.filter(o=>o.assigned_user_id===req.user.id).map(o=>({...o,price:0,material_cost:0,commission:0})):allOrders;
 const fabrics=forBranch('fabrics'),expenses=['owner','accountant'].includes(req.user.role)?forBranch('expenses'):[];
 const clientIds=new Set(clients.map(x=>x.id)),orderIds=new Set(orders.map(x=>x.id)),canSeePayments=!apprentice;
 res.json({user:userOut(req.user),organization:orgOut(req.org),branches:list('branches',orgId),clients,measurements:list('measurements',orgId).filter(x=>clientIds.has(x.client_id)).map(measurementOut),orders,
 payments:canSeePayments?list('payments',orgId).filter(x=>orderIds.has(x.order_id)):[],fabrics,suppliers:list('suppliers',orgId),expenses,team:list('users',orgId).map(userOut),patterns:list('patterns',orgId),
 showcase:list('showcase_items',orgId),reviews:list('reviews',orgId),appointments:apprentice?[]:list('appointments',orgId),savingsPlans:canSeePayments?list('savings_plans',orgId):[],savingsContributions:canSeePayments?list('savings_contributions',orgId):[],
 integration:{mobile:!!(process.env.CINETPAY_API_KEY&&process.env.CINETPAY_SITE_ID&&baseUrl),sms:!!(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_FROM),whatsapp:!!(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_ID&&process.env.WHATSAPP_TEMPLATE_NAME)}});
}));

app.post('/api/clients',auth,withOrg,roles('owner','tailor','accountant'),api((req,res)=>{
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM clients WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:clientOut(row(req,'clients',id))});
 const name=text(req.body.name,100);requireField(name,'Le nom du client');const branch=branchId(req,req.body.branch_id),when=iso();
 db.prepare('INSERT INTO clients (id,org_id,branch_id,name,phone_encrypted,address_encrypted,notes_encrypted,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
 .run(id,req.user.org_id,branch,name,encrypt(req.body.phone?normalizePhone(req.body.phone):''),encrypt(text(req.body.address,200)),encrypt(text(req.body.notes,1000)),when,when);
 res.status(201).json({item:clientOut(row(req,'clients',id))});
}));
app.patch('/api/clients/:id',auth,withOrg,roles('owner','tailor','accountant'),api((req,res)=>{
 const c=row(req,'clients',req.params.id);if(Number(req.body.version)!==c.version)throw err(409,'La fiche a changé depuis votre dernière synchronisation.',{current:clientOut(c)});
 const name=req.body.name!==undefined?text(req.body.name,100):c.name;requireField(name,'Le nom du client');
 db.prepare('UPDATE clients SET name=?,phone_encrypted=?,address_encrypted=?,notes_encrypted=?,version=version+1,updated_at=? WHERE id=? AND org_id=?')
 .run(name,req.body.phone!==undefined?encrypt(req.body.phone?normalizePhone(req.body.phone):''):c.phone_encrypted,req.body.address!==undefined?encrypt(text(req.body.address,200)):c.address_encrypted,req.body.notes!==undefined?encrypt(text(req.body.notes,1000)):c.notes_encrypted,iso(),c.id,req.user.org_id);
 res.json({item:clientOut(row(req,'clients',c.id))});
}));
app.post('/api/measurements',auth,withOrg,roles('owner','tailor','apprentice'),api((req,res)=>{
 const client=row(req,'clients',req.body.client_id),id=recordId(req.body.id);
 if(db.prepare('SELECT id FROM measurements WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:measurementOut(row(req,'measurements',id))});
 const type=text(req.body.type,80),value=text(req.body.value,60);requireField(type,'Le type de mesure');requireField(value,'La valeur');
 const voiceId=req.body.voice_id?text(req.body.voice_id,90):'';
 if(voiceId){const voice=row(req,'voices',voiceId);if(voice.client_id!==client.id)throw err(400,'Cette note vocale ne correspond pas au client.');}
 db.prepare('INSERT INTO measurements (id,org_id,client_id,type,value_encrypted,unit,voice_id,created_at) VALUES (?,?,?,?,?,?,?,?)')
 .run(id,req.user.org_id,client.id,type,encrypt(value),text(req.body.unit,12)||'cm',voiceId,iso());res.status(201).json({item:measurementOut(row(req,'measurements',id))});
}));
app.patch('/api/measurements/:id',auth,withOrg,roles('owner','tailor','apprentice'),api((req,res)=>{
 const m=row(req,'measurements',req.params.id);row(req,'clients',m.client_id);
 if(Number(req.body.version)!==m.version)throw err(409,'Cette mesure a changé depuis votre dernière synchronisation.',{current:measurementOut(m)});
 const type=req.body.type!==undefined?text(req.body.type,80):m.type,value=req.body.value!==undefined?text(req.body.value,60):null;
 requireField(type,'Le type de mesure');if(value!==null)requireField(value,'La valeur');
 const voiceId=req.body.voice_id!==undefined?text(req.body.voice_id,90):m.voice_id;
 if(voiceId){const voice=row(req,'voices',voiceId);if(voice.client_id!==m.client_id)throw err(400,'Cette note vocale ne correspond pas au client.');}
 db.prepare('UPDATE measurements SET type=?,value_encrypted=?,unit=?,voice_id=?,version=version+1 WHERE id=? AND org_id=?')
 .run(type,value===null?m.value_encrypted:encrypt(value),req.body.unit!==undefined?text(req.body.unit,12)||'cm':m.unit,voiceId,m.id,req.user.org_id);
 res.json({item:measurementOut(row(req,'measurements',m.id))});
}));
app.delete('/api/measurements/:id',auth,withOrg,roles('owner','tailor'),api((req,res)=>{const m=row(req,'measurements',req.params.id);row(req,'clients',m.client_id);db.prepare('DELETE FROM measurements WHERE id=? AND org_id=?').run(req.params.id,req.user.org_id);res.json({ok:true});}));

const blobStore = hostedDb ? await import('@vercel/blob') : null;
const audioUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:3*1024*1024},fileFilter:(req,file,cb)=>cb(null,/^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)$/.test(file.mimetype))});
app.post('/api/uploads/voice',auth,withOrg,audioUpload.single('audio'),api(async(req,res)=>{
 if(!req.file)throw err(400,'Fichier audio invalide (3 Mo maximum).');const client=row(req,'clients',req.body.client_id),id=uuid();
 const encrypted=encryptBuffer(req.file.buffer);
 const filePath=hostedDb?(await blobStore.put(`voices/${req.user.org_id}/${id}.enc`,encrypted,{access:'public',contentType:'application/octet-stream'})).url:path.join(uploadsDir,id+'.enc');
 if(!hostedDb)fs.writeFileSync(filePath,encrypted,{mode:0o600});
 db.prepare('INSERT INTO voices (id,org_id,client_id,mime,file_path,created_at) VALUES (?,?,?,?,?,?)').run(id,req.user.org_id,client.id,req.file.mimetype,filePath,iso());
 res.status(201).json({voice_id:id,url:'/api/uploads/voice/'+id});
}));
app.get('/api/uploads/voice/:id',auth,withOrg,api(async(req,res)=>{
 const voice=row(req,'voices',req.params.id);row(req,'clients',voice.client_id);
 let encrypted;
 if(hostedDb){const object=await blobStore.get(voice.file_path,{access:'public'});if(object?.statusCode!==200)throw err(404,'Note vocale introuvable.');encrypted=Buffer.from(await new Response(object.stream).arrayBuffer());}
 else encrypted=fs.readFileSync(voice.file_path);
 res.setHeader('Content-Type',voice.mime);res.setHeader('Cache-Control','private, no-store');res.send(decryptBuffer(encrypted));
}));
const imageUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:4*1024*1024},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
app.post('/api/uploads/image',auth,withOrg,roles('owner'),imageUpload.single('image'),api(async(req,res)=>{
 if(!req.file)throw err(400,'Image JPG, PNG ou WebP uniquement (4 Mo maximum).');
 const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[req.file.mimetype],name=uuid()+'.'+ext;
 const url=hostedDb?(await blobStore.put(`showcase/${req.user.org_id}/${name}`,req.file.buffer,{access:'public',contentType:req.file.mimetype})).url:'/uploads/'+name;
 if(!hostedDb)fs.writeFileSync(path.join(publicUploadsDir,name),req.file.buffer,{mode:0o644});
 db.prepare('INSERT INTO uploaded_images (url,org_id,created_at) VALUES (?,?,?)').run(url,req.user.org_id,iso());
 res.status(201).json({url});
}));

app.post('/api/orders',auth,withOrg,roles('owner','tailor'),api((req,res)=>{
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM orders WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'orders',id)});
 const client=row(req,'clients',req.body.client_id),model=text(req.body.model,180);requireField(model,'Le modèle');
 const price=Math.round(Number(req.body.price));if(!Number.isInteger(price)||price<0||price>100000000)throw err(400,'Le prix est invalide.');
 if(!validDate(req.body.due_date))throw err(400,'Choisissez une date de livraison valide.');
 const qty=Number(req.body.fabric_quantity||0);if(!Number.isFinite(qty)||qty<0||qty>10000)throw err(400,'La quantité de tissu est invalide.');
 const branch=branchId(req,req.body.branch_id);if(client.branch_id!==branch)throw err(400,'Choisissez un client de cette boutique.');
 const fabric=req.body.fabric_id?row(req,'fabrics',req.body.fabric_id):null;
 if(fabric&&fabric.branch_id!==branch)throw err(400,'Ce tissu appartient à une autre boutique.');
 if(req.body.pattern_id)row(req,'patterns',req.body.pattern_id);
 if(req.body.assigned_user_id){const assigned=row(req,'users',req.body.assigned_user_id);if(assigned.branch_id!==branch)throw err(400,'Cet employé appartient à une autre boutique.');}
 const ref='KP-'+new Date().getUTCFullYear().toString().slice(-2)+String(crypto.randomInt(10000,99999));const when=iso();
 transaction(()=>{
   if(fabric&&qty>0){const result=db.prepare('UPDATE fabrics SET quantity=quantity-?,updated_at=? WHERE id=? AND org_id=? AND quantity>=?').run(qty,when,fabric.id,req.user.org_id,qty);if(!result.changes)throw err(409,'Stock insuffisant pour ce tissu.');}
   db.prepare(`INSERT INTO orders (id,org_id,branch_id,client_id,reference,model,garment_type,fabric_id,fabric_source,fabric_quantity,pattern_id,price,material_cost,due_date,fitting_date,notes,assigned_user_id,commission,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
   .run(id,req.user.org_id,branch,client.id,ref,model,text(req.body.garment_type,50)||'Tenue',fabric?.id||null,fabric?'atelier':'client',fabric?qty:0,req.body.pattern_id||null,price,fabric?Math.round(fabric.unit_cost*qty):0,req.body.due_date,validDate(req.body.fitting_date)?req.body.fitting_date:'',text(req.body.notes,1000),req.body.assigned_user_id||null,Math.max(0,Math.round(Number(req.body.commission)||0)),when,when);
   if(fabric&&qty>0)db.prepare('INSERT INTO stock_movements (id,org_id,fabric_id,kind,quantity,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)').run(uuid(),req.user.org_id,fabric.id,'sortie',qty,id,'Commande '+ref,when);
 });res.status(201).json({item:row(req,'orders',id)});
}));
app.patch('/api/orders/:id',auth,withOrg,roles('owner','tailor','apprentice'),api((req,res)=>{
 const o=row(req,'orders',req.params.id);if(Number(req.body.version)!==o.version)throw err(409,'Cette commande a changé depuis votre dernière synchronisation.',{current:o});
 if(req.user.role==='apprentice'){
  if(o.assigned_user_id!==req.user.id)throw err(403,'Cette commande ne vous est pas confiée.');
  if(Object.keys(req.body).some(key=>!['version','stage'].includes(key))||Number(req.body.stage)!==o.stage+1)throw err(403,'Vous pouvez uniquement passer votre commande à l’étape suivante.');
 }
 if(o.status==='delivered'&&req.user.role!=='owner')throw err(400,'Cette commande est déjà livrée.');
 const nextStage=req.body.stage===undefined?o.stage:Number(req.body.stage);
 if(!Number.isInteger(nextStage)||nextStage<0||nextStage>4)throw err(400,'Étape de production invalide.');
 if(req.user.role==='apprentice'&&nextStage<o.stage)throw err(403,'Vous ne pouvez pas revenir à une étape précédente.');
 const status=req.body.status!==undefined?text(req.body.status,20):o.status;
 if(!['active','delivered','cancelled'].includes(status))throw err(400,'Statut invalide.');
 if(status==='delivered'&&nextStage!==4)throw err(400,'Terminez la finition avant de livrer.');
 if(req.body.assigned_user_id)row(req,'users',req.body.assigned_user_id);
 const due=req.body.due_date!==undefined?req.body.due_date:o.due_date;if(!validDate(due))throw err(400,'Date invalide.');
 db.prepare('UPDATE orders SET stage=?,status=?,due_date=?,fitting_date=?,notes=?,assigned_user_id=?,commission=?,delivered_at=?,version=version+1,updated_at=? WHERE id=? AND org_id=?')
 .run(nextStage,status,due,req.body.fitting_date!==undefined?(validDate(req.body.fitting_date)?req.body.fitting_date:''):o.fitting_date,req.body.notes!==undefined?text(req.body.notes,1000):o.notes,
 req.body.assigned_user_id!==undefined?(req.body.assigned_user_id||null):o.assigned_user_id,req.body.commission!==undefined?Math.max(0,Math.round(Number(req.body.commission)||0)):o.commission,status==='delivered'?(o.delivered_at||iso()):'',iso(),o.id,req.user.org_id);
 res.json({item:row(req,'orders',o.id)});
}));

app.post('/api/payments',auth,withOrg,roles('owner','accountant'),api((req,res)=>{
 const order=row(req,'orders',req.body.order_id),id=recordId(req.body.id);
 if(db.prepare('SELECT id FROM payments WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'payments',id)});
 const method=text(req.body.method,30);if(!['Espèces','Virement'].includes(method))throw err(400,'Pour le mobile money, utilisez le paiement sécurisé.');
 const amount=Math.round(Number(req.body.amount));if(!Number.isInteger(amount)||amount<=0)throw err(400,'Saisissez un montant valide.');
 const paid=db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE order_id=? AND org_id=? AND status='paid'").get(order.id,req.user.org_id).total;
 if(amount>order.price-paid)throw err(400,'Le paiement dépasse le solde restant.');
 const when=iso();db.prepare('INSERT INTO payments (id,org_id,order_id,amount,method,status,created_at,confirmed_at) VALUES (?,?,?,?,?,?,?,?)').run(id,req.user.org_id,order.id,amount,method,'paid',when,when);
 res.status(201).json({item:row(req,'payments',id)});
}));
async function cinetpayVerify(transactionId){
 const r=await fetch('https://api-checkout.cinetpay.com/v2/payment/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apikey:process.env.CINETPAY_API_KEY,site_id:process.env.CINETPAY_SITE_ID,transaction_id:transactionId}),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw err(502,'La vérification du paiement est momentanément indisponible.');return r.json();
}
async function confirmPayment(payment){
 if(payment.status==='paid')return payment;
 const result=await cinetpayVerify(payment.transaction_id),data=result.data||{};
 if(String(result.code)==='00'&&data.status==='ACCEPTED'&&Number(data.amount)===payment.amount&&data.currency==='XOF'){
  db.prepare("UPDATE payments SET status='paid',confirmed_at=? WHERE id=? AND status='pending'").run(iso(),payment.id);
 }else if(['REFUSED','CANCELLED','CANCELED'].includes(data.status)){
  db.prepare("UPDATE payments SET status='failed' WHERE id=? AND status='pending'").run(payment.id);
 }
 return db.prepare('SELECT * FROM payments WHERE id=?').get(payment.id);
}
app.post('/api/payments/mobile',auth,withOrg,roles('owner','accountant'),api(async(req,res)=>{
 if(!process.env.CINETPAY_API_KEY||!process.env.CINETPAY_SITE_ID||!baseUrl)throw err(503,'Le paiement mobile n’est pas encore activé. Configurez CinetPay et une adresse publique dans les paramètres du serveur.');
 const order=row(req,'orders',req.body.order_id),provider=text(req.body.provider,30);
 if(!['Wave','Orange Money','MTN Money'].includes(provider))throw err(400,'Choisissez un opérateur mobile.');
 const amount=Math.round(Number(req.body.amount));const already=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE order_id=? AND status='paid'").get(order.id).total;
 if(!Number.isInteger(amount)||amount<100||amount%5!==0||amount>order.price-already)throw err(400,'Montant invalide (minimum 100 FCFA, multiple de 5, limité au solde).');
 const id=uuid(),transactionId='KP'+Date.now()+crypto.randomInt(10000,99999),client=row(req,'clients',order.client_id);
 const body={apikey:process.env.CINETPAY_API_KEY,site_id:process.env.CINETPAY_SITE_ID,transaction_id:transactionId,amount,currency:'XOF',description:'Commande '+order.reference,
 notify_url:baseUrl+'/api/webhooks/cinetpay',return_url:baseUrl+'/app/orders/'+order.id+'?paiement=retour',channels:'MOBILE_MONEY',lang:'fr',customer_name:client.name,metadata:order.id};
 let result;try{const r=await fetch('https://api-checkout.cinetpay.com/v2/payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});result=await r.json();if(!r.ok)throw Error(result.message||'HTTP '+r.status);}catch(e){throw err(502,'Le service de paiement ne répond pas. Réessayez dans un instant.');}
 if(String(result.code)!=='201'||!result.data?.payment_url)throw err(502,result.description||result.message||'Impossible de créer le paiement.');
 db.prepare('INSERT INTO payments (id,org_id,order_id,amount,method,provider,status,transaction_id,payment_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,req.user.org_id,order.id,amount,'Mobile money',provider,'pending',transactionId,result.data.payment_url,iso());
 res.status(201).json({payment:row(req,'payments',id),payment_url:result.data.payment_url,note:'L’opérateur disponible dépend de votre contrat CinetPay.'});
}));
app.post('/api/payments/:id/refresh',auth,withOrg,roles('owner','accountant'),api(async(req,res)=>{
 const p=row(req,'payments',req.params.id);if(p.method!=='Mobile money')throw err(400,'Ce paiement ne nécessite pas de vérification.');
 res.json({item:await confirmPayment(p)});
}));
app.all('/api/webhooks/cinetpay',api(async(req,res)=>{
 if(req.method==='GET')return res.status(200).send('OK');
 const transId=text(req.body.cpm_trans_id||req.body.transaction_id,100);
 if(!transId||String(req.body.cpm_site_id||'')!==String(process.env.CINETPAY_SITE_ID||''))return res.status(200).send('OK');
 const p=db.prepare("SELECT * FROM payments WHERE transaction_id=? AND status='pending'").get(transId);
 if(p){try{await confirmPayment(p);}catch(e){console.error('CinetPay verification:',e.message);return res.status(503).send('retry');}}
 res.status(200).send('OK');
}));

function renderInvoice(res,order,client,org,payments){
 const paid=payments.reduce((a,p)=>a+p.amount,0);const doc=new PDFDocument({size:'A4',margin:56});
 res.type('application/pdf');res.setHeader('Content-Disposition',`attachment; filename="Facture-${order.reference}.pdf"`);doc.pipe(res);
 doc.rect(0,0,595,115).fill('#122d2a');doc.fillColor('#d8f4df').font('Helvetica-Bold').fontSize(20).text('KOUTUREPRO',56,42);doc.fillColor('#ffffff').font('Helvetica').fontSize(12).text(org.name,380,47,{align:'right',width:158});
 doc.fillColor('#15232a').font('Helvetica-Bold').fontSize(26).text('FACTURE',56,155);doc.fillColor('#70827e').font('Helvetica').fontSize(11).text(order.reference,56,190);
 doc.text(`Émise le ${new Date().toLocaleDateString('fr-FR')}`,56,214);
 doc.fillColor('#233b36').font('Helvetica-Bold').fontSize(11).text('ATELIER',56,260).text('CLIENT',315,260);
 doc.fillColor('#344f49').font('Helvetica').fontSize(11).text(org.name,56,279).text([org.address,org.city].filter(Boolean).join(', '),56,297,{width:210});
 doc.text(client.name,315,279).text(client.phone||'',315,297);
 doc.moveTo(56,345).lineTo(539,345).strokeColor('#d7e3dd').stroke();
 doc.fillColor('#687f77').font('Helvetica-Bold').fontSize(10).text('DESCRIPTION',56,363).text('MONTANT',410,363,{align:'right',width:129});
 doc.moveTo(56,388).lineTo(539,388).strokeColor('#d7e3dd').stroke();
 doc.fillColor('#152c27').font('Helvetica').fontSize(12).text(order.model,56,408,{width:330}).text(money(order.price),400,408,{width:139,align:'right'});
 doc.fillColor('#71817c').fontSize(10).text(`Livraison prévue : ${new Date(order.due_date+'T12:00:00Z').toLocaleDateString('fr-FR')}`,56,436);
 doc.moveTo(56,485).lineTo(539,485).strokeColor('#d7e3dd').stroke();
 doc.fillColor('#344f49').fontSize(11).text('Prix total',315,505).text(money(order.price),410,505,{align:'right',width:129});
 doc.text('Déjà réglé',315,530).text(money(paid),410,530,{align:'right',width:129});
 doc.roundedRect(300,563,245,50,9).fill('#e9f5ee');doc.fillColor('#116c49').font('Helvetica-Bold').fontSize(12).text('Reste à payer',315,579).text(money(Math.max(0,order.price-paid)),400,579,{align:'right',width:130});
 if(payments.length){doc.fillColor('#243f35').font('Helvetica-Bold').fontSize(11).text('Paiements enregistrés',56,652);payments.slice(0,5).forEach((p,i)=>doc.fillColor('#60766e').font('Helvetica').fontSize(10).text(`${new Date(p.created_at).toLocaleDateString('fr-FR')}  ·  ${p.provider||p.method}  ·  ${money(p.amount)}`,56,675+i*18));}
 doc.fillColor('#72827d').font('Helvetica').fontSize(9).text(`${org.name}  ·  ${org.city}  ·  ${org.whatsapp_phone}`,56,793,{align:'center',width:483});doc.end();
}
function invoiceForOrder(order,org){
 const client=clientOut(db.prepare('SELECT * FROM clients WHERE id=? AND org_id=?').get(order.client_id,org.id));
 if(!client)throw err(404,'Client introuvable.');
 const payments=db.prepare("SELECT * FROM payments WHERE order_id=? AND org_id=? AND status='paid' ORDER BY created_at ASC").all(order.id,org.id);
 return {client,payments};
}
function shareInvoiceLink(req,order){
 if(process.env.NODE_ENV==='production'&&!baseUrl)throw err(503,'Configurez PUBLIC_BASE_URL pour partager une facture en toute sécurité.');
 const token=jwt.sign({purpose:'invoice-share',org_id:order.org_id,order_id:order.id},sessionKey,{expiresIn:'7d'});
 return (baseUrl||`${req.protocol}://${req.get('host')}`)+'/receipt/'+token;
}
app.get('/api/orders/:id/invoice',auth,withOrg,roles('owner','accountant','tailor'),api((req,res)=>{
 const order=row(req,'orders',req.params.id),org=orgOut(req.org),{client,payments}=invoiceForOrder(order,req.org);
 renderInvoice(res,order,client,org,payments);
}));
app.post('/api/orders/:id/invoice/share',auth,withOrg,roles('owner','accountant','tailor'),api((req,res)=>{
 const order=row(req,'orders',req.params.id);
 res.json({url:shareInvoiceLink(req,order),expires_at:new Date(Date.now()+7*864e5).toISOString()});
}));
app.post('/api/orders/:id/invoice/whatsapp',auth,withOrg,roles('owner','accountant','tailor'),api(async(req,res)=>{
 const order=row(req,'orders',req.params.id),client=clientOut(row(req,'clients',order.client_id));
 if(!client.phone)throw err(400,'Le client n’a pas de numéro de téléphone.');
 if(!process.env.WHATSAPP_ACCESS_TOKEN||!process.env.WHATSAPP_PHONE_ID)throw err(503,"L’envoi WhatsApp intégré n’est pas configuré.");
 const link=shareInvoiceLink(req,order);
 const body={messaging_product:'whatsapp',to:client.phone.replace(/\D/g,''),type:'document',document:{link,filename:`Facture-${order.reference}.pdf`}};
 const r=await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(process.env.WHATSAPP_PHONE_ID)}/messages`,{method:'POST',headers:{Authorization:'Bearer '+process.env.WHATSAPP_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw err(502,"Le document n’a pas pu être envoyé. Une conversation WhatsApp active avec le client peut être nécessaire. Utilisez le lien à partager.");
 res.json({ok:true});
}));
app.get('/receipt/:token',api((req,res)=>{
 if(req.params.token.length>1800)throw err(404,'Ce lien de facture est invalide.');
 let payload;try{payload=jwt.verify(req.params.token,sessionKey);}catch{throw err(404,'Ce lien de facture est expiré ou invalide.');}
 if(payload.purpose!=='invoice-share')throw err(404,'Ce lien de facture est invalide.');
 const org=orgRow(payload.org_id),order=db.prepare('SELECT * FROM orders WHERE id=? AND org_id=?').get(payload.order_id,payload.org_id);
 if(!org||!order)throw err(404,'Cette facture n’est plus disponible.');
 const {client,payments}=invoiceForOrder(order,org);
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 renderInvoice(res,order,client,orgOut(org),payments);
}));

app.post('/api/suppliers',auth,withOrg,roles('owner','accountant'),api((req,res)=>{
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM suppliers WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'suppliers',id)});
 const name=text(req.body.name,100);requireField(name,'Le nom du fournisseur');db.prepare('INSERT INTO suppliers (id,org_id,name,phone,city,notes,created_at) VALUES (?,?,?,?,?,?,?)').run(id,req.user.org_id,name,text(req.body.phone,35),text(req.body.city,100),text(req.body.notes,500),iso());res.status(201).json({item:row(req,'suppliers',id)});
}));
app.post('/api/fabrics',auth,withOrg,roles('owner','accountant'),api((req,res)=>{
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM fabrics WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'fabrics',id)});
 const name=text(req.body.name,100);requireField(name,'Le nom du tissu');const qty=Number(req.body.quantity||0),cost=Math.round(Number(req.body.unit_cost)||0),threshold=Number(req.body.threshold||3);
 if(!Number.isFinite(qty)||qty<0||!Number.isFinite(threshold)||threshold<0||cost<0)throw err(400,'Quantité ou coût invalide.');
 const branch=branchId(req,req.body.branch_id),when=iso();if(req.body.supplier_id)row(req,'suppliers',req.body.supplier_id);
 transaction(()=>{db.prepare('INSERT INTO fabrics (id,org_id,branch_id,name,category,color,quantity,unit,unit_cost,threshold,supplier_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
 .run(id,req.user.org_id,branch,name,text(req.body.category,60)||'Tissu',text(req.body.color,50),qty,text(req.body.unit,12)||'m',cost,threshold,req.body.supplier_id||null,when,when);
 if(qty>0)db.prepare('INSERT INTO stock_movements (id,org_id,fabric_id,kind,quantity,note,created_at) VALUES (?,?,?,?,?,?,?)').run(uuid(),req.user.org_id,id,'entrée',qty,'Stock initial',when);});res.status(201).json({item:row(req,'fabrics',id)});
}));
app.post('/api/purchases',auth,withOrg,roles('owner','accountant'),api((req,res)=>{
 const fabric=row(req,'fabrics',req.body.fabric_id),qty=Number(req.body.quantity),amount=Math.round(Number(req.body.amount));
 if(!positive(qty)||qty>10000||!Number.isInteger(amount)||amount<0)throw err(400,'Quantité ou montant invalide.');
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM expenses WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'expenses',id)});
 const supplier=req.body.supplier_id?row(req,'suppliers',req.body.supplier_id):null,when=iso();
 transaction(()=>{db.prepare('UPDATE fabrics SET quantity=quantity+?,updated_at=? WHERE id=?').run(qty,when,fabric.id);
 db.prepare('INSERT INTO expenses (id,org_id,branch_id,category,label,amount,supplier_id,fabric_id,quantity,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,req.user.org_id,fabric.branch_id,'Achat tissu','Achat : '+fabric.name,amount,supplier?.id||null,fabric.id,qty,when);
 db.prepare('INSERT INTO stock_movements (id,org_id,fabric_id,kind,quantity,note,created_at) VALUES (?,?,?,?,?,?,?)').run(uuid(),req.user.org_id,fabric.id,'entrée',qty,'Achat fournisseur',when);});res.status(201).json({item:row(req,'expenses',id),fabric:row(req,'fabrics',fabric.id)});
}));
app.post('/api/expenses',auth,withOrg,roles('owner','accountant'),api((req,res)=>{
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM expenses WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'expenses',id)});
 const amount=Math.round(Number(req.body.amount));if(!positive(amount))throw err(400,'Saisissez un montant valide.');
 const label=text(req.body.label,130);requireField(label,'La description');db.prepare('INSERT INTO expenses (id,org_id,branch_id,category,label,amount,created_at) VALUES (?,?,?,?,?,?,?)').run(id,req.user.org_id,branchId(req,req.body.branch_id),text(req.body.category,60)||'Autre',label,amount,iso());res.status(201).json({item:row(req,'expenses',id)});
}));
app.post('/api/patterns',auth,withOrg,roles('owner','tailor'),api((req,res)=>{
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM patterns WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'patterns',id)});
 const name=text(req.body.name,100);requireField(name,'Le nom du patron');db.prepare('INSERT INTO patterns (id,org_id,name,garment_type,description,image_url,measurements_json,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id,req.user.org_id,name,text(req.body.garment_type,70),text(req.body.description,400),text(req.body.image_url,200),JSON.stringify(req.body.measurements||{}),iso());res.status(201).json({item:row(req,'patterns',id)});
}));
app.post('/api/branches',auth,withOrg,roles('owner'),api((req,res)=>{
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM branches WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'branches',id)});
 const name=text(req.body.name,100);requireField(name,'Le nom de la succursale');db.prepare('INSERT INTO branches (id,org_id,name,address,city,phone,created_at) VALUES (?,?,?,?,?,?,?)').run(id,req.user.org_id,name,text(req.body.address,150),text(req.body.city,100),text(req.body.phone,35),iso());res.status(201).json({item:row(req,'branches',id)});
}));
app.post('/api/team',auth,withOrg,roles('owner'),api((req,res)=>{
 const {kind,value}=loginIdentifier(req.body.identifier),name=text(req.body.name,100),role=text(req.body.role,30),password=checkPassword(req.body.password);
 requireField(name,'Le nom');if(!['tailor','apprentice','accountant'].includes(role))throw err(400,'Rôle invalide.');
 if(db.prepare(`SELECT id FROM users WHERE ${kind}=?`).get(value))throw err(409,'Cet identifiant est déjà associé à un compte.');
 const id=uuid();db.prepare('INSERT INTO users (id,org_id,branch_id,name,phone,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
  .run(id,req.user.org_id,branchId(req,req.body.branch_id),name,kind==='phone'?value:null,kind==='email'?value:null,bcrypt.hashSync(password,12),role,iso());
 res.status(201).json({item:userOut(row(req,'users',id))});
}));
app.patch('/api/team/:id/password',auth,withOrg,roles('owner'),api((req,res)=>{
 const member=row(req,'users',req.params.id),password=checkPassword(req.body.password);
 if(member.role==='owner')throw err(403,'Changez votre propre mot de passe depuis les paramètres.');
 db.prepare('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=? AND org_id=?').run(bcrypt.hashSync(password,12),member.id,req.user.org_id);
 res.json({ok:true});
}));
app.post('/api/savings',auth,withOrg,roles('owner','accountant'),api((req,res)=>{
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM savings_plans WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'savings_plans',id)});
 const o=row(req,'orders',req.body.order_id),target=Math.round(Number(req.body.target||o.price));if(!positive(target)||target>o.price)throw err(400,'Objectif invalide.');
 db.prepare('INSERT INTO savings_plans (id,org_id,order_id,target,frequency,note,created_at) VALUES (?,?,?,?,?,?,?)').run(id,req.user.org_id,o.id,target,text(req.body.frequency,50)||'mensuel',text(req.body.note,300),iso());res.status(201).json({item:row(req,'savings_plans',id)});
}));
app.post('/api/savings/:id/contributions',auth,withOrg,roles('owner','accountant'),api((req,res)=>{
 const plan=row(req,'savings_plans',req.params.id),amount=Math.round(Number(req.body.amount));if(!positive(amount))throw err(400,'Montant invalide.');
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM savings_contributions WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'savings_contributions',id)});
 db.prepare('INSERT INTO savings_contributions (id,org_id,plan_id,amount,method,created_at) VALUES (?,?,?,?,?,?)').run(id,req.user.org_id,plan.id,amount,'Épargne (espèces)',iso());
 // Savings remain separate from settled payments until explicitly applied to the order.
 res.status(201).json({item:row(req,'savings_contributions',id)});
}));
app.patch('/api/organization',auth,withOrg,roles('owner'),api((req,res)=>{
 const o=req.org;const mediaUrl=(value)=>workshopImage(o.id,value);
 const values={name:text(req.body.name??o.name,100),description:text(req.body.description??o.description,900),address:text(req.body.address??o.address,200),city:text(req.body.city??o.city,100),neighborhood:text(req.body.neighborhood??o.neighborhood,100),whatsapp_phone:req.body.whatsapp_phone!==undefined?normalizePhone(req.body.whatsapp_phone):o.whatsapp_phone,
 specialties:Array.isArray(req.body.specialties)?JSON.stringify(req.body.specialties.map(x=>text(x,60)).filter(Boolean).slice(0,8)):o.specialties,
 cover_url:mediaUrl(req.body.cover_url??o.cover_url),logo_url:mediaUrl(req.body.logo_url??o.logo_url),reminders_sms:req.body.reminders_sms===undefined?o.reminders_sms:Number(!!req.body.reminders_sms),reminders_whatsapp:req.body.reminders_whatsapp===undefined?o.reminders_whatsapp:Number(!!req.body.reminders_whatsapp)};
 requireField(values.name,"Le nom de l'atelier");db.prepare(`UPDATE organizations SET name=@name,description=@description,address=@address,city=@city,neighborhood=@neighborhood,whatsapp_phone=@whatsapp_phone,specialties=@specialties,cover_url=@cover_url,logo_url=@logo_url,reminders_sms=@reminders_sms,reminders_whatsapp=@reminders_whatsapp WHERE id=@id`).run({...values,id:o.id});res.json({item:orgOut(orgRow(o.id))});
}));
app.post('/api/showcase',auth,withOrg,roles('owner'),api((req,res)=>{
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM showcase_items WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'showcase_items',id)});
 const title=text(req.body.title,110),url=workshopImage(req.user.org_id,req.body.image_url);requireField(title,'Le titre');requireField(url,'Ajoutez une photo de la galerie.');
 db.prepare('INSERT INTO showcase_items (id,org_id,title,image_url,description,price,created_at) VALUES (?,?,?,?,?,?,?)').run(id,req.user.org_id,title,url,text(req.body.description,300),Math.max(0,Math.round(Number(req.body.price)||0)),iso());res.status(201).json({item:row(req,'showcase_items',id)});
}));
app.delete('/api/showcase/:id',auth,withOrg,roles('owner'),api((req,res)=>{row(req,'showcase_items',req.params.id);db.prepare('DELETE FROM showcase_items WHERE id=? AND org_id=?').run(req.params.id,req.user.org_id);res.json({ok:true});}));
app.post('/api/reviews',auth,withOrg,roles('owner'),api((req,res)=>{
 const name=text(req.body.name,90),review=text(req.body.text,700),rating=Number(req.body.rating);requireField(name,'Le nom');requireField(review,"L'avis");if(!Number.isInteger(rating)||rating<1||rating>5)throw err(400,'Note invalide.');
 const id=recordId(req.body.id);if(db.prepare('SELECT id FROM reviews WHERE id=? AND org_id=?').get(id,req.user.org_id))return res.json({item:row(req,'reviews',id)});
 db.prepare('INSERT INTO reviews (id,org_id,name,rating,text,created_at) VALUES (?,?,?,?,?,?)').run(id,req.user.org_id,name,rating,review,iso());res.status(201).json({item:row(req,'reviews',id)});
}));
app.patch('/api/appointments/:id',auth,withOrg,roles('owner','tailor'),api((req,res)=>{row(req,'appointments',req.params.id);const status=text(req.body.status,20);if(!['new','contacted','done'].includes(status))throw err(400,'Statut invalide.');db.prepare('UPDATE appointments SET status=? WHERE id=? AND org_id=?').run(status,req.params.id,req.user.org_id);res.json({item:row(req,'appointments',req.params.id)});}));

async function sendSms(to,message){
 const {TWILIO_ACCOUNT_SID:sid,TWILIO_AUTH_TOKEN:token,TWILIO_FROM:from}=process.env;
 if(!sid||!token||!from)throw err(503,"L'envoi SMS n'est pas configuré.");
 const body=new URLSearchParams({To:to,From:from,Body:message});const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(sid+':'+token).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw err(502,"Le SMS n'a pas pu être envoyé.");return r.json();
}
async function sendWhatsapp(to,kind,clientName,date){
 const {WHATSAPP_ACCESS_TOKEN:token,WHATSAPP_PHONE_ID:phoneId,WHATSAPP_TEMPLATE_NAME:template}=process.env;
 if(!token||!phoneId||!template)throw err(503,"L'envoi WhatsApp n'est pas configuré.");
 // A Meta-approved template with 3 body variables: client name, reminder type, date.
 const body={messaging_product:'whatsapp',to:to.replace(/\D/g,''),type:'template',template:{name:template,language:{code:'fr'},components:[{type:'body',parameters:[{type:'text',text:clientName},{type:'text',text:kind},{type:'text',text:date}]}]}};
 const r=await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw err(502,"Le message WhatsApp n'a pas pu être envoyé. Vérifiez votre modèle approuvé.");return r.json();
}
app.post('/api/communications/send',auth,withOrg,roles('owner','tailor','accountant'),api(async(req,res)=>{
 const order=row(req,'orders',req.body.order_id),client=clientOut(row(req,'clients',order.client_id));if(!client.phone)throw err(400,'Ajoutez un numéro de téléphone à la fiche client.');
 const channel=text(req.body.channel,20),kind=text(req.body.kind,60)||'votre commande',date=order.due_date;
 if(channel==='sms')await sendSms(client.phone,`Bonjour ${client.name}, rappel ${kind} pour votre commande ${order.reference} à ${req.org.name}. Date : ${date}. Contact : ${req.org.whatsapp_phone}`);
 else if(channel==='whatsapp')await sendWhatsapp(client.phone,kind,client.name,date);
 else throw err(400,'Canal inconnu.');res.json({ok:true});
}));
// Scheduled reminders: enabled opt-in only. Failures do not create a log, so the next run can retry.
async function runReminders(){
 const today=new Date().toISOString().slice(0,10),tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
 const enabled=db.prepare('SELECT * FROM organizations WHERE is_demo=0 AND (reminders_sms=1 OR reminders_whatsapp=1)').all();
 for(const org of enabled){
  const due=db.prepare("SELECT o.*,c.name client_name,c.phone_encrypted FROM orders o JOIN clients c ON c.id=o.client_id WHERE o.org_id=? AND o.status='active' AND (o.due_date=? OR o.fitting_date=?) LIMIT 100").all(org.id,tomorrow,tomorrow);
  for(const order of due){const phone=clientOut(order).phone;if(!phone)continue;
   for(const channel of ['sms','whatsapp']){if(channel==='sms'&&!org.reminders_sms||channel==='whatsapp'&&!org.reminders_whatsapp)continue;
    const kind=order.fitting_date===tomorrow?'essayage':'retrait';if(db.prepare('SELECT id FROM reminder_log WHERE order_id=? AND channel=? AND kind=? AND date_key=?').get(order.id,channel,kind,today))continue;
    try{if(channel==='sms')await sendSms(phone,`Bonjour ${order.client_name}, votre ${kind} à ${org.name} est prévu le ${tomorrow}. À bientôt !`);
     else await sendWhatsapp(phone,kind,order.client_name,tomorrow);
     db.prepare('INSERT OR IGNORE INTO reminder_log (id,org_id,order_id,channel,kind,date_key,sent_at) VALUES (?,?,?,?,?,?,?)').run(uuid(),org.id,order.id,channel,kind,today,iso());
    }catch(e){console.error('Reminder delivery:',e.message);}
   }
  }
  const unpaid=db.prepare(`SELECT o.*,c.name client_name,c.phone_encrypted,o.price-COALESCE(SUM(CASE WHEN p.status='paid' THEN p.amount ELSE 0 END),0) AS remaining
   FROM orders o JOIN clients c ON c.id=o.client_id LEFT JOIN payments p ON p.order_id=o.id
   WHERE o.org_id=? AND o.status='active' AND o.due_date<?
   GROUP BY o.id,c.name,c.phone_encrypted HAVING o.price-COALESCE(SUM(CASE WHEN p.status='paid' THEN p.amount ELSE 0 END),0)>0 LIMIT 100`).all(org.id,today);
  for(const order of unpaid){
   const days=Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(order.due_date+'T00:00:00Z'))/86400000);
   if(![1,7,14].includes(days))continue;const phone=clientOut(order).phone;if(!phone)continue;
   for(const channel of ['sms','whatsapp']){
    if(channel==='sms'&&!org.reminders_sms||channel==='whatsapp'&&!org.reminders_whatsapp)continue;
    if(db.prepare('SELECT id FROM reminder_log WHERE order_id=? AND channel=? AND kind=? AND date_key=?').get(order.id,channel,'paiement',today))continue;
    try{
     if(channel==='sms')await sendSms(phone,`Bonjour ${order.client_name}, le solde de votre commande ${order.reference} chez ${org.name} est de ${money(order.remaining)}. Contactez-nous pour organiser le règlement.`);
     else await sendWhatsapp(phone,'rappel du paiement',order.client_name,today);
     db.prepare('INSERT OR IGNORE INTO reminder_log (id,org_id,order_id,channel,kind,date_key,sent_at) VALUES (?,?,?,?,?,?,?)').run(uuid(),org.id,order.id,channel,'paiement',today,iso());
    }catch(e){console.error('Payment reminder delivery:',e.message);}
   }
  }
 }
}
app.get('/api/cron/reminders',api(async(req,res)=>{
 if(!process.env.CRON_SECRET||req.get('Authorization')!==`Bearer ${process.env.CRON_SECRET}`)throw err(401,'Accès refusé.');
 await runReminders();
 if(hostedDb)db.prepare('DELETE FROM rate_limits WHERE started<?').run(Date.now()-2*864e5);
 res.json({ok:true});
}));
if(!hostedDb)setInterval(()=>runReminders().catch(e=>console.error(e)),60*60*1000).unref();

function publicData(org){const {slug,name,description,address,city,neighborhood,whatsapp_phone,logo_url,cover_url,currency}=org;return {organization:{slug,name,description,address,city,neighborhood,whatsapp_phone,logo_url,cover_url,currency,specialties:JSON.parse(org.specialties||'[]')},showcase:list('showcase_items',org.id),reviews:list('reviews',org.id),branches:list('branches',org.id).map(({name,address,city,phone})=>({name,address,city,phone}))};}
app.get('/api/public/:slug',api((req,res)=>{const org=orgBySlug(req.params.slug);if(!org)throw err(404,'Atelier introuvable.');res.json(publicData(org));}));
const appointmentHits=new Map();
app.post('/api/public/:slug/appointments',api((req,res)=>{
 const org=orgBySlug(req.params.slug);if(!org)throw err(404,'Atelier introuvable.');
 limit(appointmentHits,'rdv:'+req.ip,8,3600000,'Trop de demandes. Réessayez plus tard.');
 const name=text(req.body.name,90),phone=normalizePhone(req.body.phone),date=text(req.body.preferred_date,10);requireField(name,'Votre nom');if(!validDate(date))throw err(400,'Choisissez une date valide.');
 db.prepare('INSERT INTO appointments (id,org_id,name,phone,preferred_date,message,created_at) VALUES (?,?,?,?,?,?,?)').run(uuid(),org.id,name,phone,date,text(req.body.message,500),iso());res.status(201).json({ok:true,message:"Votre demande a été envoyée à l'atelier. Il vous recontactera pour confirmer le rendez-vous."});
}));
app.get('/sitemap.xml',api((req,res)=>{const url=baseUrl||`${req.protocol}://${req.get('host')}`;const orgs=db.prepare('SELECT slug FROM organizations WHERE is_demo=0').all();res.type('xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+orgs.map(o=>`<url><loc>${url}/${encodeURIComponent(o.slug)}</loc></url>`).join('')+'</urlset>');}));
app.get('/robots.txt',(req,res)=>res.type('text').send('User-agent: *\nDisallow: /app\nDisallow: /api\nDisallow: /auth\nSitemap: '+(baseUrl||`${req.protocol}://${req.get('host')}`)+'/sitemap.xml\n'));
app.get('/api/health',(req,res)=>{
 try {
  db.prepare('SELECT COUNT(*) AS total FROM organizations').get();
  res.json({ok:true,database:'ready',time:iso()});
 } catch (error) {
  console.error('Database health check failed:', error.message);
  res.status(503).json({ok:false,database:'unavailable'});
 }
});
app.use('/api',(req,res,next)=>next(err(404,'Cette adresse API n’existe pas.')));
app.use((error,req,res,next)=>{
 console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`,error.message);
 if(res.headersSent)return next(error);
 if(error instanceof multer.MulterError)return res.status(400).json({error:'Fichier trop volumineux ou invalide.'});
 res.status(error.status||500).json({error:error.status?error.message:'Une erreur est survenue. Veuillez réessayer.',...(error.current?{current:error.current}:{})});
});

function publicMedia(req,url){return new URL(url||'/assets/atelier-hero.jpg',baseUrl||`${req.protocol}://${req.get('host')}`).href;}
function seoHead(req){
 const slug=decodeURIComponent(req.path.split('/')[1]||'');if(req.path.startsWith('/app')||req.path.startsWith('/auth')||req.path.startsWith('/onboarding'))return '<meta name="robots" content="noindex, nofollow">';
 const org=orgBySlug(slug);if(!org)return '';
 const {showcase,reviews}=publicData(org);const url=(baseUrl||`${req.protocol}://${req.get('host')}`)+'/'+encodeURIComponent(slug);
 const safe=(s)=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const json=(o)=>JSON.stringify(o).replace(/</g,'\\u003c');const address={ '@type':'PostalAddress',streetAddress:org.address,addressLocality:org.city,addressCountry:'CI'};
 const schema={'@context':'https://schema.org','@type':['LocalBusiness','ClothingStore'],'@id':url+'#atelier',name:org.name,description:org.description,url,telephone:org.whatsapp_phone,image:showcase.map(x=>publicMedia(req,x.image_url)),address,
 areaServed:org.city,hasOfferCatalog:{'@type':'OfferCatalog',name:'Créations sur mesure',itemListElement:showcase.map(x=>({'@type':'OfferCatalog',name:x.title,itemListElement:[{'@type':'Offer',itemOffered:{'@type':'Product',name:x.title,image:publicMedia(req,x.image_url),description:x.description},...(x.price?{price:x.price,priceCurrency:'XOF'}:{})}]}))},
 ...(reviews.length?{aggregateRating:{'@type':'AggregateRating',ratingValue:(reviews.reduce((a,x)=>a+x.rating,0)/reviews.length).toFixed(1),reviewCount:reviews.length}}:{})};
 return `<title>${safe(org.name)} — Couture sur mesure à ${safe(org.city)} | KouturePro</title><meta name="description" content="${safe(org.description)}">${org.is_demo?'<meta name="robots" content="noindex, nofollow">':''}<link rel="canonical" href="${safe(url)}"><meta property="og:type" content="website"><meta property="og:title" content="${safe(org.name)} — Sur mesure à ${safe(org.city)}"><meta property="og:description" content="${safe(org.description)}"><meta property="og:image" content="${safe(publicMedia(req,org.cover_url))}"><script type="application/ld+json">${json(schema)}</script>`;
}
function insertSeo(req,html){
 const head=seoHead(req);if(head.includes('<title>'))html=html.replace(/<title>[^<]*<\/title>/,'').replace(/<meta name="description"[^>]*>/,'');
 html=html.replace('</head>',head+'</head>');
 // Crawlable, useful HTML is available even to clients that don't execute JavaScript.
 // React replaces this same-content fallback when the interactive page loads.
 const slug=decodeURIComponent(req.path.split('/')[1]||''),org=orgBySlug(slug);
 if(org){
  const escape=(s)=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const gallery=list('showcase_items',org.id),reviews=list('reviews',org.id),phone=org.whatsapp_phone.replace(/\D/g,'');
  const fallback=`<div id="root"><style>.seo-fallback{font-family:Arial,sans-serif;background:#f9f8f3;color:#193b2d;margin:-8px;min-height:100vh}.seo-fallback header,.seo-fallback main,.seo-fallback footer{padding:25px max(6%,20px)}.seo-fallback header{display:flex;align-items:center;justify-content:space-between;background:#143e2e;color:white}.seo-fallback header a{color:white}.seo-fallback .hero{background:#17372e url('${escape(org.cover_url||'/assets/atelier-hero.jpg')}') center/cover;color:white;padding:100px max(6%,20px)}.seo-fallback .hero h1{font-family:Georgia,serif;font-size:clamp(38px,6vw,70px);max-width:680px;line-height:1.12}.seo-fallback p{line-height:1.7;max-width:750px}.seo-fallback .grid{display:flex;gap:16px;flex-wrap:wrap}.seo-fallback article{width:min(100%,295px)}.seo-fallback article img{width:100%;height:245px;object-fit:cover}.seo-fallback h2{font-family:Georgia,serif;font-size:31px}.seo-fallback a.btn{display:inline-block;padding:12px 20px;background:#e2e6d2;color:#143b2a;text-decoration:none;font-weight:bold}@media(max-width:620px){.seo-fallback .hero{padding:75px 22px}}</style><div class="seo-fallback"><header><strong>${escape(org.name)}</strong><a href="https://wa.me/${phone}">WhatsApp ↗</a></header><section class="hero"><h1>L’élégance se dessine sur mesure.</h1><p>${escape(org.description)}</p><a class="btn" href="https://wa.me/${phone}">Prendre rendez-vous</a></section><main><h2>Notre atelier à ${escape(org.city)}</h2><p>${escape(org.name)} · ${escape(org.address)} · ${escape(org.city)}, Côte d’Ivoire.</p><p>Nos spécialités : ${JSON.parse(org.specialties||'[]').map(escape).join(' · ')}</p><h2>Nos réalisations</h2><div class="grid">${gallery.map(x=>`<article><img src="${escape(x.image_url)}" alt="${escape(x.title)}"><h3>${escape(x.title)}</h3><p>${escape(x.description)}</p></article>`).join('')}</div><h2>Avis de nos clients</h2>${reviews.map(x=>`<p>« ${escape(x.text)} » — ${escape(x.name)} (${x.rating}/5)</p>`).join('')}</main><footer>Contact : ${escape(org.whatsapp_phone)} · ${escape(org.city)}</footer></div></div>`;
  html=html.replace('<div id="root"></div>',fallback);
 }
 return html;
}
if(process.env.API_ONLY==='1'){
 app.use(express.static(path.resolve('public')));
 app.get('*',(req,res)=>{const html=insertSeo(req,fs.readFileSync(path.resolve('index.html'),'utf8'));res.type('html').send(html);});
}else if(process.env.NODE_ENV!=='production'&&process.env.SERVE_BUILD!=='1'){
 const {createServer:createViteServer}=await import('vite');
 const vite=await createViteServer({server:{middlewareMode:true,host:'0.0.0.0',allowedHosts:true},appType:'custom'});
 app.use(vite.middlewares);
 app.get('*',async(req,res,next)=>{try{let html=fs.readFileSync(path.resolve('index.html'),'utf8');html=insertSeo(req,html);html=await vite.transformIndexHtml(req.originalUrl,html);res.status(200).set({'Content-Type':'text/html','Cache-Control':'no-cache'}).end(html);}catch(e){vite.ssrFixStacktrace(e);next(e);}});
}else{
 app.use(express.static(path.resolve('dist'),{maxAge:'1h'}));
 // Gallery uploads are served from DATA_DIR/public-uploads by the middleware above.
 app.get('*',(req,res)=>{let html=fs.readFileSync(path.resolve('dist/index.html'),'utf8');html=insertSeo(req,html);res.type('html').send(html);});
}
if (process.env.VERCEL !== '1') app.listen(port,'0.0.0.0',()=>console.log(`KouturePro ready on http://0.0.0.0:${port} (${demoMode?'demo':'production'})`));
export default app;
