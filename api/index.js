// Function Vercel unique : API, reçus PDF et pages publiques avec HTML SEO.
// Le marqueur __kp_path conserve le chemin original à travers les rewrites
// (la Function peut sinon recevoir /api/index au lieu de /api/clients).
import app from '../server/index.js';

export default function handler(req, res) {
  const url = new URL(req.url, 'http://vercel.local');
  const originalPath = url.searchParams.get('__kp_path');
  if (originalPath !== null) {
    if (!originalPath.startsWith('/') || originalPath.startsWith('//') || /[?#\x00-\x1f]/.test(originalPath)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Adresse non valide.' }));
    }
    url.searchParams.delete('__kp_path');
    req.url = originalPath + url.search;
  }
  return app(req, res);
}
