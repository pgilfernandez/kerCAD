import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const require = createRequire(path.join(root, 'package.json'));
const next = require.resolve('next/dist/bin/next');
const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: {
    ...process.env, NODE_ENV: 'production', KERCAD_DOCKER_BUILD: 'true',
    STATIC_EXPORT: 'false', KERCAD_CANONICAL_HOST: 'off', NEXT_TELEMETRY_DISABLED: '1', KERCAD_DESKTOP_BUILD: 'true',
  } });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Build exited with ${code}`)));
});

// Staging has no user data. Replace only this explicit generated directory.
const { rm } = await import('node:fs/promises');
await rm(path.join(directory, 'staging'), { recursive: true, force: true });
await run([path.join(root, 'scripts/i18n.mjs')]);
await run([path.join(root, 'scripts/copy-occt-wasm.mjs')]);
const nextEnvironment = path.join(root, 'apps/web/next-env.d.ts');
const previousEnvironment = await readFile(nextEnvironment);
try { await run([next, 'build', 'apps/web']); }
finally { await writeFile(nextEnvironment, previousEnvironment); }
const staging = path.join(directory, 'staging');
const app = path.join(staging, 'app');
const server = path.join(staging, 'server');
await mkdir(app, { recursive: true });
await cp(path.join(root, 'apps/web/.next/standalone'), server, { recursive: true, dereference: true });
await cp(path.join(root, 'apps/web/.next/static'), path.join(server, 'apps/web/.next/static'), { recursive: true });
await cp(path.join(root, 'apps/web/public'), path.join(server, 'apps/web/public'), { recursive: true });
try {
  await access(path.join(root, 'apps/web/challenges'));
  await cp(path.join(root, 'apps/web/challenges'), path.join(server, 'bundled-challenges'), { recursive: true });
} catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const file of ['main.cjs', 'preload.cjs', 'server.cjs']) await cp(path.join(directory, file), path.join(app, file));
await cp(path.join(root, 'apps/web/src/locales'), path.join(app, 'locales'), { recursive: true, filter: (source) => !path.extname(source) || source.endsWith('.json') });
await cp(path.join(root, 'LICENSE'), path.join(app, 'LICENSE'));
const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
delete metadata.devDependencies;
delete metadata.scripts;
await writeFile(path.join(app, 'package.json'), JSON.stringify(metadata, null, 2));
await writeFile(path.join(app, 'desktop-variant.json'), JSON.stringify({ variant: process.env.KERCAD_DESKTOP_VARIANT === 'legacy' ? 'legacy' : 'current' }));
await mkdir(path.join(staging, 'icons'), { recursive: true });
// Packaging runs on the target OS. Preserve each platform's artwork and
// transparent margins; electron-builder derives the native icon sizes.
const iconPlatform = { darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform];
await sharp(path.join(root, `apps/web/public/assets/kercad/kercad_app_${iconPlatform}.svg`))
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png().toFile(path.join(staging, 'icons/icon.png'));
console.log('Desktop staging prepared. Packaging must run on its target OS/architecture.');
