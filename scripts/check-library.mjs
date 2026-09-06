import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTextFile, searchLibrary } from '../lib/library.ts';

const fixture = parseTextFile('fm01_fulltext.txt', '===== Text/copyright.xhtml =====\r\nBell\r\n===== Text/chapter1.xhtml =====\r\nBell met Bellona. Bell’s knife.\r\n  Ais Wallenstein saw Ais.  ');
assert.equal(searchLibrary([fixture], ['Bell'], true, false).length, 2);
assert.equal(searchLibrary([fixture], ['Bell'], false, false).length, 3);
assert.equal(searchLibrary([fixture], ['Bell'], true, true).length, 3);
assert.equal(searchLibrary([fixture], ['Ais', 'Ais Wallenstein'], true, false).length, 2);
assert.equal(fixture.paragraphs[2].text, '  Ais Wallenstein saw Ais.  ');
assert.equal(fixture.paragraphs[2].line, 5);
assert.equal(searchLibrary([fixture], ['.*'], false, true).length, 0);

const manifest = JSON.parse(await readFile('public/library/manifest.json', 'utf8'));
assert.equal(manifest.volumes.length, 42);
const files = [];
for (const volume of manifest.volumes) {
  const indexed = JSON.parse(await readFile(join('public', volume.url), 'utf8'));
  const raw = await readFile(join(process.argv[2], volume.name), 'utf8');
  const lines = raw.split(/\r\n|\n|\r/);
  for (const passage of indexed.paragraphs) assert.equal(passage.text, lines[passage.line - 1]);
  // Independent literal counter against original files, including front matter.
  const baseline = raw.split(/\bBell\b/iu).length - 1;
  const actual = searchLibrary([indexed], ['Bell'], true, true).length;
  assert.equal(actual, baseline, `Bell count mismatch in ${volume.name}`);
  files.push(indexed);
}
const astrea2 = files.find(file => file.name === 'ar02_fulltext.txt');
assert.equal(astrea2.paragraphs.find(p => p.line === 1034).chapterLabel, 'Chapter 3 — A Gray Wildflower');
assert.equal(astrea2.paragraphs.find(p => p.section.endsWith('/chapter10-01.xhtml')).chapterLabel,
  'Chapter 9 — The Story of a Perfectly Normal Girl: Alize Lovell');
assert.equal(files.find(file => file.name === 'fm01_fulltext.txt').paragraphs.find(p => p.section.endsWith('/chapter003a.xhtml')).chapterLabel,
  'Chapter 3 — Night Before Awakening');
assert.equal(files.find(file => file.name === 'fm16_fulltext.txt').paragraphs.find(p => p.line === 1925).chapterLabel,
  'Chapter 3 — Harvest Festival');
for (const file of files) {
  const unresolved = file.paragraphs.filter(p => !p.frontMatter && p.chapterLabel === 'Story');
  console.log(`${file.name}: ${new Set(file.paragraphs.filter(p => !p.frontMatter).map(p => p.chapterLabel)).size} titles; ${unresolved.length} unlabeled passages${unresolved.length ? '; first: ' + unresolved[0].section : ''}`);
}
const start = performance.now();
const hits = searchLibrary(files, ['Ais', 'Aiz', 'Sword Princess'], true, false);
assert.ok(hits.length > 100);
console.log(`Verified ${files.length} volumes: exact source lines, occurrence counts, aliases, boundaries, and front matter. ${hits.length} Ais/Aiz/Sword Princess matches in ${Math.round(performance.now() - start)} ms.`);
