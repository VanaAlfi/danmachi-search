import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseTextFile, searchLibrary } from '../lib/library.ts';
import { autocompleteAliases, autocompleteInputValue, autocompleteTerm, useAliasGroup } from '../lib/aliases.ts';
import { groupPassages, quoteWithCitation, passageContext, readSearchLink, searchLinkParams, validateLinkFilters } from '../lib/search-ui.ts';

const fixture = parseTextFile('fm01_fulltext.txt', '===== Text/chapter1.xhtml =====\n  Bell saw Bell. Bell’s knife.  \nBellona waited.\nBell replied.');
const hits = searchLibrary([fixture], ['Bell'], true, false);
const grouped = groupPassages(hits);
assert.equal(hits.length, 4);
assert.equal(grouped.length, 2);
assert.equal(grouped[0].mentions.length, 3);
assert.equal(grouped.reduce((sum, g) => sum + g.mentions.length, 0), hits.length);
assert.equal(quoteWithCitation(hits[0]), '  Bell saw Bell. Bell’s knife.  \n\n— DanMachi, Volume 1 · Story');
const other = { ...fixture, name: 'so01_fulltext.txt' };
assert.equal(groupPassages(searchLibrary([fixture, other], ['Bell'], true, false)).length, 4);

const contextFile = { ...fixture, paragraphs: Array.from({ length: 35 }, (_, index) => ({
  text: `Paragraph ${index}`, line: index + 1, section: index < 17 ? 'part-a.xhtml' : 'part-b.xhtml',
  frontMatter: index === 0, chapterLabel: index < 5 ? 'Chapter 1 — First' : index < 30 ? 'Chapter 2 — Second' : 'Chapter 3 — Third',
})) };
const center = { ...hits[0], file: contextFile, paragraph: contextFile.paragraphs[16], paragraphIndex: 16 };
assert.equal(passageContext(center, 1).before.length, 1);
assert.equal(passageContext(center, 1).after.length, 1);
assert.equal(passageContext(center, 1).canExpand, true);
assert.equal(passageContext(center, 100).before.length, 10);
assert.equal(passageContext(center, 100).after.length, 10);
assert.equal(passageContext(center, 100).canExpand, false);
const edge = { ...center, paragraph: contextFile.paragraphs[5], paragraphIndex: 5 };
assert.equal(passageContext(edge, 10).before.length, 0);
assert.equal(passageContext({ ...center, paragraph: contextFile.paragraphs[29], paragraphIndex: 29 }, 10).after.length, 0);
assert.equal(passageContext(hits[0], 10).before.length, 0);

const state = { query: 'Hörn & “Bell”', aliases: 'Helen, Will-o’-the-Wisp', wholeWords: false, includeFrontMatter: true,
  series: 'so', volume: 'so07_fulltext.txt', chapter: 'Chapter 3 — Feast of the Dead', page: 3 };
assert.deepEqual(readSearchLink(searchLinkParams(state)), state);
assert.equal(readSearchLink('?page=-4').page, 1);
assert.equal(readSearchLink('?page=Infinity').page, 1);
assert.equal(readSearchLink('?page=2.5').page, 1);
assert.equal(readSearchLink('?series=unknown&volume=../../secret').volume, '');
assert.equal(readSearchLink('?series=unknown').series, '');
assert.equal(readSearchLink('?q=Bell').wholeWords, true);
assert.equal(readSearchLink('?aliases=Aiz%2CAis').aliases, 'Aiz,Ais');
assert.equal(searchLinkParams({ ...state, query: '', aliases: '' }), '');
assert.equal(validateLinkFilters(state, [fixture]).volume, '');
assert.equal(validateLinkFilters(state, [fixture]).chapter, '');

assert.ok(autocompleteAliases('Rae').some(group => group.name === 'Rea Laevateinn'));
assert.ok(autocompleteAliases('Riv').some(group => group.name === 'Riveria Ljos Alf'));
assert.ok(autocompleteAliases('Laeva').some(group => group.name === 'Rea Laevateinn'));
assert.ok(autocompleteAliases('horn').some(group => group.name === 'Hörn'));
assert.equal(autocompleteAliases('R').length, 0);
assert.equal(autocompleteAliases('zzzzzz').length, 0);
assert.ok(autocompleteAliases('al').length <= 8);
assert.equal(autocompleteAliases('Leon').filter(group => ['Ryuu Lion', 'Leon Verdenberg'].includes(group.name)).length, 2);
// Popup cleanup emits input-clear/none, even after selection. Ignore those,
// while still accepting actual typing, deletion, paste, and composition input.
assert.equal(autocompleteInputValue('anya', '', 'input-clear'), 'anya');
assert.equal(autocompleteInputValue('anya', '', 'focus-out'), 'anya');
assert.equal(autocompleteInputValue('anya', '', 'escape-key'), 'anya');
assert.equal(autocompleteInputValue('anya', 'Anya Fromel', 'none'), 'anya');
assert.equal(autocompleteInputValue('anya', 'Anya', 'input-change'), 'Anya');
assert.equal(autocompleteInputValue('anya', '', 'input-change'), '');
const anyaGroup = autocompleteAliases('anya').find(group => group.name === 'Anya Fromel');
assert.equal(autocompleteTerm('anya', anyaGroup), 'anya');
assert.equal(autocompleteTerm('any', anyaGroup), 'Anya');
assert.equal(autocompleteTerm('Rae', autocompleteAliases('Rae')[0]), 'Rae Laevateinn');
assert.equal(autocompleteTerm('Bell', autocompleteAliases('Bell').find(group => group.name === 'Bell Cranell')), 'Bell');
const selectedAnya = useAliasGroup('anya', 'Custom alias', anyaGroup);
assert.equal(selectedAnya.query, 'Anya');
assert.ok(selectedAnya.aliases.includes('Vana Alfi'));
assert.ok(selectedAnya.aliases.includes('Custom alias'));
assert.equal(autocompleteInputValue(selectedAnya.query, '', 'input-clear'), selectedAnya.query);

const manifest = JSON.parse(await readFile('public/library/manifest.json', 'utf8'));
const files = await Promise.all(manifest.volumes.map(async v => JSON.parse(await readFile(`public${v.url}`, 'utf8'))));
const selectedHits = searchLibrary(files, [selectedAnya.query, ...selectedAnya.aliases.split(', ')], true, false);
assert.ok(selectedHits.length > 0);
assert.ok(selectedHits.some(hit => hit.term === 'Vana Alfi'));
const literalAnyaHits = searchLibrary(files, [autocompleteTerm('anya', anyaGroup)], true, false);
assert.ok(literalAnyaHits.length > 0);
assert.ok(literalAnyaHits.every(hit => hit.term.toLowerCase() === 'anya'));
assert.ok(literalAnyaHits.length < selectedHits.length);
const spellHits = searchLibrary(files, ['Rea Laevateinn', 'Rae Laevateinn'], true, false);
assert.equal(spellHits.length, 21);
const mainHits = spellHits.filter(hit => hit.file.seriesCode === 'fm');
assert.equal(mainHits.length, 0);
assert.equal(spellHits.length - mainHits.length, 21);
const valid = validateLinkFilters(state, files);
assert.equal(valid.volume, state.volume);
assert.equal(valid.chapter, state.chapter);
const bellHits = searchLibrary(files, ['Bell'], true, false);
assert.ok(groupPassages(bellHits).length < bellHits.length);
assert.equal(groupPassages(bellHits).reduce((total, group) => total + group.mentions.length, 0), bellHits.length);
console.log('Passed: passage grouping, exact citations, bounded chapter context, URL round-trips and validation, autocomplete, and filtered-match counts.');
