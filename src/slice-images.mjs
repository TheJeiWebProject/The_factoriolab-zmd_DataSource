/**
 * Adaptive image slicing for sprite sheet assets.
 *
 * Splits a source sprite-sheet into individual tile images using per-image
 * scale metadata so that the effective pixel tile size can vary across
 * different source images while always producing output at the desired
 * logical tile size.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Compute the effective tile width/height in source-image pixels.
 *
 * @param {number} baseTile   Logical tile dimension (e.g. 64).
 * @param {number} srcScale   Scale factor recorded in the source metadata.
 * @param {number} tgtScale   Desired output scale (default 1).
 * @returns {number}
 */
export function effectiveTileSize(baseTile, srcScale, tgtScale) {
  return Math.round(baseTile * srcScale / tgtScale);
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Infer per-icon tile size in source-image pixels from source image dimensions
 * and icon background-position metadata.
 *
 * @param {object} opts
 * @param {number} opts.imageW
 * @param {number} opts.imageH
 * @param {Array<{x:number,y:number}>} opts.iconPositions
 * @returns {{ tileW: number, tileH: number, method: string }}
 */
export function inferSourceTileSize({ imageW, imageH, iconPositions }) {
  const xs = iconPositions.map((p) => p.x).filter((n) => Number.isFinite(n) && n >= 0);
  const ys = iconPositions.map((p) => p.y).filter((n) => Number.isFinite(n) && n >= 0);

  const inferAxis = (size, values, axis) => {
    let axisGcd = size;
    for (const v of values) {
      axisGcd = gcd(axisGcd, v);
    }
    if (axisGcd === 0) {
      return { value: size, method: `${axis}-fallback-image-size` };
    }
    return { value: axisGcd, method: `${axis}-gcd(image-size+positions)` };
  };

  const w = inferAxis(imageW, xs, 'x');
  const h = inferAxis(imageH, ys, 'y');
  return {
    tileW: Math.max(1, w.value),
    tileH: Math.max(1, h.value),
    method: `${w.method};${h.method}`,
  };
}

/**
 * Compute the grid dimensions for a sprite sheet.
 *
 * @param {number} imageW       Width of the source image in pixels.
 * @param {number} imageH       Height of the source image in pixels.
 * @param {number} tileW        Effective tile width in source pixels.
 * @param {number} tileH        Effective tile height in source pixels.
 * @returns {{ cols: number, rows: number }}
 */
export function computeGrid(imageW, imageH, tileW, tileH) {
  return {
    cols: Math.ceil(imageW / tileW),
    rows: Math.ceil(imageH / tileH),
  };
}

/**
 * Build the output filename for a single tile.
 *
 * Pattern: `{base}__s{scale}__r{row}_c{col}.png`
 *
 * @param {string} baseName   Base name derived from the source image filename
 *                            (without extension).
 * @param {number} scale      The source scale value used for slicing.
 * @param {number} row        0-based row index.
 * @param {number} col        0-based column index.
 * @returns {string}
 */
export function tileName(baseName, scale, row, col) {
  return `${baseName}__s${scale}__r${row}_c${col}.png`;
}

/**
 * Slice a single sprite-sheet image into tiles and write them to disk.
 *
 * @param {object}  opts
 * @param {string}  opts.srcPath      Absolute path to the source image.
 * @param {string}  opts.outDir       Directory where tile files are written.
 * @param {string}  opts.baseName     Base name used in tile filenames.
 * @param {number}  opts.srcScale     Scale factor from source metadata (default 1).
 * @param {number}  opts.tgtScale     Desired output scale factor (default 1).
 * @param {number}  opts.baseTileW    Logical tile width in pixels (default 64).
 * @param {number}  opts.baseTileH    Logical tile height in pixels (default 64).
 * @param {string}  opts.edgePolicy   'crop' (default) keeps the real remainder
 *                                    area; 'pad' pads short edges with transparency.
 *
 * @returns {Promise<SliceManifestEntry>}  Manifest entry describing the result.
 */
export async function sliceImage(opts) {
  const {
    srcPath,
    outDir,
    baseName,
    srcScale = 1,
    tgtScale = 1,
    baseTileW = 64,
    baseTileH = 64,
    sourceTileW,
    sourceTileH,
    derivedBaseTileW,
    derivedBaseTileH,
    sourceImageId,
    edgePolicy = 'crop',
  } = opts;

  const img = sharp(srcPath);
  const meta = await img.metadata();
  const imageW = meta.width;
  const imageH = meta.height;

  const tileW = Number.isFinite(sourceTileW) && sourceTileW > 0
    ? Math.round(sourceTileW)
    : effectiveTileSize(baseTileW, srcScale, tgtScale);
  const tileH = Number.isFinite(sourceTileH) && sourceTileH > 0
    ? Math.round(sourceTileH)
    : effectiveTileSize(baseTileH, srcScale, tgtScale);
  const { cols, rows } = computeGrid(imageW, imageH, tileW, tileH);

  fs.mkdirSync(outDir, { recursive: true });

  const tiles = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * tileW;
      const y = row * tileH;

      // Actual pixel area available for this tile (may be smaller at edges).
      const actualW = Math.min(tileW, imageW - x);
      const actualH = Math.min(tileH, imageH - y);

      const filename = tileName(baseName, srcScale, row, col);
      const outPath = path.join(outDir, filename);

      let pipeline = sharp(srcPath).extract({ left: x, top: y, width: actualW, height: actualH });

      if (edgePolicy === 'pad' && (actualW < tileW || actualH < tileH)) {
        // Extend with transparent pixels to reach full tile size.
        pipeline = pipeline.extend({
          top: 0,
          bottom: tileH - actualH,
          left: 0,
          right: tileW - actualW,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        });
      }

      await pipeline.png().toFile(outPath);

      tiles.push({
        row,
        col,
        x,
        y,
        actualW,
        actualH,
        filename,
      });
    }
  }

  return {
    sourceImageId: sourceImageId ?? baseName,
    baseName,
    srcPath,
    sourceScale: srcScale,
    targetScale: tgtScale,
    srcScale,
    tgtScale,
    derivedBaseTileW: Number.isFinite(derivedBaseTileW) ? derivedBaseTileW : baseTileW,
    derivedBaseTileH: Number.isFinite(derivedBaseTileH) ? derivedBaseTileH : baseTileH,
    baseTileW,
    baseTileH,
    effectiveTileW: tileW,
    effectiveTileH: tileH,
    imageW,
    imageH,
    rows,
    cols,
    edgePolicy,
    tiles,
  };
}

/**
 * @typedef {object} SliceManifestEntry
 * @property {string}   baseName          Base name of the source image.
 * @property {string}   srcPath           Source image path.
 * @property {number}   sourceScale       Source scale factor (alias of srcScale).
 * @property {number}   targetScale       Target scale factor (alias of tgtScale).
 * @property {number}   srcScale          Source scale factor.
 * @property {number}   tgtScale          Target scale factor.
 * @property {number}   derivedBaseTileW  Base/reference tile width derived from
 *                                        source tile + scale conversion.
 * @property {number}   derivedBaseTileH  Base/reference tile height derived from
 *                                        source tile + scale conversion.
 * @property {number}   baseTileW         Logical tile width.
 * @property {number}   baseTileH         Logical tile height.
 * @property {number}   effectiveTileW    Pixel tile width in source image.
 * @property {number}   effectiveTileH    Pixel tile height in source image.
 * @property {number}   imageW            Source image width.
 * @property {number}   imageH            Source image height.
 * @property {number}   rows              Number of tile rows.
 * @property {number}   cols              Number of tile columns.
 * @property {string}   edgePolicy        Edge handling policy.
 * @property {TileEntry[]} tiles          Individual tile entries.
 */

/**
 * @typedef {object} TileEntry
 * @property {number} row       0-based row index.
 * @property {number} col       0-based column index.
 * @property {number} x         Left pixel offset in source.
 * @property {number} y         Top pixel offset in source.
 * @property {number} actualW   Actual pixel width extracted.
 * @property {number} actualH   Actual pixel height extracted.
 * @property {string} filename  Output filename.
 */
