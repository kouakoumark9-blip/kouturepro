import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated browser journey: no changes to the live demonstration database.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kp-auth-browser-'));
const port=48000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),env:{...process.env,DATA_DIR:dir,PORT:String(port),NODE_ENV:'development',SEED_DEMO:'0',SERVE_BUILD:'1'},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
async function wait(){for(let n=0;n<100;n++){if(server.exitCode!==null)throw Error('Serveur arrêté : '+log);try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Serveur non prêt : '+log);}
let browser;
try{
 await wait();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/app',{waitUntil:'networkidle'});
 await page.getByRole('tab',{name:'Connexion'}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/auth','Sans session, l’application exige une connexion.');
 assert.equal(await page.getByText('Juste une dernière étape.').count(),0);
 assert.equal(await page.getByRole('button',{name:'Recevoir mon code'}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Explorer l’atelier de démonstration'}).count(),0);
 const incomplete=await page.request.post(base+'/api/auth/signup',{headers:{'X-Requested-With':'KouturePro'},data:{name:'Awa Test',identifier:'pseudo-sans-arobase',password:'CoutureTest2026!'}});
 assert.equal(incomplete.status(),400);
 assert.match((await incomplete.json()).error,/e-mail complet.*@.*\+225/);
 await page.getByRole('tab',{name:'Inscription'}).click();
 await page.getByLabel(/^Votre nom/).fill('Awa Test');
 await page.getByLabel('E-mail ou numéro de téléphone').fill('AWA@EXEMPLE.CI');
 await page.getByLabel(/^Mot de passe/).fill('CoutureTest2026!');
 await page.getByLabel(/^Confirmer le mot de passe/).fill('CoutureTest2026!');
 await page.getByRole('button',{name:'Créer mon compte'}).click();
 await page.getByRole('heading',{name:'Préparons votre atelier.'}).waitFor();
 assert.equal(await page.getByText('Étape 2 sur 2').isVisible(),true,'Un nouvel inscrit doit passer à une seule étape avant son tableau de bord.');
 // Le navigateur garde la session et reprend l’étape atelier automatiquement.
 await page.goto(base+'/auth');await page.getByRole('heading',{name:'Préparons votre atelier.'}).waitFor();
 // Sur un second appareil sans cookie, une inscription interrompue se reprend
 // avec les mêmes identifiants, sans créer de doublon.
 const resumedContext=await browser.newContext({viewport:{width:390,height:844}});
 const resumed=await resumedContext.newPage();
 await resumed.goto(base+'/auth');await resumed.getByRole('tab',{name:'Inscription'}).click();
 await resumed.getByLabel(/^Votre nom/).fill('Awa Test');
 await resumed.getByLabel('E-mail ou numéro de téléphone').fill('AWA@EXEMPLE.CI');
 await resumed.getByLabel(/^Mot de passe/).fill('CoutureTest2026!');
 await resumed.getByLabel(/^Confirmer le mot de passe/).fill('CoutureTest2026!');
 await resumed.getByRole('button',{name:'Créer mon compte'}).click();
 await resumed.getByRole('heading',{name:'Préparons votre atelier.'}).waitFor();
 await resumedContext.close();
 await page.reload();await page.getByRole('heading',{name:'Préparons votre atelier.'}).waitFor();
 assert.equal(await page.getByLabel('WhatsApp professionnel (facultatif)').count(),0,'Seulement le nom et la ville sont demandés.');
 await page.getByLabel('Nom de votre atelier').fill('Maison des Étoiles');
 await page.getByLabel('Ville').fill('Duekoué');
 await page.getByRole('button',{name:/Ouvrir mon tableau de bord/}).click();
 await page.getByRole('heading',{name:/Bonjour Awa/}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/app');
 const ownDashboard=await page.request.get(base+'/api/bootstrap');assert.equal(ownDashboard.status(),200);
 const ownData=await ownDashboard.json();
 assert.equal(ownData.organization.slug,'maison-des-etoiles','Chaque compte doit ouvrir son propre atelier.');
 assert.equal(ownData.organization.whatsapp_phone,'','WhatsApp n’est pas obligatoire pour un compte créé par e-mail.');
 const publicSite=await page.request.get(base+'/maison-des-etoiles');assert.equal(publicSite.status(),200);
 await page.goto(base+'/maison-des-etoiles');await page.locator('.public-site').waitFor();
 assert.equal(await page.getByRole('link',{name:/WhatsApp/}).count(),0,'Ne pas proposer un lien WhatsApp sans numéro.');
 await page.goto(base+'/app/settings');await page.getByRole('heading',{name:'Paramètres'}).waitFor();
 await page.locator('.logout-btn').click();await page.getByRole('tab',{name:'Connexion'}).waitFor();
 await page.goto(base+'/app');await page.getByRole('tab',{name:'Connexion'}).waitFor();
 await page.getByLabel('E-mail ou numéro de téléphone').fill('awa@exemple.ci');
 await page.getByLabel(/^Mot de passe/).fill('CoutureTest2026!');
 await page.getByRole('button',{name:'Se connecter'}).click();
 await page.getByRole('heading',{name:/Bonjour Awa/}).waitFor();
 await page.goto(base+'/auth');await page.getByRole('heading',{name:/Bonjour Awa/}).waitFor();
 await page.goto(base+'/');await page.getByRole('heading',{name:/Bonjour Awa/}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/app','Le retour sur le site rouvre directement le tableau de bord.');
 // A server outage is not an expired session. Show a retry instead of
 // silently throwing a signed-in user back to the login page.
 const failedContext=await browser.newContext({viewport:{width:390,height:844}});
 await failedContext.addCookies(await page.context().cookies(base));
 const temporarilyDown=await failedContext.newPage();temporarilyDown.on('pageerror',e=>errors.push(e.message));
 await temporarilyDown.route('**/api/bootstrap',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Base momentanément indisponible.'})}));
 await temporarilyDown.goto(base+'/app');
 await temporarilyDown.getByRole('heading',{name:'Impossible d’ouvrir le tableau de bord'}).waitFor();
 assert.equal(new URL(temporarilyDown.url()).pathname,'/app');
 await temporarilyDown.unroute('**/api/bootstrap');
 await temporarilyDown.getByRole('button',{name:'Réessayer'}).click();
 await temporarilyDown.getByRole('heading',{name:/Bonjour Awa/}).waitFor();
 await failedContext.close();
 // A connected account can continue reading its own cached data without network.
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.context().setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:/Bonjour Awa/}).waitFor();
 await page.context().setOffline(false);await page.reload({waitUntil:'networkidle'});
 await page.goto(base+'/app/settings');await page.getByRole('heading',{name:'Paramètres'}).waitFor();
 await page.locator('.settings-card').filter({hasText:'Sécurité du compte'}).getByRole('button',{name:/Modifier/}).click();
 await page.getByLabel(/^Mot de passe actuel/).fill('CoutureTest2026!');
 await page.getByLabel(/^Nouveau mot de passe/).fill('NouveauCouture2026!');
 await page.getByLabel(/^Confirmer le nouveau mot de passe/).fill('NouveauCouture2026!');
 await page.getByRole('button',{name:'Enregistrer le mot de passe'}).click();
 await page.getByRole('dialog',{name:'Changer mon mot de passe'}).waitFor({state:'hidden'});
 await page.locator('.logout-btn').click();await page.getByRole('tab',{name:'Connexion'}).waitFor();
 await page.getByLabel('E-mail ou numéro de téléphone').fill('awa@exemple.ci');
 await page.getByLabel(/^Mot de passe/).fill('NouveauCouture2026!');
 await page.getByRole('button',{name:'Se connecter'}).click();await page.getByRole('heading',{name:/Bonjour Awa/}).waitFor();
 const context=await browser.newContext({viewport:{width:390,height:844}});const phone=await context.newPage();phone.on('pageerror',e=>errors.push(e.message));
 await phone.goto(base+'/auth');await phone.getByRole('tab',{name:'Inscription'}).click();
 await phone.getByLabel(/^Votre nom/).fill('Fatou Téléphone');
 await phone.getByLabel('E-mail ou numéro de téléphone').fill('+225 07 09 09 01 01');
 await phone.getByLabel(/^Mot de passe/).fill('CouturePhone2026!');
 await phone.getByLabel(/^Confirmer le mot de passe/).fill('CouturePhone2026!');
 await phone.getByRole('button',{name:'Créer mon compte'}).click();
 await phone.getByRole('heading',{name:'Préparons votre atelier.'}).waitFor();
 const me=await phone.request.get(base+'/api/auth/me');assert.equal(me.status(),200);const user=(await me.json()).user;
 assert.equal(user.phone,'+2250709090101');assert.equal(user.email,'');assert.equal(user.password_hash,undefined);
 assert.equal(await phone.locator('input[type=tel]').count(),0,'Le téléphone du compte est repris sans champ supplémentaire.');
 await phone.getByLabel('Nom de votre atelier').fill('Maison du Téléphone');
 // La base confirme la création, mais la réponse se perd : le navigateur
 // récupère l’atelier existant et ouvre quand même le tableau de bord.
 await phone.route('**/api/onboarding',async route=>{
  const response=await route.fetch();assert.equal(response.status(),200);
  await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Atelier déjà créé.'})});
 });
 await phone.getByRole('button',{name:/Ouvrir mon tableau de bord/}).click();
 await phone.getByRole('heading',{name:/Bonjour Fatou/}).waitFor();
 await phone.unroute('**/api/onboarding');
 const phoneData=await (await phone.request.get(base+'/api/bootstrap')).json();
 assert.equal(phoneData.organization.whatsapp_phone,'+2250709090101','Préremplir le téléphone du propriétaire pour WhatsApp.');
 assert.deepEqual(errors,[]);
 console.log('✓ Sans session : Connexion / Inscription, aucun code ni démo automatique');
 console.log('✓ Inscription e-mail → nom et ville uniquement → tableau de bord');
 console.log('✓ Reprise de session et du compte sur un autre appareil, rechargement, changement de mot de passe');
 console.log('✓ Inscription téléphone → étape unique → tableau de bord, identifiant normalisé');
}finally{if(browser)await browser.close();server.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});}
