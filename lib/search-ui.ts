import { SERIES, type LoadedFile, type SearchHit } from './library.ts';

export type PassageResult = { hit: SearchHit; mentions: SearchHit[] };
export function groupPassages(hits: SearchHit[]): PassageResult[] {
  const groups = new Map<string, PassageResult>();
  for (const hit of hits) {
    const key = `${hit.file.name}:${hit.paragraphIndex}`;
    const group = groups.get(key);
    if (group) group.mentions.push(hit);
    else groups.set(key, { hit, mentions: [hit] });
  }
  return [...groups.values()];
}

export function quoteWithCitation(hit: SearchHit) {
  return `${hit.paragraph.text}\n\n— ${hit.file.series}, Volume ${hit.file.volume} · ${hit.paragraph.chapterLabel || 'Story'}`;
}

export const MAX_CONTEXT = 10;
export function passageContext(hit: SearchHit, radius: number) {
  const { file, paragraphIndex, paragraph } = hit;
  const limit = Math.max(1, Math.min(MAX_CONTEXT, Math.floor(radius)));
  const sameChapter = (index: number) => {
    const candidate = file.paragraphs[index];
    if (!candidate || candidate.frontMatter !== paragraph.frontMatter) return false;
    if (paragraph.chapterLabel && paragraph.chapterLabel !== 'Story') {
      return candidate.chapterLabel === paragraph.chapterLabel;
    }
    return candidate.section === paragraph.section;
  };
  let start = paragraphIndex;
  let end = paragraphIndex;
  while (paragraphIndex - start < limit && sameChapter(start - 1)) start--;
  while (end - paragraphIndex < limit && sameChapter(end + 1)) end++;
  return { before: file.paragraphs.slice(start, paragraphIndex), after: file.paragraphs.slice(paragraphIndex + 1, end + 1),
    canExpand: limit < MAX_CONTEXT && (sameChapter(start - 1) || sameChapter(end + 1)) };
}

export type SearchLinkState = {
  query: string; aliases: string; wholeWords: boolean; includeFrontMatter: boolean;
  series: string; volume: string; chapter: string; page: number;
};
export function readSearchLink(search: string): SearchLinkState {
  const params = new URLSearchParams(search);
  const series = params.get('series') || '';
  const volume = params.get('volume') || '';
  const page = Number(params.get('page') || 1);
  return { query: params.get('q') || '', aliases: params.get('aliases') || '',
    wholeWords: params.get('whole') !== '0', includeFrontMatter: params.get('front') === '1',
    series: Object.hasOwn(SERIES, series) ? series : '',
    volume: /^(fm|so|ar|fc|ss)\d{2}$/.test(volume) ? `${volume}_fulltext.txt` : '',
    chapter: params.get('chapter') || '', page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}
export function searchLinkParams(state: SearchLinkState) {
  const params = new URLSearchParams();
  if (!state.query.trim() && !state.aliases.trim()) return '';
  if (state.query) params.set('q', state.query);
  if (state.aliases) params.set('aliases', state.aliases);
  if (!state.wholeWords) params.set('whole', '0');
  if (state.includeFrontMatter) params.set('front', '1');
  if (state.series) params.set('series', state.series);
  if (state.volume) params.set('volume', state.volume.replace('_fulltext.txt', ''));
  if (state.chapter) params.set('chapter', state.chapter);
  if (state.page > 1) params.set('page', String(state.page));
  return params.toString();
}

export function validateLinkFilters(state: SearchLinkState, files: LoadedFile[]): SearchLinkState {
  const file = files.find(item => item.name === state.volume && (!state.series || item.seriesCode === state.series));
  const chapterValid = file?.paragraphs.some(p => (state.includeFrontMatter || !p.frontMatter) && (p.chapterLabel || 'Story') === state.chapter);
  return { ...state, volume: file ? state.volume : '', chapter: chapterValid ? state.chapter : '' };
}
