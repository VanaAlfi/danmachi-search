# DanMachi Search

A dark search interface for finding literal text matches across DanMachi and companion series, with opt-in aliases, source citations, filters, and surrounding context.

## Hosting status

This repository contains application code and interface assets only. It does not contain novel texts, a Google Drive folder link, credentials, or the development repository's history.

Search runs entirely in the visitor's browser. No separate backend or Render service is used. The browser automatically downloads the externally stored collection; visitors do not need to supply files or sign in. Publishing still requires the Drive browser connection to be configured and verified.

The intended deployment is:

- GitHub Pages serves the interface.
- The browser reads publicly shared text files through the Google Drive API and searches them locally.
- The folder ID and a restricted browser API key are supplied at build time, not committed in source. They ARE discoverable in the published configuration and network requests. This is not a way to keep them secret.

## GitHub Pages setup

1. Confirm the source folder and all 42 text files are readable by anyone with the link. Do not change sharing on unrelated Drive files.
2. In a Google Cloud project, enable **Google Drive API** and create an API key for public browser access. Restrict it to **Google Drive API** and the website referrer `https://vanaalfi.github.io/*`. Do not use an OAuth token, service-account private key, or an unrestricted key. This key does not grant access to private Drive files.
3. In repository Settings → Secrets and variables → Actions, set `DRIVE_FOLDER_ID` and `DRIVE_BROWSER_API_KEY` as repository secrets. They avoid putting the values in source/history; the published browser configuration will still expose them.
4. In Settings → Pages, choose **GitHub Actions** as the publishing source.
5. Under Actions, run **Publish GitHub Pages**. It runs manually only; no deployment starts just from a code push.
6. Verify all 42 volumes load from the public website before treating publication as complete. API restrictions, Drive sharing, CORS behavior, and quota limits must be checked with the real browser configuration.

The publishing preparation refuses to run if a local `public/library` directory is present or the connection values are missing. Only the clean checkout should be used for publication. `public/search-config.json` is generated during the build and ignored by Git.

References: [Google's browser API key setup](https://developers.google.com/workspace/guides/create-credentials), [Drive usage limits](https://developers.google.com/workspace/drive/api/guides/limits), [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

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
