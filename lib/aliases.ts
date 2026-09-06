import { aliasData } from './alias-data.ts';

export type AliasGroup = typeof aliasData[number];

// Normalize lookup keys only. Search patterns and source quotes stay literal.
export function aliasKey(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/ø/g, 'o')
    .replace(/[’‘]/g, "'").replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim();
}
const literalKey = (value: string) => value.trim().toLowerCase();

export function hasAliasTerm(query: string, aliases: string, term: string) {
  return [query, ...aliases.split(',')].some(value => literalKey(value) === literalKey(term));
}

export function addOptionalAlias(query: string, aliases: string, term: string) {
  return hasAliasTerm(query, aliases, term) ? aliases : [aliases.trim(), term].filter(Boolean).join(', ');
}

export function suggestAliases(query: string): AliasGroup[] {
  const key = aliasKey(query);
  if (!key) return [];
  return aliasData.filter(group => group.inputs.some(input => aliasKey(input) === key));
}

export function autocompleteAliases(query: string, limit = 8): AliasGroup[] {
  const key = aliasKey(query);
  if (key.length < 2) return [];
  return aliasData.map(group => {
    const forms = group.inputs.map(aliasKey);
    const rank = forms.includes(key) ? 0 : forms.some(form => form.startsWith(key)) ? 1
      : forms.some(form => form.includes(` ${key}`)) ? 2 : 3;
    return { group, rank };
  }).filter(item => item.rank < 3).sort((a, b) => a.rank - b.rank || a.group.name.localeCompare(b.group.name))
    .slice(0, limit).map(item => item.group);
}

// A combobox normally restores its selected label on close. This is a free-text
// search field: blur, Escape, and popup cleanup must never replace its contents.
export function autocompleteInputValue(current: string, next: string, reason: string) {
  return reason === 'input-change' ? next : current;
}

// Complete one visible term only. Alias expansion is a separate opt-in action.
export function autocompleteTerm(query: string, group: AliasGroup) {
  const key = aliasKey(query);
  if (group.inputs.some(form => aliasKey(form) === key)) return query.trim();
  return group.printed.filter(form => aliasKey(form).startsWith(key))
    .sort((a, b) => a.length - b.length)[0] || group.name;
}

export function useAliasGroup(query: string, aliases: string, group: AliasGroup) {
  // Query-only labels resolve to a printed spelling, rather than remaining
  // broad literal terms such as "Horn" alongside a character's printed name.
  const primary = group.printed.find(form => literalKey(form) === literalKey(query)) || group.printed[0];
  const seen = new Set([literalKey(primary)]);
  const extras = [...aliases.split(',').map(term => term.trim()), ...group.printed].filter(term => {
    const key = literalKey(term);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { query: primary, aliases: extras.join(', ') };
}
