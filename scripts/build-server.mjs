import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(rootDir, 'server', 'index.ts')],
  outfile: path.join(rootDir, 'dist-server', 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  alias: {
    '@shared': path.join(rootDir, 'shared'),
  },
  logLevel: 'info',
});
