type SourceLine = { text: string; section: string; line: number; frontMatter: boolean; chapterLabel?: string };
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function displayTitle(text: string) {
  return text.replace(/^(Chapter)\s+0*(\d+)\s*:\s*/i, 'Chapter $2 — ')
    .replace(/^(Prologue(?:\s+[IVX]+)?|Epilogue(?:\s+[IVX]+)?|Intermission|Interlude|Fragment|Extra)\s*:\s*/i, '$1 — ');
}

export function labelChapters(lines: SourceLine[]) {
  const marked = lines.some(line => line.section);
  const tocSections = new Set(lines.filter(line => /^contents$/i.test(line.text.trim()) && line.section).map(line => line.section));
  const publicationSections = new Set<string>();
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 || lines[i].section !== lines[i - 1].section) start = i;
    if (marked && i - start < 4 && /^(Copyright|Cover|Title Page)$/.test(lines[i].text.trim())) publicationSections.add(lines[i].section);
  }
  const contentsStart = lines.findIndex(line => /^contents$/i.test(line.text.trim()));
  let contentsEnd = contentsStart;
  if (!marked && contentsStart >= 0) {
    contentsEnd = lines.findIndex((line, index) => index > contentsStart && /^(PROLOGUE|CHAPTER\s+\d+|EPILOGUE)(?:\s+[IVX]+)?$/.test(line.text.trim()));
    if (contentsEnd < 0) contentsEnd = contentsStart;
  }
  const toc = lines.filter((line, index) => marked ? tocSections.has(line.section) : index > contentsStart && index < contentsEnd)
    .map(line => line.text.trim()).filter(text => text && text.length < 240 && !/^(?:contents|cover|insert|title page|copyright|yen newsletter|navigation|begin reading|table of contents|volume\s+\d+|miscellaneous|bonus short story)$/i.test(text)
      && !text.startsWith('.') && !/^Is It Wrong/i.test(text) && !/^part\d+$/i.test(text));
  const titles = new Map(toc.map(title => [normalize(title), displayTitle(title)]));
  let current = 'Story';
  let previousSection = '';
  let sectionStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (tocSections.has(line.section) || publicationSections.has(line.section)) line.frontMatter = true;
    if (line.section !== previousSection) {
      sectionStart = i;
      previousSection = line.section;
    }
    if (!marked && i < contentsEnd) line.frontMatter = true;
    if (line.frontMatter) {
      line.chapterLabel = tocSections.has(line.section) || (!marked && i >= contentsStart) ? 'Contents' : 'Title and publication pages';
      continue;
    }
    const text = line.text.trim();
    const mayBeHeading = !marked || i - sectionStart < 7;
    let detected: string | undefined;
    if (mayBeHeading) {
      for (let count = 1; count <= 3; count++) {
        const part = lines.slice(i, i + count);
        if (part.some(p => p.section !== line.section)) break;
        const candidate = part.map(p => p.text.trim()).join(' ');
        if (candidate.length > 260) break;
        detected = titles.get(normalize(candidate));
        if (detected) break;
      }
      // Some extracts have no contents list. Only use explicit heading lines,
      // never the EPUB section number, for the chapter's printed number.
      if (!detected && /^CHAPTER\s+\d+/.test(text) && text.length < 180) {
        const match = text.match(/^CHAPTER\s+(\d+)\s*[:—-]?\s*(.*)$/);
        if (match) {
          const following = lines[i + 1]?.text.trim();
          const title = match[2] || (following && following === following.toUpperCase() && following.length < 160 ? following : '');
          detected = `Chapter ${Number(match[1])}${title ? ` — ${title}` : ''}`;
        }
      }
      if (!detected && /^Afterword$/i.test(text)) detected = 'Afterword';
    }
    if (detected) {
      current = detected;
      // Heading pages can repeat the volume title before the chapter heading.
      if (marked) for (let j = sectionStart; j < i; j++) if (!lines[j].frontMatter) lines[j].chapterLabel = current;
    }
    line.chapterLabel = current;
  }
}
