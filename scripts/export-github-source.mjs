import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

// Explicit source allowlist; never copy .git, hosting state, secrets, or corpus.
const roots = ['app', 'components', 'hooks', 'lib'];
const paths = ['README.md', '.gitignore', '.oxfmtrc.json', '.oxlintrc.json',
  'components.json', 'next.config.ts', 'package.json', 'pnpm-lock.yaml',
  'pnpm-workspace.yaml', 'tsconfig.json', 'vite.config.ts',
  'scripts/build.mjs', 'scripts/build-aliases.mjs', 'scripts/build-library.mjs',
  'scripts/check-aliases.mjs', 'scripts/check-library.mjs', 'scripts/check-search-ui.mjs',
  'scripts/export-github-source.mjs', 'public/favicon.svg',
  'public/danmachi-logo-english.png', 'public/danmachi-logo.png'];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${directory}/${entry.name}`);
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await walk(path);
    else if (/\.(tsx?|css)$/.test(entry.name)) paths.push(path);
    else throw new Error(`Unreviewed source file: ${path}`);
  }
}
for (const directory of roots) await walk(directory);
const files = [];
for (const path of paths.sort()) {
  const bytes = await readFile(path);
  const binary = extname(path) === '.png';
  const content = bytes.toString(binary ? 'base64' : 'utf8');
  if (!binary && /drive\.google\.com\/|[A-Z]:[\\/]+Users[\\/]|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+/.test(content)) {
    throw new Error(`Private data needs review in ${path}`);
  }
  files.push({ path, encoding: binary ? 'base64' : 'utf-8', content });
}
await mkdir('outputs', { recursive: true });
await writeFile(join('outputs', 'github-source.json'), JSON.stringify(files));
console.log(`Prepared ${files.length} reviewed source files. No corpus, Drive link, or Git history included.`);
