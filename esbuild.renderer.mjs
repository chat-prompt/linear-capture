import { build, context } from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { join } from 'path';

const outdir = 'dist/renderer';

// Ensure output dirs exist
mkdirSync(join(outdir, 'scripts/main'), { recursive: true });
mkdirSync(join(outdir, 'scripts/settings'), { recursive: true });
mkdirSync(join(outdir, 'styles'), { recursive: true });

// Bundle renderer JS
await build({
  entryPoints: [
    'src/renderer/scripts/main/app.ts',
    'src/renderer/scripts/settings/app.ts',
  ],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  outdir,
  outbase: 'src/renderer',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
});

// Copy static files (HTML, CSS, fonts)
cpSync('src/renderer/styles', join(outdir, 'styles'), { recursive: true });
cpSync('src/renderer/fonts', join(outdir, 'fonts'), { recursive: true });
cpSync('src/renderer/index.html', join(outdir, 'index.html'));
cpSync('src/renderer/settings.html', join(outdir, 'settings.html'));
cpSync('src/renderer/onboarding.html', join(outdir, 'onboarding.html'));

console.log('Renderer build complete.');
