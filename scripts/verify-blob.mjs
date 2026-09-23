// Smoke test against a real, public Vercel Blob store. Only run with your own
// connected store credentials; the uploaded temporary object is deleted.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { put, get, del } from '@vercel/blob';

dotenv.config({ path: '.env.local', quiet: true }); // Fichier créé par « vercel env pull ».
dotenv.config({ path: '.env', quiet: true });
if (!(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN))) {
  throw new Error('Connectez votre store Blob public ou chargez ses variables via « vercel env pull ».');
}
const bytes = crypto.randomBytes(256);
const pathname = `kouturepro-smoke/${crypto.randomUUID()}.bin`;
let blob;
try {
  blob = await put(pathname, bytes, { access: 'public', contentType: 'application/octet-stream' });
  assert.match(blob.url, /^https:\/\//);
  const saved = await get(blob.url, { access: 'public', useCache: false });
  assert.equal(saved?.statusCode, 200);
  assert.deepEqual(Buffer.from(await new Response(saved.stream).arrayBuffer()), bytes);
  console.log('Vercel Blob : put() et get() réels réussis ; suppression de l’objet temporaire en cours.');
} finally {
  if (blob) await del(blob.url);
}
