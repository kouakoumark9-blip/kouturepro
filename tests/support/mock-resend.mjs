// Preloaded only by isolated tests. No email or external network request occurs.
import fs from 'node:fs';
const nativeFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=async(input,options={})=>{
 const url=typeof input==='string'?input:input.url;
 if(url==='https://api.resend.com/emails'){
  if(!process.env.KP_TEST_MAIL_FILE)throw new Error('Mock mail file absent.');
  const body=JSON.parse(String(options.body));
  fs.appendFileSync(process.env.KP_TEST_MAIL_FILE,JSON.stringify({to:body.to,from:body.from,text:body.text})+'\n',{mode:0o600});
  return new Response(JSON.stringify({id:'local-mock-email'}),{status:200,headers:{'content-type':'application/json'}});
 }
 return nativeFetch(input,options);
};
