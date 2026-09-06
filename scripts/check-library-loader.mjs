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
function driveRequest({ missing = false, failure = false, html = false, duplicate = false, text = raw } = {}) {
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
    return new Response(html ? '<!doctype html><html>Sign in</html>' : text);
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
for (const invalid of [{ missing: true }, { duplicate: true }, { failure: true }, { html: true }, { text: ' \r\n\t' }]) {
  await assert.rejects(loadBrowserLibrary({ ...opts, request: driveRequest(invalid) }));
}
// Some real volumes are plain text without EPUB section markers.
// Preserve their quotations and chapter labels just like the local parser.
for (const newline of ['\n', '\r\n', '\r']) {
  const plain = ['CHAPTER 3', 'A NEW DAY', '  Anya waved to Bell.  ', ''].join(newline);
  const plainFiles = await loadBrowserLibrary({ ...opts, request: driveRequest({ text: plain }) });
  assert.equal(plainFiles.length, 2);
  assert.deepEqual(plainFiles[0], parseTextFile(fixture[0].name, plain));
  assert.equal(plainFiles[0].paragraphs[2].text, '  Anya waved to Bell.  ');
  assert.equal(plainFiles[0].paragraphs[2].chapterLabel, 'Chapter 3 — A NEW DAY');
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
const staticConfig = { source: 'static', baseUrl: 'https://library.example/Raw%20Text',
  files: fixture.map(file => file.name), expectedVolumes: 2 };
const staticCalls = [];
const staticProgress = [];
function staticRequest({ settings = staticConfig, status = 200, text = raw, contentType = 'text/plain', networkError = false } = {}) {
  return async (url, init) => {
    assert.equal(init.credentials, 'omit');
    assert.equal(init.signal, opts.signal);
    if (url.endsWith('search-config.json')) return json(settings);
    staticCalls.push(url);
    assert.ok(url.startsWith('https://library.example/Raw%20Text/'));
    assert.ok(!url.includes('key='));
    if (networkError) throw new TypeError('Failed to fetch');
    return new Response(text, { status, headers: { 'Content-Type': contentType } });
  };
}
const staticFiles = await loadBrowserLibrary({ ...opts, request: staticRequest(), progress: (...p) => staticProgress.push(p) });
assert.deepEqual(staticFiles, fixture.map(file => parseTextFile(file.name, raw)));
assert.deepEqual(staticProgress, [[0, 2], [2, 2]]);
assert.deepEqual(staticCalls, fixture.map(file => staticConfig.baseUrl + '/' + file.name));
for (const failure of [{ status: 404 }, { status: 403 }, { text: ' \n' }, { contentType: 'text/html' },
  { text: '<!doctype html><html>Error</html>' }, { networkError: true }]) {
  await assert.rejects(loadBrowserLibrary({ ...opts, request: staticRequest(failure) }));
}
for (const settings of [
  { ...staticConfig, files: ['../secret.txt', fixture[1].name] },
  { ...staticConfig, files: [fixture[0].name, fixture[0].name] },
  { ...staticConfig, expectedVolumes: 42 },
  { ...staticConfig, baseUrl: 'http://library.example/' },
  { ...staticConfig, baseUrl: 'https://user:password@library.example/' },
  { ...staticConfig, baseUrl: 'https://library.example/?key=secret' },
]) await assert.rejects(loadBrowserLibrary({ ...opts, request: staticRequest({ settings }) }), /configured/);
console.log('Passed: static and Drive browser loading, marked and plain text, exact quotes and chapters, pagination, invalid configurations, failed/empty/HTML downloads, cancellation, and Pages-prefixed local fallback.');
