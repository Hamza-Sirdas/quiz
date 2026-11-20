import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(rootDir, 'server', 'vercelHandler.ts')],
  outfile: path.join(rootDir, 'api', 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  sourcemap: false,
  alias: {
    '@shared': path.join(rootDir, 'shared'),
  },
  logLevel: 'info',
});
