import { parseTextFile, type LoadedFile } from './library.ts';

export class LibraryLoadError extends Error {}
type DriveConfig = { source: 'drive'; folderId: string; apiKey: string; expectedVolumes: number };
type StaticConfig = { source: 'static'; baseUrl: string; files: string[]; expectedVolumes: number };
type DriveFile = { id: string; name: string; mimeType: string; resourceKey?: string };
type Options = {
  basePath?: string;
  signal: AbortSignal;
  progress: (loaded: number, total: number) => void;
  request?: typeof fetch;
};
const volumeName = /^(fm|so|ar|fc|ss)\d+_fulltext\.txt$/i;

export async function loadBrowserLibrary({ basePath = '', signal, progress, request = fetch }: Options): Promise<LoadedFile[]> {
  signal.throwIfAborted();
  const localPath = (path: string) => `${basePath}/${path.replace(/^\/+/, '')}`;
  const get = (url: string, init: RequestInit = {}) => request(url, {
    ...init, signal, credentials: 'omit',
  });
  const configResponse = await get(localPath('search-config.json'), { cache: 'no-store' });
  let config: DriveConfig | StaticConfig | undefined;
  if (configResponse.ok) {
    const candidate = await configResponse.json() as (Partial<Omit<DriveConfig, 'source'> & Omit<StaticConfig, 'source'>> & { source?: string }) | null;
    // Validate before constructing any external requests. A failed remote
    // collection must never silently fall back to a different local library.
    if (!candidate ||
        typeof candidate.expectedVolumes !== 'number' || !Number.isInteger(candidate.expectedVolumes) || candidate.expectedVolumes < 1) {
      throw new LibraryLoadError('The collection connection is not configured correctly.');
    }
    const source = candidate.source;
    if (source === 'static') {
      let base: URL;
      try { base = new URL(candidate.baseUrl || ''); } catch {
        throw new LibraryLoadError('The collection connection is not configured correctly.');
      }
      if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash ||
          !Array.isArray(candidate.files) || candidate.files.length !== candidate.expectedVolumes ||
          !candidate.files.every(name => typeof name === 'string' && volumeName.test(name)) ||
          new Set(candidate.files.map(name => name.toLowerCase())).size !== candidate.files.length) {
        throw new LibraryLoadError('The collection connection is not configured correctly.');
      }
      config = { source: 'static', baseUrl: base.href.replace(/\/?$/, '/'), files: candidate.files, expectedVolumes: candidate.expectedVolumes };
    } else if (source === 'drive' && /^[\w-]+$/.test(candidate.folderId || '') &&
        typeof candidate.apiKey === 'string' && candidate.apiKey.trim()) {
      config = candidate as DriveConfig;
    } else {
      throw new LibraryLoadError('The collection connection is not configured correctly.');
    }
  } else if (configResponse.status !== 404) {
    throw new LibraryLoadError('The collection settings could not be loaded. Please try again.');
  }

  let items: { load: () => Promise<LoadedFile> }[];
  if (config?.source === 'static') {
    const collection = config;
    items = collection.files.map(name => ({ load: async () => {
      let response: Response;
      try { response = await get(new URL(name, collection.baseUrl).href); } catch {
        signal.throwIfAborted();
        throw new LibraryLoadError('The collection download was blocked or interrupted. Please try again.');
      }
      if (!response.ok) throw new LibraryLoadError(`A volume could not be loaded (HTTP ${response.status}). No partial search results will be shown.`);
      const raw = await response.text();
      if (/text\/html/i.test(response.headers.get('content-type') || '') || /^\s*(?:<!doctype html|<html)/i.test(raw)) {
        throw new LibraryLoadError('A volume address returned a web page instead of novel text.');
      }
      const file = parseTextFile(name.toLowerCase(), raw);
      if (!file.paragraphs.length) throw new LibraryLoadError('An empty volume was received.');
      return file;
    } }));
  } else if (config?.source === 'drive') {
    const drive = config;
    const entries: DriveFile[] = [];
    let pageToken = '';
    const seenPages = new Set<string>();
    do {
      const params = new URLSearchParams({
        q: `'${drive.folderId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,resourceKey)', pageSize: '1000', key: drive.apiKey,
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await get(`https://www.googleapis.com/drive/v3/files?${params}`);
      if (!response.ok) throw new LibraryLoadError('Google Drive could not open the collection. Its sharing settings, browser key, or download limit may need checking.');
      const data = await response.json() as { files?: DriveFile[]; nextPageToken?: string } | null;
      if (!data || !Array.isArray(data.files)) throw new LibraryLoadError('Google Drive returned an invalid file list.');
      entries.push(...data.files.filter(item => item && typeof item.name === 'string' && volumeName.test(item.name)));
      pageToken = data.nextPageToken || '';
      if (pageToken && seenPages.has(pageToken)) throw new LibraryLoadError('Google Drive returned an incomplete file list.');
      seenPages.add(pageToken);
    } while (pageToken);
    const names = new Set(entries.map(item => item.name.toLowerCase()));
    if (entries.length !== drive.expectedVolumes || names.size !== entries.length) {
      throw new LibraryLoadError('The complete collection is not accessible. No partial search results will be shown.');
    }
    items = entries.sort((a, b) => a.name.localeCompare(b.name)).map(item => ({ load: async () => {
      if (!/^[\w-]+$/.test(item.id) || item.mimeType !== 'text/plain') throw new LibraryLoadError('An unexpected file was found in the collection.');
      const params = new URLSearchParams({ alt: 'media', key: drive.apiKey });
      const headers: Record<string, string> = {};
      if (item.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${item.id}/${item.resourceKey}`;
      const response = await get(`https://www.googleapis.com/drive/v3/files/${item.id}?${params}`, { headers });
      if (!response.ok) throw new LibraryLoadError('A volume could not be downloaded from Google Drive. Please try again later.');
      const raw = await response.text();
      // Both marked EPUB extracts and plain text (including volumes 15–17)
      // are supported by the parser. Section markers are not required.
      // Do not parse a sign-in/error HTML page as a novel.
      if (/^\s*(?:<!doctype html|<html)/i.test(raw)) {
        throw new LibraryLoadError('A volume did not contain the expected novel text.');
      }
      const file = parseTextFile(item.name.toLowerCase(), raw);
      if (!file.paragraphs.length) throw new LibraryLoadError('An empty volume was received.');
      return file;
    } }));
  } else {
    const response = await get(localPath('library/manifest.json'), { cache: 'no-cache' });
    if (!response.ok) throw new LibraryLoadError('The collection connection is not available yet.');
    const manifest = await response.json() as { volumes?: { url: string }[] } | null;
    if (!manifest || !Array.isArray(manifest.volumes) || !manifest.volumes.length) throw new LibraryLoadError('The collection is empty.');
    items = manifest.volumes.map((volume: { url: string }) => ({ load: async () => {
      if (typeof volume.url !== 'string' || !/^\/library\/[\w.-]+\.json$/.test(volume.url)) throw new LibraryLoadError('Invalid local volume address.');
      const result = await get(localPath(volume.url));
      if (!result.ok) throw new LibraryLoadError('A volume could not be loaded. Please try again.');
      const file = await result.json() as LoadedFile;
      if (!Array.isArray(file.paragraphs) || !file.paragraphs.length) throw new LibraryLoadError('An invalid volume was received.');
      return file;
    } }));
  }

  progress(0, items.length);
  const loaded: LoadedFile[] = [];
  for (let start = 0; start < items.length; start += 6) {
    signal.throwIfAborted();
    loaded.push(...await Promise.all(items.slice(start, start + 6).map(item => item.load())));
    signal.throwIfAborted();
    progress(loaded.length, items.length);
  }
  return loaded;
}
