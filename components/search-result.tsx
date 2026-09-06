'use client';

import { useState } from 'react';
import { Copy, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { makePattern } from '@/lib/library';
import { passageContext, quoteWithCitation, type PassageResult } from '@/lib/search-ui';

export function HighlightedQuote({ text, terms, wholeWords }: { text: string; terms: string[]; wholeWords: boolean }) {
  const pattern = makePattern(terms, wholeWords);
  if (!pattern) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    parts.push(text.slice(cursor, index));
    parts.push(<mark key={index} className="mention-mark">{match[0]}</mark>);
    cursor = index + match[0].length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export function CopyControl({ getText, label, link = false }: { getText: () => string; label: string; link?: boolean }) {
  const [status, setStatus] = useState('');
  const [fallback, setFallback] = useState('');
  return <div className="copy-control">
    <Button type="button" variant="ghost" className="copy-button" onClick={async () => {
      const text = getText();
      try {
        await navigator.clipboard.writeText(text);
        setFallback('');
        setStatus(link ? 'Search link copied' : 'Quote and citation copied');
      } catch {
        setFallback(text);
        setStatus('Clipboard unavailable. Select and copy the text below.');
      }
    }}>{link ? <LinkIcon aria-hidden="true" /> : <Copy aria-hidden="true" />}{label}</Button>
    <span className="copy-status" role="status">{status}</span>
    {fallback && <Textarea aria-label={`${label} — manual copy`} readOnly value={fallback} onFocus={event => event.target.select()} />}
  </div>;
}

export function SearchResult({ result, terms, wholeWords }: { result: PassageResult; terms: string[]; wholeWords: boolean }) {
  const [radius, setRadius] = useState(1);
  const { hit, mentions } = result;
  const context = passageContext(hit, radius);
  return <article className="result-entry">
    <div className="result-source">{hit.file.series} <span>›</span> Volume {hit.file.volume}</div>
    <h2 className="result-title">{hit.paragraph.chapterLabel || 'Story'}</h2>
    <blockquote><HighlightedQuote text={hit.paragraph.text} terms={terms} wholeWords={wholeWords} /></blockquote>
    <div className="passage-actions">
      <span className="passage-count">{mentions.length} {mentions.length === 1 ? 'mention' : 'mentions'} in this passage</span>
      <CopyControl getText={() => quoteWithCitation(hit)} label="Copy quote & citation" />
    </div>
    {(context.before.length > 0 || context.after.length > 0) && <details className="result-context">
      <summary>Surrounding context</summary>
      {context.before.map(p => <p key={p.line}><HighlightedQuote text={p.text} terms={terms} wholeWords={wholeWords} /></p>)}
      <p className="context-match"><HighlightedQuote text={hit.paragraph.text} terms={terms} wholeWords={wholeWords} /></p>
      {context.after.map(p => <p key={p.line}><HighlightedQuote text={p.text} terms={terms} wholeWords={wholeWords} /></p>)}
      <div className="context-actions">
        {radius === 1 && context.canExpand && <Button variant="ghost" onClick={() => setRadius(4)}>Show more context</Button>}
        {radius > 1 && <Button variant="ghost" onClick={() => setRadius(1)}>Show less</Button>}
        <span>Within this chapter · up to 4 paragraphs each side</span>
      </div>
    </details>}
  </article>;
}
