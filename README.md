# DanMachi Search

A dark search interface for finding literal text matches across DanMachi and companion series, with opt-in aliases, source citations, filters, and surrounding context.

## Hosting status

This repository contains application code and interface assets only. It does not contain novel texts, a Google Drive folder link, credentials, or the development repository's history.

Search runs entirely in the visitor's browser. No separate backend or Render service is used. The browser automatically downloads the externally stored collection; visitors do not need to supply files or sign in.

The intended deployment is:

- GitHub Pages serves the interface.
- Cloudflare Pages Direct Upload serves the text files, separate from this repository.
- The browser downloads and searches those files directly, with no API key or Google connection.
- File addresses are public and discoverable in the configuration and network requests. CORS permits browser access; it does not make the files private.

## GitHub Pages setup

1. Upload the 42 `_fulltext.txt` files through Cloudflare Pages **Direct Upload**, not Git integration or R2. Keep the original filenames.
2. Include a root `_headers` file allowing browser access from the website:

   ```text
   /*
     Access-Control-Allow-Origin: https://vanaalfi.github.io
   ```

3. Set `LIBRARY_BASE_URL` in the publishing workflow to the HTTPS folder containing the text files. The current upload has a `Danmachi Raw Text` subfolder. No GitHub secrets are needed for this connection; old Drive secrets are unused.
4. In Settings → Pages, choose **GitHub Actions** as the publishing source.
5. Under Actions, run **Publish GitHub Pages**. It runs manually only; no deployment starts just from a code push.
6. Verify all 42 volumes load from the public website before treating publication as complete. File paths and cross-origin access must work for the uploaded assets. A 404 on the library's root page alone is normal when no index page was uploaded.

The publishing preparation refuses to run if a local `public/library` directory is present or the connection values are missing. Only the clean checkout should be used for publication. `public/search-config.json` is generated during the build and ignored by Git.

References: [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Cloudflare response headers](https://developers.cloudflare.com/pages/configuration/headers/), [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

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
