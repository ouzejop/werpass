import { mkdir, rm } from 'node:fs/promises';
const path = new URL('./.demo-state', import.meta.url);
await rm(path, { recursive: true, force: true });
await mkdir(path, { recursive: true });
console.log('Demo state reset.');
