import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
if (base && !/^\/[\w-]+$/.test(base)) throw new Error('Invalid Pages path');
const root = 'dist/client';
await access(join(root, 'index.html'));
// The current exporter prefixes chunks through Vite, but emits font URLs at
// the domain root. Normalize those generated asset references for project Pages.
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'library') await visit(path); continue; }
    if (!/\.(html|css|js|rsc|json)$/.test(entry.name)) continue;
    const text = await readFile(path, 'utf8');
    const fixed = text.replace(/(["'(])\/_next\//g, `$1${base}/_next/`);
    if (text !== fixed) await writeFile(path, fixed);
  }
}
await visit(root);
const html = await readFile(join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)) {
  if (base && !match[1].startsWith(`${base}/`)) throw new Error(`Asset outside Pages path: ${match[1]}`);
  await access(join(root, match[1].slice(base.length).replace(/^\//, '')));
}
console.log('Verified Pages HTML and referenced local assets.');
