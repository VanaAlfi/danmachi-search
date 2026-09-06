import { access, mkdir, writeFile } from 'node:fs/promises';

// Stop rather than accidentally publishing the local corpus with the site.
let corpusPresent = true;
try { await access('public/library'); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  corpusPresent = false;
}
if (corpusPresent) throw new Error('Refusing Pages build: public/library must not be in the publishing checkout.');
const folderId = process.env.DRIVE_FOLDER_ID || '';
const apiKey = process.env.DRIVE_BROWSER_API_KEY || '';
if (!/^[\w-]+$/.test(folderId) || !apiKey.trim()) {
  throw new Error('Set DRIVE_FOLDER_ID and DRIVE_BROWSER_API_KEY before publishing. The browser key must be restricted to the site and Drive API.');
}
await mkdir('public', { recursive: true });
await writeFile('public/search-config.json', JSON.stringify({ source: 'drive', folderId, apiKey, expectedVolumes: 42 }));
console.log('Prepared browser-only connection. Configuration will be visible in the published site, not committed to source.');
