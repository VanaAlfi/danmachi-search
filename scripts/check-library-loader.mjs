import assert from 'node:assert/strict';
import { loadBrowserLibrary } from '../lib/library-loader.ts';
import { parseTextFile } from '../lib/library.ts';

const raw = '===== Text/chapter1.xhtml =====\n  Bell saw Anya.  \n';
const config = { source: 'drive', folderId: 'folder-example', apiKey: 'test-browser-key', expectedVolumes: 2 };
const fixture = [
  { id: 'volume-one', name: 'fm01_fulltext.txt', mimeType: 'text/plain' },
  { id: 'volume-two', name: 'so01_fulltext.txt', mimeType: 'text/plain', resourceKey: 'resource-example' },
];
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const progress = [];
const requests = [];
function driveRequest({ missing = false, failure = false, html = false, duplicate = false } = {}) {
  return async (url, init) => {
    requests.push(String(url));
    assert.equal(init.credentials, 'omit');
    if (url === '/danmachi-search/search-config.json') return json(config);
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://www.googleapis.com');
    assert.equal(parsed.searchParams.get('key'), config.apiKey);
    if (parsed.pathname === '/drive/v3/files') {
      assert.equal(parsed.searchParams.get('q'), "'folder-example' in parents and trashed = false");
      if (parsed.searchParams.has('pageToken')) return json({ files: missing ? [] : [duplicate ? fixture[0] : fixture[1]] });
      return json({ files: [fixture[0]], nextPageToken: 'next' });
    }
    assert.equal(parsed.searchParams.get('alt'), 'media');
    if (parsed.pathname.endsWith('volume-two')) {
      assert.equal(init.headers['X-Goog-Drive-Resource-Keys'], 'volume-two/resource-example');
      if (failure) return json({}, 403);
    }
    return new Response(html ? '<!doctype html><html>Sign in</html>' : raw);
  };
}
const opts = { basePath: '/danmachi-search', signal: new AbortController().signal,
  progress: (count, total) => progress.push([count, total]), request: driveRequest() };
const files = await loadBrowserLibrary(opts);
assert.equal(files.length, 2);
assert.deepEqual(files[0], parseTextFile(fixture[0].name, raw));
assert.deepEqual(progress, [[0, 2], [2, 2]]);
assert.equal(files[0].paragraphs[0].text, '  Bell saw Anya.  ');
assert.ok(!requests.some(url => url.includes('/library/')));
for (const invalid of [{ missing: true }, { duplicate: true }, { failure: true }, { html: true }]) {
  await assert.rejects(loadBrowserLibrary({ ...opts, request: driveRequest(invalid) }));
}
const localCalls = [];
const local = await loadBrowserLibrary({ ...opts, request: async url => {
  localCalls.push(url);
  if (url.endsWith('search-config.json')) return json({}, 404);
  if (url.endsWith('manifest.json')) return json({ volumes: [{ url: '/library/fm01.json' }] });
  return json(parseTextFile('fm01_fulltext.txt', raw));
} });
assert.equal(local.length, 1);
assert.deepEqual(localCalls, ['/danmachi-search/search-config.json', '/danmachi-search/library/manifest.json', '/danmachi-search/library/fm01.json']);
const stopped = new AbortController(); stopped.abort();
await assert.rejects(loadBrowserLibrary({ ...opts, signal: stopped.signal, request: driveRequest() }));
await assert.rejects(loadBrowserLibrary({ ...opts, request: async () => json({ ...config, folderId: "bad'folder" }) }), /configured/);
console.log('Passed: browser Drive loading, pagination, exact text, missing/duplicate/failed volumes, HTML rejection, cancellation, and Pages-prefixed local fallback.');
