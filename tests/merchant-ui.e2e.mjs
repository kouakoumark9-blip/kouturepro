import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit,devices} from 'playwright';
const engine=process.env.TEST_WEBKIT==='1'?webkit:chromium;

// Fully disposable SQLite & HTTP server: NEVER aim this test at Neon/Production.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kp-merchant-ui-'));
const port=47900+crypto.randomInt(0,400),base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),env:{...process.env,
  DATA_DIR:dir,PORT:String(port),NODE_ENV:'development',SEED_DEMO:'0',USE_POSTGRES:'0',SERVE_BUILD:'1',API_ONLY:'0',PUBLIC_BASE_URL:base,
  // Core merchant flows deliberately run with no external payment, messaging, or e-mail API credentials.
  RESEND_API_KEY:'',RESET_FROM_EMAIL:'',CINETPAY_API_KEY:'',CINETPAY_SITE_ID:'',
  TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',WHATSAPP_ACCESS_TOKEN:'',WHATSAPP_PHONE_ID:''
},stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',data=>output+=data);server.stderr.on('data',data=>output+=data);
let browser;
async function ready(){for(let i=0;i<200;i++){
 if(server.exitCode!==null)throw Error('Server stopped: '+output);
 try{const result=await fetch(base+'/api/health');if(result.ok)return}catch{}
 await new Promise(resolve=>setTimeout(resolve,100));
}throw Error('Server unavailable: '+output)}
async function section(page,label){await page.getByRole('button',{name:'Menu'}).click();await page.locator('.mp-sidebar nav').getByRole('button',{name:label}).click()}
async function noOverflow(page,step){const metrics=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(metrics.scroll<=metrics.width+1,`${step}: horizontal overflow ${JSON.stringify(metrics)}`)}
async function attempt(step,action,page){try{await action();console.log('✓ '+step)}catch(error){let diagnostic='';try{diagnostic=(await page.locator('body').innerText()).slice(-1400)}catch{}
  throw new Error(`${step}: ${error.message}\nUI: ${diagnostic}\nSERVER: ${output.slice(-1000)}`)}}
try{
 await ready();
 const noKeyConfig=await (await fetch(base+'/api/merchant/countries')).json();
 assert.equal(noKeyConfig.reset_email_available,false,'No e-mail provider: signup/payments still work but automatic password reset stays disabled');
 browser=await engine.launch(engine===chromium?{headless:true,args:['--no-sandbox']}:{headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
   ...(engine===webkit?{userAgent:devices['iPhone 13'].userAgent}:{}),serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const email='ama-'+crypto.randomUUID()+'@example.test',staffEmail='staff-'+crypto.randomUUID()+'@example.test';
 await attempt('merchant signup in Ghana',async()=>{
  await page.goto(base+'/marchands');await page.getByRole('button',{name:/Nouveau marchand/}).click();
  await page.getByLabel('Votre nom').fill('Ama Browser');await page.getByLabel('Nom de l’entreprise').fill('Accra Browser Tests');
  await page.getByLabel('Pays de l’entreprise').selectOption('GH');
  assert.equal(await page.getByRole('combobox',{name:'Indicatif téléphonique'}).inputValue(),'GH');
  await page.getByLabel('Téléphone',{exact:true}).fill('024 123 4567');
  await page.getByLabel('Adresse e-mail').fill(email);await page.getByLabel('Mot de passe',{exact:true}).fill('SecurePassword2026!');
  await page.getByLabel('Confirmer le mot de passe').fill('SecurePassword2026!');await page.getByRole('button',{name:'Créer un compte'}).click();
  await page.locator('.mp-top').waitFor({timeout:20000});
  assert.match(await page.locator('.mp-workspace').innerText(),/GHS/);await noOverflow(page,'dashboard');
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),'/marchands.webmanifest');
  await page.getByRole('combobox',{name:'Langue'}).selectOption('en');
  assert.equal((await page.locator('.mp-top strong').first().innerText()).trim(),'Overview');
  await page.getByRole('combobox',{name:'Language'}).selectOption('fr');
  if(engine===webkit)assert.match(await page.locator('.mp-install').innerText(),/Partager.*Sur l’écran d’accueil/);
  await page.setViewportSize({width:320,height:568});await noOverflow(page,'320px dashboard');
  await page.setViewportSize({width:390,height:844});
 },page);
 await attempt('client with Côte d’Ivoire calling code and explicit consent',async()=>{
  await section(page,'Clients');await page.getByLabel('Votre nom',{exact:true}).fill('Client CI');
  await page.getByRole('combobox',{name:'Indicatif téléphonique'}).selectOption('CI');
  await page.getByLabel('Téléphone',{exact:true}).fill('07 12 34 56 78');
  await page.getByText(/Le client accepte d’être contacté/).click();
  await page.getByRole('button',{name:'Ajouter un client'}).click();
  await page.getByText('+2250712345678').first().waitFor({timeout:10000});await noOverflow(page,'clients');
 },page);
 await attempt('manual payment method and GHS order',async()=>{
  await section(page,'Moyens de paiement');
  const m=page.locator('.mp-method').filter({hasText:'MTN MoMo'});
  await m.getByRole('combobox',{name:'Indicatif téléphonique'}).selectOption('GH');
  await m.getByLabel('Numéro destinataire').fill('024 765 4321');await m.getByLabel('Activer').check();await m.getByRole('button',{name:'Enregistrer'}).click();
  await page.getByRole('alert').filter({hasText:'Erreur'}).count().then(n=>assert.equal(n,0));
  await section(page,'Commandes');await page.getByLabel('Chercher un client par nom ou téléphone').fill('Client CI');
  await page.locator('.mp-columns form select').first().selectOption({index:1});
  await page.getByLabel('Description').fill('Article test');await page.getByLabel('Montant · GHS').fill('123.50');
  await page.getByRole('button',{name:'Nouvelle commande'}).click();
  await page.getByText('Article test').first().waitFor();
  assert.match(await page.locator('.mp-order').first().innerText(),/GHS|GH₵|₵/);await noOverflow(page,'orders');
 },page);
 let link,staffLink;
 await attempt('48-hour public link with manual sharing only',async()=>{
  await page.getByRole('button',{name:/Créer un lien/}).click();
  await page.locator('.mp-share-url').first().waitFor();
  link=(await page.locator('.mp-share-url').first().innerText()).trim();
  assert.match(link,new RegExp('^'+base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/pay/[A-Za-z0-9_-]{43,}$'));
  await page.getByRole('button',{name:'Partager le lien'}).click();
  await page.getByRole('link',{name:'Envoyer par WhatsApp'}).waitFor();
  assert.match(await page.locator('.mp-share').innerText(),/Envoyer par WhatsApp/);
 },page);
 const publicContext=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const payment=await publicContext.newPage();payment.on('pageerror',error=>errors.push(error.message));
 await attempt('anonymous customer claims a transaction reference',async()=>{
  await payment.goto(link);await payment.getByRole('heading',{name:'Accra Browser Tests'}).waitFor();
  assert.match(await payment.locator('.mp-pay-hero').innerText(),/123,50/);
  await payment.getByRole('combobox',{name:'Langue'}).selectOption('en');
  await payment.getByText('Amount to pay').waitFor();
  await payment.getByRole('combobox',{name:'Langue'}).selectOption('fr');
  await payment.getByLabel('Référence').fill('MTN-987654');await payment.getByRole('button',{name:'J’ai payé'}).click();
  await payment.getByText(/À vérifier/).waitFor();await noOverflow(payment,'public payment');
 },payment);
 await attempt('merchant confirms, customer sees paid status',async()=>{
  await page.getByRole('button',{name:'Actualiser'}).click();
  await page.getByRole('button',{name:'Marquer comme payé'}).click();await page.getByText('Payée',{exact:true}).first().waitFor();
  await payment.reload();await payment.getByText('Paiement confirmé par le marchand.').waitFor();
 },page);
 await attempt('offline customer drafts sync automatically on reconnection',async()=>{
  await context.setOffline(true);
  await section(page,'Clients');await page.getByLabel('Votre nom',{exact:true}).fill('Hors ligne CI');
  await page.getByRole('combobox',{name:'Indicatif téléphonique'}).selectOption('CI');
  await page.getByLabel('Téléphone',{exact:true}).fill('07 23 45 67 89');
  await page.getByRole('button',{name:'Ajouter un client'}).click();
  await page.getByText('Hors ligne CI').first().waitFor({timeout:10000});
  assert.match(await page.locator('.mp-content').innerText(),/Hors ligne CI/);
  await context.setOffline(false);
  await page.getByText('Hors ligne CI').first().waitFor({timeout:12000});
  await page.getByRole('status',{name:/En ligne/}).waitFor({timeout:15000});
 },page);
 await attempt('staff invitation can be shared and revoked',async()=>{
  await section(page,'Personnel');await page.getByLabel('Adresse e-mail').fill(staffEmail);
  await page.getByRole('button',{name:'Inviter un membre'}).click();
  await page.getByText(/Copiez ce lien à usage unique/).waitFor();
  await page.getByRole('button',{name:'Révoquer'}).click();
  await page.getByRole('heading',{name:'Invitations en attente'}).waitFor({state:'detached'});
  await page.getByLabel('Adresse e-mail').fill(staffEmail);
  await page.getByRole('button',{name:'Inviter un membre'}).click();
  await page.locator('.mp-share-url').waitFor();
  staffLink=(await page.locator('.mp-share-url').innerText()).trim();
 },page);
 const staffContext=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const staff=await staffContext.newPage();staff.on('pageerror',error=>errors.push(error.message));
 await attempt('invited staff joins with email and cannot change payment settings',async()=>{
  await staff.goto(staffLink);
  await staff.getByText(/Connectez-vous avec l’e-mail invité/).waitFor();
  await staff.getByRole('button',{name:/Nouveau marchand/}).click();
  assert.equal(await staff.getByLabel('Nom de l’entreprise').count(),0);
  await staff.getByLabel('Votre nom').fill('Staff Member');
  await staff.getByLabel('Adresse e-mail').fill(staffEmail);
  await staff.getByLabel('Mot de passe',{exact:true}).fill('SecureStaff2026!');
  await staff.getByLabel('Confirmer le mot de passe').fill('SecureStaff2026!');
  await staff.getByRole('button',{name:'Créer un compte'}).click();
  await staff.locator('.mp-top').waitFor({timeout:20000});
  assert.match(await staff.locator('.mp-workspace').innerText(),/Accra Browser Tests/);
  await section(staff,'Moyens de paiement');
  assert.equal(await staff.locator('.mp-method').filter({hasText:'MTN MoMo'}).getByLabel('Activer').isDisabled(),true);
  await section(staff,'Personnel');
  assert.equal(await staff.getByRole('button',{name:'Inviter un membre'}).count(),0);
  await noOverflow(staff,'staff mobile');
 },staff);
 await attempt('owner can disable staff without deleting orders',async()=>{
  await page.getByRole('button',{name:'Actualiser'}).click();
  await page.getByRole('button',{name:'Désactiver'}).waitFor();
  await page.getByRole('button',{name:'Désactiver'}).click();
  await page.getByRole('button',{name:'Réactiver'}).waitFor();
  const r=await staff.request.get(base+'/api/merchant/dashboard',{headers:{'X-Merchant-Id':(await page.request.get(base+'/api/merchant/memberships').then(r=>r.json())).memberships[0].org_id}});
  assert.equal(r.status(),403);
 },page);
 await staffContext.close();
 assert.deepEqual(errors,[],'Browser JavaScript errors');
 console.log(`✓ ${engine===webkit?'WebKit iPhone':'Chromium Android'} mobile: merchant, clients, payments, offline draft and invitations`);
 await context.close();await publicContext.close();
}finally{await browser?.close();server.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true})}
