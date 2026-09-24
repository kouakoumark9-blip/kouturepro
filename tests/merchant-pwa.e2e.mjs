import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit,devices} from 'playwright';
const engine=process.env.TEST_WEBKIT==='1'?webkit:chromium;

// A disposable local database and server only: never send this test to Production.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kp-merchant-pwa-'));
const port=48200+crypto.randomInt(0,400),base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),env:{...process.env,
  DATA_DIR:dir,PORT:String(port),NODE_ENV:'development',SEED_DEMO:'0',USE_POSTGRES:'0',SERVE_BUILD:'1',API_ONLY:'0',PUBLIC_BASE_URL:base
},stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',data=>output+=data);server.stderr.on('data',data=>output+=data);
let browser;
try{
 let ready=false;
 for(let i=0;i<200;i++){
  if(server.exitCode!==null)throw Error('Server stopped: '+output);
  try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw Error('Server unavailable: '+output);
 browser=await engine.launch(engine===chromium?{headless:true,args:['--no-sandbox']}:{headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow',
  ...(engine===webkit?{userAgent:devices['iPhone 13'].userAgent}:{})});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/marchands');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready});
 await page.reload();
 assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),true,'service worker controls /marchands');
 const manifest=await page.locator('link[rel="manifest"]').getAttribute('href');
 assert.equal(manifest,'/marchands.webmanifest');
 const meta=await (await context.request.get(base+manifest)).json();
 assert.equal(meta.start_url,'/marchands');assert.equal(meta.scope,'/marchands');
 assert.equal(await page.getByRole('button',{name:'Télécharger maintenant'}).count(),0,'install only for signed-in users');
 console.log('✓ Service worker active; merchant manifest; install button hidden before login');

 // An anonymous payment link, invitation, reset and API response must never enter the SW cache.
 const result=await page.evaluate(async()=>{
  const privatePaths=['/pay/not-a-real-token','/marchands/invite/no-token','/marchands/reset?token=no-token','/api/merchant/countries'];
  await Promise.all(privatePaths.map(url=>fetch(url).catch(()=>null)));
  const keys=await caches.keys(),urls=[];
  for(const key of keys){for(const entry of await (await caches.open(key)).keys()){urls.push(new URL(entry.url).pathname)}}
  return {keys,urls};
 });
 assert.ok(result.keys.some(k=>k.startsWith('kouturepro-shell-')),'shell cache created');
 for(const privatePath of ['/pay/','/marchands/invite/','/marchands/reset','/api/']){
  assert.equal(result.urls.some(url=>url.startsWith(privatePath)),false,`${privatePath} must not be cached`);
 }
 console.log('✓ Payment, invitation, password reset and API responses absent from offline cache');

 if(engine===chromium){
  await context.setOffline(true);
  const offlineResponse=await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(offlineResponse.status(),200);
  await page.getByText(/Reconnectez-vous pour ouvrir votre espace marchand/).waitFor({timeout:10000});
  assert.equal(await page.getByRole('button',{name:/Nouveau marchand/}).count(),0,'registration requires network');
  assert.equal(await page.evaluate(()=>navigator.onLine),false);
  assert.deepEqual(errors,[],'no browser JS exception while offline');
  console.log('✓ /marchands shell available offline from the service worker');
 }else{
  // Playwright's Linux WebKit crashes on any offline navigation; do not claim iOS validation.
  assert.deepEqual(errors,[],'no browser JS exception');
  console.log('⚠ WebKit Linux: offline navigation untestable (internal browser error); real Safari/iPhone test required');
 }
 await context.close();
}finally{await browser?.close();server.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true})}
