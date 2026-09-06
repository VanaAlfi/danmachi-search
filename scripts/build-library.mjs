import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseTextFile } from '../lib/library.ts';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/build-library.mjs <text-folder>');
const destination = resolve('public/library');
await mkdir(destination, { recursive: true });
const filenames = (await readdir(source)).filter(name => /_fulltext\.txt$/i.test(name)).sort();
if (!filenames.length) throw new Error('No novel text files found.');
const volumes = [];
for (const name of filenames) {
  const raw = await readFile(join(source, name), 'utf8');
  const parsed = parseTextFile(name, raw);
  if (!parsed.paragraphs.length) throw new Error(`Empty volume: ${name}`);
  const content = JSON.stringify(parsed);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
  const asset = `${name.replace(/\.txt$/i, '')}.${hash}.json`;
  await writeFile(join(destination, asset), content);
  volumes.push({ name, series: parsed.series, volume: parsed.volume, url: `/library/${asset}`, passages: parsed.paragraphs.length });
}
await writeFile(join(destination, 'manifest.json'), JSON.stringify({ volumes }));
console.log(`Published library assets: ${volumes.length} volumes, ${volumes.reduce((sum, v) => sum + v.passages, 0)} passages.`);
