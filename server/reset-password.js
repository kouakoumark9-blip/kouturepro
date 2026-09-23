// One-time operator command to migrate an existing OTP-era account to a password.
// Run locally on the server, never expose this action through HTTP.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';

const identifier=String(process.argv[2]||'').trim();
if(!identifier){console.error('Usage : node server/reset-password.js <e-mail-ou-numéro>');process.exitCode=2;}
else{
 const email=identifier.includes('@')?identifier.toLowerCase():null;
 const phone=email?null:identifier.replace(/[\s.()\-]/g,'');
 const user=db.prepare(`SELECT id,name,phone,email FROM users WHERE ${email?'email':'phone'}=?`).get(email||phone);
 if(!user){console.error('Compte introuvable.');process.exitCode=1;}
 else{
  const generated=!process.env.RESET_PASSWORD;
  const password=process.env.RESET_PASSWORD||crypto.randomBytes(18).toString('base64url')+'!A7';
  if(password.length<10||Buffer.byteLength(password,'utf8')>72){console.error('Mot de passe invalide : 10 à 72 octets requis.');process.exitCode=2;}
  else{
   db.prepare('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?').run(bcrypt.hashSync(password,12),user.id);
   console.log(`Mot de passe réinitialisé pour ${user.name} (${user.email||user.phone}).`);
   if(generated)console.log('Mot de passe temporaire (à transmettre en privé) : '+password);
  }
 }
}
