# The factoriolab-zmd Data Source

Independent AEF data-source repository for JEI Web.

This project converts upstream `factoriolab` data into JEI pack files:

- `manifest.json`
- `items.json`
- `itemsLite.json`
- `tags.json`
- `recipeTypes.json`
- `recipes.json`
- `source-meta.json`
- `image-slice-manifest.json` *(only when `--adaptive-split` is enabled)*

Pages deployment helper files are also generated in `dist/`:
`.nojekyll`, `_headers`, `edgeone.json`, `index.html`.

Output directory: `dist/`

## Upstream

- Upstream repository: https://github.com/endfield-calc/factoriolab/tree/ark-endfield-3rd-test
- Upstream data used: `src/data/aef/data.json` and `src/data/aef/icons.webp`
- Latest synced upstream commit is stored in `UPSTREAM_SNAPSHOT.json`

## License

This repository uses two license files:

- `LICENSE`: TheJeiWebProject license for this repository.
- `UPSTREAM_LICENSE`: inherited upstream MIT license from `factoriolab`.
- `NOTICE.md`: attribution and scope notes.

## Local Build

1. Install Node.js 20+
2. Install dependencies:

```bash
npm install
```

3. Build from a local upstream checkout (default expects `./upstream`):

```bash
node src/build-aef-pack.mjs --source upstream/src/data/aef/data.json --out-dir dist
```

or if your upstream repo is at `../factoriolab`:

```bash
npm run build:local
```

## Adaptive Image Slicing

By default the build copies the upstream sprite sheet (`icons.webp`) directly to
`dist/`.  Pass `--adaptive-split` to pre-split the sprite sheet into individual
tile images instead:

```bash
node src/build-aef-pack.mjs \
  --source upstream/src/data/aef/data.json \
  --out-dir dist \
  --adaptive-split
```

When enabled:

- Tiles are written to `dist/tiles/` using the naming pattern
  `{base}__s{scale}__r{row}_c{col}.png`.
- Each item's `iconSprite.url` is updated to point to the corresponding tile
  file instead of the full sprite sheet.
- A `dist/image-slice-manifest.json` is generated describing the mapping from
  the original sprite sheet to individual tiles.

### Adaptive slicing options

| Option | Default | Description |
|---|---|---|
| `--adaptive-split` / `--no-adaptive-split` | disabled | Enable or disable tile splitting. |
| `--base-tile <n>` | auto-derived | Optional override for logical tile size at target scale. By default, the converter derives base tile from source image dimensions + icon positions + source scale metadata. |
| `--target-scale <n>` | `1` | Desired output scale factor. |
| `--edge-policy crop\|pad` | `crop` | How to handle tiles at the right/bottom edges when the image is not an exact multiple of the tile size. `crop` keeps only the real pixel area; `pad` extends the tile to full size with transparent pixels. |

### Source scale metadata

The source `data.json` can carry an optional `iconScale` field at the top
level to indicate that each icon in the sprite sheet occupies
`baseTile × iconScale` pixels rather than exactly `baseTile` pixels.

```json
{ "iconScale": 2, "icons": [ ... ] }
```

The converter now infers source-tile size from the source sprite sheet dimensions and icon position grid, then derives logical base tile by scale conversion:

```
sourceTileW     = inferred from (imageW, icon positions)
sourceTileH     = inferred from (imageH, icon positions)
derivedBaseTile = sourceTile * targetScale / iconScale
effectiveTileW  = sourceTileW
effectiveTileH  = sourceTileH
cols            = ceil(imageW / effectiveTileW)
rows            = ceil(imageH / effectiveTileH)
```

`--base-tile` is only an explicit override. If `iconScale` is absent the build defaults to `1`.

## Tests

```bash
npm test
```

Unit and integration tests cover scale calculations, grid computation, edge
cropping/padding, manifest correctness, and module API.

## Automation

GitHub Actions workflow:

- `.github/workflows/update-aef-data.yml`

It will:

1. Checkout this repo.
2. Checkout upstream `endfield-calc/factoriolab` (`ark-endfield-3rd-test` branch).
3. Copy upstream `LICENSE` into `UPSTREAM_LICENSE`.
4. Rebuild `dist/`.
5. Update `UPSTREAM_SNAPSHOT.json`.
6. Validate adaptive split outputs (manifest, tile files, and item references) when slicing is enabled.
7. Commit and push if there are changes.

### Manual workflow inputs (`update-aef-data.yml`)

- `adaptive_split` (boolean, default `true`)
- `target_scale` (number, default `1`)
- `edge_policy` (`crop` or `pad`, default `crop`)
- `base_tile` (string, optional override; leave empty for auto-derive)

The workflow prints the effective config, sliced image/tile counts, and manifest path.
If `adaptive_split=true` but tiles/manifest are not produced, the workflow fails instead
of silently falling back to `icons.webp`.

By default, `iconSprite.url` is generated as relative path `icons.webp`.
If needed, you can override with `--asset-base-url`.
