'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, useComboboxAnchor } from '@/components/ui/combobox';
import { CopyControl, SearchResult } from '@/components/search-result';

import { searchLibrary, type LoadedFile } from '@/lib/library';
import { suggestAliases, useAliasGroup, hasAliasTerm, addOptionalAlias, autocompleteAliases, autocompleteInputValue, autocompleteTerm, type AliasGroup } from '@/lib/aliases';
import { groupPassages, readSearchLink, searchLinkParams, validateLinkFilters } from '@/lib/search-ui';

type ModelContextDocument = Document & {
  modelContext?: {
    registerTool: (
      tool: {
        name: string;
        title: string;
        description: string;
        inputSchema: object;
        annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
        execute: (input: unknown) => unknown;
      },
      options?: { signal?: AbortSignal },
    ) => void | Promise<void>;
  };
};

const PAGE_SIZE = 40;

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function Home() {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [query, setQuery] = useState('');
  const [aliases, setAliases] = useState('');
  const [wholeWords, setWholeWords] = useState(true);
  const [includeFrontMatter, setIncludeFrontMatter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [volumeCount, setVolumeCount] = useState(0);
  const [submitted, setSubmitted] = useState<{ query: string; aliases: string } | null>(null);
  const [seriesFilter, setSeriesFilter] = useState('');
  const [volumeFilter, setVolumeFilter] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [urlReady, setUrlReady] = useState(false);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompletePanel, setAutocompletePanel] = useState<HTMLDivElement | null>(null);
  const [autocompleteHeight, setAutocompleteHeight] = useState(0);
  const searchAnchor = useComboboxAnchor();
  const autocomplete = useMemo(() => autocompleteAliases(query), [query]);
  const aliasSuggestions = useMemo(() => suggestAliases(query), [query]);

  useEffect(() => {
    if (!autocompletePanel) return;
    const measure = () => setAutocompleteHeight(autocompletePanel.offsetHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(autocompletePanel);
    return () => observer.disconnect();
  }, [autocompletePanel]);

  const terms = useMemo(
    () => submitted ? [submitted.query.trim(), ...submitted.aliases.split(',').map((item) => item.trim())].filter(Boolean) : [],
    [submitted],
  );

  const allHits = useMemo(() => searchLibrary(files, terms, wholeWords, includeFrontMatter),
    [files, terms, wholeWords, includeFrontMatter]);
  const hits = useMemo(() => allHits.filter(hit =>
    (!seriesFilter || hit.file.seriesCode === seriesFilter) &&
    (!volumeFilter || hit.file.name === volumeFilter) &&
    (!chapterFilter || hit.paragraph.chapterLabel === chapterFilter)),
    [allHits, seriesFilter, volumeFilter, chapterFilter]);
  const seriesOptions = [...new Map(files.map(file => [file.seriesCode, file.series])).entries()];
  const volumeOptions = files.filter(file => !seriesFilter || file.seriesCode === seriesFilter);
  const chapterOptions = [...new Set(files.find(file => file.name === volumeFilter)?.paragraphs
    .filter(paragraph => includeFrontMatter || !paragraph.frontMatter)
    .map(paragraph => paragraph.chapterLabel || 'Story') ?? [])];
  const filtersActive = Boolean(seriesFilter || volumeFilter || chapterFilter);
  function resetFilters() { setSeriesFilter(''); setVolumeFilter(''); setChapterFilter(''); setPage(1); }

  useEffect(() => {
    function restoreSearch() {
      const state = readSearchLink(window.location.search);
      setQuery(state.query); setAliases(state.aliases);
      setSubmitted(state.query || state.aliases ? { query: state.query, aliases: state.aliases } : null);
      setWholeWords(state.wholeWords); setIncludeFrontMatter(state.includeFrontMatter);
      setSeriesFilter(state.series); setVolumeFilter(state.volume); setChapterFilter(state.chapter);
      setPage(state.page); setUrlReady(true);
    }
    restoreSearch();
    window.addEventListener('popstate', restoreSearch);
    return () => window.removeEventListener('popstate', restoreSearch);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadLibrary() {
      setLoading(true);
      setError('');
      setLoadedCount(0);
      try {
        const response = await fetch('/library/manifest.json', { signal: controller.signal, cache: 'no-cache' });
        if (!response.ok) throw new Error('Library unavailable');
        const manifest = await response.json() as { volumes: { url: string }[] };
        if (!Array.isArray(manifest.volumes) || !manifest.volumes.length) throw new Error('Empty library');
        setVolumeCount(manifest.volumes.length);
        const loaded: LoadedFile[] = [];
        // Bound concurrent requests and publish only a complete library: failed
        // downloads must never silently produce incomplete mention counts.
        for (let start = 0; start < manifest.volumes.length; start += 6) {
          const batch = await Promise.all(manifest.volumes.slice(start, start + 6).map(async volume => {
            const result = await fetch(volume.url, { signal: controller.signal });
            if (!result.ok) throw new Error('Volume unavailable');
            const file = await result.json() as LoadedFile;
            if (!Array.isArray(file.paragraphs)) throw new Error('Invalid volume');
            return file;
          }));
          loaded.push(...batch);
          setLoadedCount(loaded.length);
        }
        if (controller.signal.aborted) return;
        setFiles(loaded);
      } catch {
        if (!controller.signal.aborted) setError('The library could not be loaded. Check your connection and try again.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadLibrary();
    return () => controller.abort();
  }, [retry]);

  const passages = useMemo(() => groupPassages(hits), [hits]);
  const hiddenMentions = allHits.length - hits.length;
  const pageCount = Math.max(1, Math.ceil(passages.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visiblePassages = passages.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const matchedVolumes = new Set(hits.map(hit => hit.file.name)).size;
  const hasSearch = terms.length > 0;

  const linkState = { query: submitted?.query || '', aliases: submitted?.aliases || '', wholeWords, includeFrontMatter,
    series: seriesFilter, volume: volumeFilter, chapter: chapterFilter, page: currentPage };
  const linkParams = searchLinkParams(linkState);
  useEffect(() => {
    if (!urlReady || loading || error) return;
    const url = new URL(window.location.href);
    url.search = linkParams;
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }, [linkParams, urlReady, loading, error]);

  useEffect(() => {
    if (!urlReady || loading || error) return;
    const valid = validateLinkFilters({ query: '', aliases: '', wholeWords, includeFrontMatter,
      series: seriesFilter, volume: volumeFilter, chapter: chapterFilter, page }, files);
    if (valid.volume !== volumeFilter || valid.chapter !== chapterFilter) {
      setVolumeFilter(valid.volume); setChapterFilter(valid.chapter); setPage(1);
    } else if (page > pageCount) setPage(pageCount);
  }, [urlReady, loading, error, files, seriesFilter, volumeFilter, chapterFilter, includeFrontMatter, wholeWords, page, pageCount]);

  useEffect(() => {
    const context = (document as ModelContextDocument).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const registration = context.registerTool(
      {
        name: 'configure_mention_search',
        title: 'Configure mention search',
        description: 'Set the visible primary search term and optional comma-separated aliases.',
        inputSchema: {
          type: 'object',
          properties: {
            term: { type: 'string', minLength: 1 },
            aliases: { type: 'array', items: { type: 'string' } },
            wholeWords: { type: 'boolean' },
          },
          required: ['term'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== 'object') throw new Error('Search configuration must be an object.');
          const value = input as { term?: unknown; aliases?: unknown; wholeWords?: unknown };
          if (typeof value.term !== 'string' || !value.term.trim()) throw new Error('term must be a non-empty string.');
          if (value.aliases !== undefined && (!Array.isArray(value.aliases) || value.aliases.some((item) => typeof item !== 'string'))) {
            throw new Error('aliases must be an array of strings.');
          }
          if (value.wholeWords !== undefined && typeof value.wholeWords !== 'boolean') throw new Error('wholeWords must be a boolean.');
          const cleanAliases = (value.aliases as string[] | undefined)?.map((item) => item.trim()).filter(Boolean) ?? [];
          setQuery(value.term.trim());
          setAliases(cleanAliases.join(', '));
          setSubmitted({ query: value.term.trim(), aliases: cleanAliases.join(', ') });
          if (value.wholeWords !== undefined) setWholeWords(value.wholeWords);
          setPage(1);
          return { term: value.term.trim(), aliases: cleanAliases, wholeWords: value.wholeWords ?? wholeWords };
        },
      },
      { signal: lifecycle.signal },
    );
    void Promise.resolve(registration).catch(() => undefined);
    return () => lifecycle.abort();
  }, [wholeWords]);

  function exportCsv() {
    const header = ['series', 'volume', 'chapter', 'mentions', 'matched_terms', 'quote'];
    const rows = passages.map(({ hit, mentions }) => [
      hit.file.series,
      hit.file.volume,
      hit.paragraph.chapterLabel || 'Story',
      mentions.length,
      [...new Set(mentions.map(mention => mention.term))].join('; '),
      hit.paragraph.text,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${submitted?.query.trim().replace(/[^a-z0-9]+/gi, '-') || 'mentions'}-mentions.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted({ query, aliases });
    setPage(1);
  }

  return (
    <main className={`search-page ${hasSearch ? 'has-results' : 'search-home'}`}>
      <section className="search-area" aria-label="Search the DanMachi collection">
        <h1 className="logo-heading">
          <img className="danmachi-logo" src="/danmachi-logo-english.png" width={1000} height={425} alt="Is It Wrong to Try to Pick Up Girls in a Dungeon? — Familia Myth" />
          <span className="sr-only">Novel search</span>
        </h1>
        <form onSubmit={submitSearch} className="search-form" role="search">
          <Combobox<AliasGroup> items={autocomplete} filter={null} value={null} inputValue={query}
            open={autocompleteOpen && autocomplete.length > 0} onOpenChange={setAutocompleteOpen}
            onInputValueChange={(value, details) => setQuery(current => autocompleteInputValue(current, value, details.reason))}
            onValueChange={group => {
              if (!group) return;
              const term = autocompleteTerm(query, group);
              setQuery(term);
              setAliases('');
              setSubmitted({ query: term, aliases: '' });
              setAutocompleteOpen(false);
              setPage(1);
            }}
            itemToStringLabel={group => autocompleteTerm(query, group)}>
          <div className="search-bar primary-bar" ref={searchAnchor}>
            <Search className="bar-icon" aria-hidden="true" />
            <label htmlFor="query" className="sr-only">Primary search term</label>
            <ComboboxInput id="query" className="autocomplete-input" showTrigger={false}
              placeholder="Search characters, places, items…" autoComplete="off" />
            {query && <Button type="button" className="clear-button" variant="ghost" size="icon" aria-label="Clear primary term" onClick={() => setQuery('')}><X /></Button>}
            <Button type="submit" className="search-submit" aria-label="Search collection" variant="ghost" size="icon"><Search /></Button>
          </div>
          {autocompleteOpen && autocomplete.length > 0 && <div aria-hidden="true" className="autocomplete-space"
            style={{ height: (autocompleteHeight || Math.min(autocomplete.length * 68 + 10, 256)) + 24 }} />}
          {autocomplete.length > 0 && <ComboboxContent anchor={searchAnchor} className="search-completions">
            <div ref={setAutocompletePanel}>
            <ComboboxList>{autocomplete.map(group => <ComboboxItem key={group.id} value={group}>
              <span>{autocompleteTerm(query, group)}<small>{group.name} · {group.category.replaceAll('_', ' ')}</small></span>
            </ComboboxItem>)}</ComboboxList>
            </div>
          </ComboboxContent>}
          </Combobox>
          <div className="search-bar aliases-bar">
            <label htmlFor="aliases" className="aliases-label">Aliases</label>
            <Input id="aliases" className="bar-input" value={aliases}
              onChange={event => setAliases(event.target.value)}
              placeholder="Other names, separated by commas" autoComplete="off" />
            {aliases && <Button type="button" className="clear-button" variant="ghost" size="icon" aria-label="Clear aliases" onClick={() => setAliases('')}><X /></Button>}
          </div>
          {aliasSuggestions.length > 0 && (
            <div className="alias-suggestions" aria-label="Suggested search spellings">
              {aliasSuggestions.map(group => {
                const selection = useAliasGroup(query, aliases, group);
                const alreadyIncluded = selection.query === query && selection.aliases === aliases;
                return (
                  <div className="alias-suggestion" key={group.id}>
                    <p className="alias-suggestion-label">{group.name} <span>· {group.category.replaceAll('_', ' ')}</span></p>
                    <p className="alias-suggestion-forms">{group.printed.join(' / ')}</p>
                    {group.caution && <p className="alias-caution">{group.caution}</p>}
                    <Button type="button" variant="ghost" className="apply-aliases" disabled={alreadyIncluded}
                      onClick={() => {
                        setQuery(selection.query);
                        setAliases(selection.aliases);
                        setSubmitted(selection);
                        setPage(1);
                      }}>{alreadyIncluded ? 'Name variants included' : 'Search these variants'}</Button>
                    {group.optional.length > 0 && (
                      <details className="optional-aliases">
                        <summary>Optional titles &amp; surnames · check context</summary>
                        {group.optional.map(item => (
                          <div className="optional-alias" key={item.form}>
                            <p>{item.caution}</p>
                            <Button type="button" variant="ghost" className="apply-aliases"
                              disabled={hasAliasTerm(query, aliases, item.form)}
                              onClick={() => {
                                const updated = addOptionalAlias(query, aliases, item.form);
                                setAliases(updated);
                                setSubmitted({ query, aliases: updated });
                                setPage(1);
                              }}>{hasAliasTerm(query, aliases, item.form) ? `${item.form} included` : `Also search “${item.form}”`}</Button>
                          </div>
                        ))}
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="search-options">
            <label><Checkbox checked={wholeWords} onCheckedChange={value => { setWholeWords(Boolean(value)); setPage(1); }} /> Whole words</label>
            <label title="Also search contents, title, copyright, and other publication pages."><Checkbox checked={includeFrontMatter} onCheckedChange={value => { setIncludeFrontMatter(Boolean(value)); setChapterFilter(''); setPage(1); }} /> Include title &amp; contents pages</label>
          </div>
        </form>
        <p className="library-status" role="status">
          {loading ? (volumeCount ? `Loading collection · ${loadedCount} / ${volumeCount} volumes` : 'Loading collection…') : error ? 'Library unavailable' : `${files.length} volumes · DanMachi and companion series`}
        </p>
        {error && <div className="error-state" role="alert">{error}<Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button></div>}
      </section>

      {hasSearch && !loading && !error && (
        <section className="results-panel" aria-label="Search results">
          <div className="result-filters" aria-label="Filter results">
            <div className="filter-field"><label htmlFor="series-filter">Series</label>
              <NativeSelect id="series-filter" value={seriesFilter} onChange={event => { setSeriesFilter(event.target.value); setVolumeFilter(''); setChapterFilter(''); setPage(1); }}>
                <NativeSelectOption value="">All series</NativeSelectOption>
                {seriesOptions.map(([code, name]) => <NativeSelectOption key={code} value={code}>{name}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className="filter-field"><label htmlFor="volume-filter">Volume</label>
              <NativeSelect id="volume-filter" value={volumeFilter} onChange={event => { setVolumeFilter(event.target.value); setChapterFilter(''); setPage(1); }}>
                <NativeSelectOption value="">All volumes</NativeSelectOption>
                {volumeOptions.map(file => <NativeSelectOption key={file.name} value={file.name}>{seriesFilter ? '' : `${file.series} · `}Volume {file.volume}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className="filter-field"><label htmlFor="chapter-filter">Chapter</label>
              <NativeSelect id="chapter-filter" value={chapterFilter} disabled={!volumeFilter} onChange={event => { setChapterFilter(event.target.value); setPage(1); }}>
                <NativeSelectOption value="">{volumeFilter ? 'All chapters' : 'Choose a volume first'}</NativeSelectOption>
                {chapterOptions.map(label => <NativeSelectOption key={label} value={label}>{label}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            {filtersActive && <Button variant="ghost" onClick={resetFilters} className="reset-filters">Clear filters</Button>}
          </div>
          <div className="results-header">
            <p role="status">{hits.length.toLocaleString()} {hits.length === 1 ? 'mention' : 'mentions'} · {passages.length.toLocaleString()} {passages.length === 1 ? 'passage' : 'passages'}{hits.length > 0 && ` in ${matchedVolumes} ${matchedVolumes === 1 ? 'volume' : 'volumes'}`}</p>
            <div className="result-tools">
            <CopyControl key={linkParams} label="Copy search link" link getText={() => {
              const url = new URL(window.location.href); url.search = linkParams; return url.href;
            }} />
            <Button variant="ghost" onClick={exportCsv} disabled={!hits.length} className="export-button"><Download aria-hidden="true" /> Export CSV</Button>
            </div>
          </div>
          {filtersActive && hiddenMentions > 0 && <div className="filter-feedback" role="status">
            <p>{hiddenMentions.toLocaleString()} {hiddenMentions === 1 ? 'mention is' : 'mentions are'} hidden by your filters.</p>
            <Button variant="ghost" onClick={resetFilters}>Search all series, volumes &amp; chapters</Button>
          </div>}
          {!hits.length ? (
            <div className="no-results">
              <h2>No matches for “{submitted?.query || submitted?.aliases}”</h2>
              <p>{filtersActive ? 'No matches with these filters. Try another series, volume, or chapter, or clear the filters.' : 'Try another spelling, add an alias, or turn off whole-word matching.'}</p>
            </div>
          ) : (
            <>
              <div className="result-list">
                {visiblePassages.map(result => <SearchResult key={`${result.hit.file.name}-${result.hit.paragraphIndex}-${terms.join('|')}`}
                  result={result} terms={terms} wholeWords={wholeWords} />)}
              </div>
              {pageCount > 1 && (
                <nav className="pagination" aria-label="Results pages">
                  <Button variant="ghost" size="icon" aria-label="Previous page" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); window.scrollTo({ top: 0 }); }}><ChevronLeft /></Button>
                  <span>Page {currentPage} of {pageCount}</span>
                  <Button variant="ghost" size="icon" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); window.scrollTo({ top: 0 }); }}><ChevronRight /></Button>
                </nav>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
