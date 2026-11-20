import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('apps/web', 'dist', { recursive: true });
await cp('public/branding', 'dist/branding', { recursive: true });
console.log('Static Mini App copied to dist/');
