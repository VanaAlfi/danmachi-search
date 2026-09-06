# DanMachi Search

A dark search interface for finding literal text matches across DanMachi and companion series, with opt-in aliases, source citations, filters, and surrounding context.

## Hosting status

This repository contains application code and interface assets only. It does not contain novel texts, a Google Drive folder link, credentials, or the development repository's history.

The current application is the working local-search version. A fresh clone can build, but cannot search without its separately supplied library. GitHub Pages is not live yet. Before publishing, the client-side library loader must be replaced with requests to a separately hosted search backend.

The intended deployment is:

- GitHub Pages serves the interface.
- A separate backend reads the source library and returns matching passages.
- Drive identifiers and credentials stay in private backend configuration, never in browser code or public build variables.

Do not deploy `public/library`, add the full texts to this repository, or push the original development repository's history. Ignoring files does not remove them from existing Git history.

## Local development

Use Node.js 24 and pnpm with the checked-in lockfile:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
```

For local corpus work only, `scripts/build-library.mjs` accepts a source directory supplied by the operator and writes the ignored `public/library` directory. Corpus-dependent checks require that local library.

Search totals count literal text matches, not verified character references. Aliases are optional, and ambiguous aliases require checking the surrounding context.
