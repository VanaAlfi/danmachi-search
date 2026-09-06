import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aliasData } from '../lib/alias-data.ts';
import { suggestAliases, useAliasGroup, addOptionalAlias, hasAliasTerm } from '../lib/aliases.ts';
import { searchLibrary } from '../lib/library.ts';

assert.equal(aliasData.length, 303);
assert.equal(aliasData.filter(g => g.category === 'character').length, 209);
const groupFor = query => {
  const groups = suggestAliases(query);
  assert.equal(groups.length, 1, query);
  return groups[0];
};
const spell = groupFor('Rae Laevateinn');
assert.deepEqual(spell.printed, ['Rea Laevateinn', 'Rae Laevateinn']);
const selection = useAliasGroup('Rae Laevateinn', '', spell);
assert.deepEqual(selection, { query: 'Rae Laevateinn', aliases: 'Rea Laevateinn' });
assert.deepEqual(useAliasGroup(selection.query, selection.aliases, spell), selection);
assert.ok(useAliasGroup('Ais', 'Sword Princess', groupFor('Ais')).aliases.includes('Sword Princess'));
assert.ok(groupFor('Ryuu').printed.includes('Lyu'));
assert.ok(!groupFor('Ryuu').printed.includes('Leon'));
const leonCandidates = suggestAliases('Leon');
assert.equal(leonCandidates.length, 2);
for (const group of leonCandidates) {
  assert.ok(!group.printed.includes('Leon'));
  assert.ok(group.caution);
  assert.ok(group.optional.some(item => item.form === 'Leon'));
  assert.ok(!useAliasGroup('Ryuu', '', group).aliases.split(', ').includes('Leon'));
}
assert.equal(useAliasGroup('Horn', '', groupFor('Horn')).query, 'Hörn');
assert.ok(!groupFor('Line').printed.includes('Line'));
assert.ok(!groupFor('Ray').printed.includes('Ray'));
assert.ok(!groupFor('Astrea').printed.includes('Astrea Record'));
assert.equal(groupFor('Astrea Record').category, 'magic');
assert.equal(useAliasGroup('Ariel', '', groupFor('Ariel')).query, 'Airiel');
const dainsleifCandidates = suggestAliases('Dainsleif');
assert.equal(dainsleifCandidates.length, 2);
assert.ok(dainsleifCandidates.some(group => group.name === 'Hegni Ragnar' && group.optional.some(item => item.form === 'Dáinsleif')));
assert.equal(useAliasGroup('Dainsleif', '', dainsleifCandidates.find(group => group.category === 'magic')).query, 'Dáinsleif');
assert.ok(groupFor('Mage').caution);
assert.equal(suggestAliases('Cannon').length, 0);
assert.equal(groupFor('Riviera').name, 'Riveria Ljos Alf');
assert.equal(suggestAliases(' ').length, 0);
assert.notEqual(groupFor('Tiona').id, groupFor('Tione').id);
assert.notEqual(groupFor('Alize').id, groupFor('Alisa').id);
assert.ok(!spell.printed.includes('Wynn Fimbulvetr'));
assert.equal(groupFor('Vana Alfi').name, 'Anya Fromel');
assert.ok(useAliasGroup('Anya', '', groupFor('Anya')).aliases.includes('Vana Alfi'));
assert.equal(groupFor('Aki').name, 'Anakity Autumn');
assert.equal(groupFor('Helen').name, 'Hörn');
assert.equal(groupFor('Ruona').name, 'Runoa Faust');
assert.equal(groupFor('Aisha').name, 'Aisha Belka');
assert.equal(groupFor('Black Cat').name, 'Chloe Lolo');
assert.equal(groupFor('Black Fist').name, 'Runoa Faust');
assert.ok(!useAliasGroup('Chloe', '', groupFor('Chloe')).aliases.includes('Black Cat'));
assert.equal(addOptionalAlias('Chloe', 'Chloe Lolo', 'Black Cat'), 'Chloe Lolo, Black Cat');
assert.equal(addOptionalAlias('Chloe', 'Chloe Lolo, Black Cat', 'Black Cat'), 'Chloe Lolo, Black Cat');
assert.ok(hasAliasTerm('Black Cat', '', 'black cat'));
const syrCandidates = suggestAliases('Syr');
assert.equal(syrCandidates.length, 3);
const syr = syrCandidates.find(group => group.name === 'Syr Flover');
assert.ok(syr);
assert.ok(!syr.printed.includes('Freya'));
for (const candidate of syrCandidates.filter(group => group !== syr)) {
  assert.ok(candidate.optional.some(item => item.form === 'Syr'));
  assert.ok(!candidate.printed.includes('Syr'));
}

const bell = groupFor('Bell');
for (const title of ['Little Rookie', 'Rabbit Foot', 'Regulus Arne', 'Rapi Flemish', 'Rapi']) {
  assert.ok(bell.printed.includes(title), title);
  assert.ok(useAliasGroup('Bell', '', bell).aliases.split(', ').includes(title), title);
}
for (const title of ['Argonaut', 'Little Argonaut', 'Cranell', 'record holder']) {
  assert.ok(bell.optional.some(item => item.form === title), title);
  assert.ok(!useAliasGroup('Bell', '', bell).aliases.toLowerCase().split(', ').includes(title.toLowerCase()), title);
}
assert.ok(groupFor('Ais').printed.includes('War Princess'));
assert.ok(groupFor('Ryuu').printed.includes('Gale Wind'));
assert.ok(groupFor('Ryuu').printed.includes('Lyu Astrea'));
for (const group of aliasData) {
  assert.ok(group.printed.length > 0, group.id);
  for (const optional of group.optional) {
    assert.ok(!group.printed.some(form => form.toLowerCase() === optional.form.toLowerCase()), `${group.id}: ${optional.form}`);
  }
}

const manifest = JSON.parse(await readFile('public/library/manifest.json', 'utf8'));
const files = await Promise.all(manifest.volumes.map(async v => JSON.parse(await readFile(`public${v.url}`, 'utf8'))));
const terms = [selection.query, ...selection.aliases.split(',').map(s => s.trim())];
const hits = searchLibrary(files, terms, true, false);
assert.equal(hits.length, 21);
assert.equal(searchLibrary(files, [...terms, ...terms], true, false).length, 21);
assert.equal(new Set(hits.map(h => `${h.file.name}:${h.paragraph.line}:${h.offset}`)).size, 21);
assert.equal(hits.filter(h => h.file.seriesCode === 'fm').length, 0);
for (const hit of hits) assert.equal(hit.paragraph.text.slice(hit.offset, hit.offset + hit.term.length), hit.term);
const anyaSelection = useAliasGroup('Anya', '', groupFor('Anya'));
const anyaHits = searchLibrary(files, [anyaSelection.query, ...anyaSelection.aliases.split(', ')], true, false);
assert.ok(anyaHits.some(hit => hit.term === 'Vana Alfi'));
console.log('Passed: 303 groups, expanded names and titles, separate optional aliases, shared-name candidates, exact quotes, filters, and all 21 Laevateinn mentions.');
