// Bundle the PostgreSQL worker as a self-contained ESM file for Vercel Functions.
// Node File Trace can otherwise include the worker without its pg dependencies.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/pg-worker.js'],
  outfile: 'dist/pg-worker.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['pg-native'], // optional native extension; pg's JS driver is used.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
