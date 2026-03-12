# The factoriolab-zmd Data Source

Independent AEF data-source repository for JEI Web.

This project converts upstream `factoriolab-zmd` data into JEI pack files:

- `manifest.json`
- `items.json`
- `itemsLite.json`
- `tags.json`
- `recipeTypes.json`
- `recipes.json`
- `source-meta.json`

Pages deployment helper files are also generated in `dist/`:
`.nojekyll`, `_headers`, `edgeone.json`, `index.html`.

Output directory: `dist/`

## Upstream

- Upstream repository: https://github.com/Bakingss/factoriolab-zmd
- Upstream data used: `src/data/aef/data.json` and `src/data/aef/icons.webp`
- Latest synced upstream commit is stored in `UPSTREAM_SNAPSHOT.json`

## License

This repository uses two license files:

- `LICENSE`: TheJeiWebProject license for this repository.
- `UPSTREAM_LICENSE`: inherited upstream MIT license from `factoriolab-zmd`.
- `NOTICE.md`: attribution and scope notes.

## Local Build

1. Install Node.js 20+
2. Install dependencies:

```bash
npm install
```

3. Build from a local upstream checkout (default expects `./upstream`):

```bash
npm run build -- --source upstream/src/data/aef/data.json --out-dir dist
```

or if your upstream repo is at `../factoriolab-zmd`:

```bash
npm run build:local
```

## Automation

GitHub Actions workflow:

- `.github/workflows/update-aef-data.yml`

It will:

1. Checkout this repo.
2. Checkout upstream `Bakingss/factoriolab-zmd`.
3. Copy upstream `LICENSE` into `UPSTREAM_LICENSE`.
4. Rebuild `dist/`.
5. Update `UPSTREAM_SNAPSHOT.json`.
6. Commit and push if there are changes.
