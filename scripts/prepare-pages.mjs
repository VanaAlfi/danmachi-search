import { access, mkdir, writeFile } from 'node:fs/promises';

// Stop rather than accidentally publishing the local corpus with the site.
let corpusPresent = true;
try { await access('public/library'); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  corpusPresent = false;
}
if (corpusPresent) throw new Error('Refusing Pages build: public/library must not be in the publishing checkout.');
let base;
try { base = new URL(process.env.LIBRARY_BASE_URL || ''); } catch {
  throw new Error('Set LIBRARY_BASE_URL to the HTTPS folder containing the public text files.');
}
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('LIBRARY_BASE_URL must be a plain HTTPS folder URL.');
const files = Object.entries({ fm: 20, so: 14, ar: 3, fc: 3, ss: 2 }).flatMap(([series, count]) =>
  Array.from({ length: count }, (_, index) => `${series}${String(index + 1).padStart(2, '0')}_fulltext.txt`));
await mkdir('public', { recursive: true });
await writeFile('public/search-config.json', JSON.stringify({ source: 'static', baseUrl: base.href.replace(/\/?$/, '/'), files, expectedVolumes: files.length }));
console.log('Prepared public static-file connection. No Google credentials or novel texts are included.');
