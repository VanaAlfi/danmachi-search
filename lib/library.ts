import { labelChapters } from './chapters.ts';
export type Paragraph = { text: string; section: string; line: number; frontMatter: boolean; chapterLabel?: string };
export type LoadedFile = { name: string; series: string; seriesCode: string; volume: number; paragraphs: Paragraph[] };
export type SearchHit = { file: LoadedFile; paragraph: Paragraph; paragraphIndex: number; term: string; occurrence: number; offset: number };
export const SERIES: Record<string, string> = { fm: 'DanMachi', so: 'Sword Oratoria', ar: 'Astrea Record', fc: 'Familia Chronicle', ss: 'Side Stories' };

export function parseTextFile(name: string, text: string): LoadedFile {
  const identity = name.toLowerCase().match(/^([a-z]+)(\d+)_fulltext\.txt$/);
  const seriesCode = identity?.[1] ?? 'other';
  let section = '';
  const paragraphs: Paragraph[] = [];
  // These EPUB extracts use one physical line per prose paragraph. Preserve its
  // exact characters and physical line number for verifiable quotations.
  text.split(/\r\n|\n|\r/).forEach((line, index) => {
    const marker = line.trim().match(/^=====\s+(.+?)\s+=====$/);
    if (marker) { section = marker[1]; return; }
    if (!line.trim()) return;
    paragraphs.push({ text: line, section, line: index + 1,
      frontMatter: /(?:^|\/)(?:cover|insert|title|copyright|contents|toc|navigation|newsletter|about|advertisement)[^/]*$/i.test(section) });
  });
  labelChapters(paragraphs);
  return { name, seriesCode, series: SERIES[seriesCode] ?? name, volume: Number(identity?.[2] ?? 0), paragraphs };
}

export function makePattern(terms: string[], wholeWords: boolean) {
  const alternatives = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length)
    .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!alternatives) return null;
  return new RegExp(wholeWords ? `(?<![\\p{L}\\p{N}])(${alternatives})(?![\\p{L}\\p{N}])` : `(${alternatives})`, 'giu');
}

export function searchLibrary(files: LoadedFile[], terms: string[], wholeWords: boolean, includeFrontMatter: boolean): SearchHit[] {
  const pattern = makePattern(terms, wholeWords);
  if (!pattern) return [];
  const found: SearchHit[] = [];
  for (const file of files) file.paragraphs.forEach((paragraph, paragraphIndex) => {
    if (!includeFrontMatter && paragraph.frontMatter) return;
    let occurrence = 0;
    for (const match of paragraph.text.matchAll(pattern)) found.push({ file, paragraph, paragraphIndex,
      term: match[0], occurrence: ++occurrence, offset: match.index! });
  });
  return found;
}
