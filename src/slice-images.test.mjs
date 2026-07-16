/**
 * Tests for adaptive image slicing utilities (src/slice-images.mjs).
 *
 * Run with:
 *   node --test src/slice-images.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { effectiveTileSize, computeGrid, tileName, sliceImage, inferSourceTileSize } from './slice-images.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_WEBP = path.resolve(__dirname, '..', 'dist', 'icons.webp');
const HAS_FIXTURE = fs.existsSync(FIXTURE_WEBP);

// ---------------------------------------------------------------------------
// 1. Scale-based tile size calculation
// ---------------------------------------------------------------------------

test('effectiveTileSize: scale 1, target 1 → baseTile unchanged', () => {
  assert.equal(effectiveTileSize(64, 1, 1), 64);
});

test('effectiveTileSize: scale 2, target 1 → double tile', () => {
  assert.equal(effectiveTileSize(64, 2, 1), 128);
});

test('effectiveTileSize: scale 1, target 2 → half tile', () => {
  assert.equal(effectiveTileSize(64, 1, 2), 32);
});

test('effectiveTileSize: rounds correctly (scale 3, target 2)', () => {
  // round(64 * 3 / 2) = round(96) = 96
  assert.equal(effectiveTileSize(64, 3, 2), 96);
});

test('effectiveTileSize: rounds correctly (non-integer result)', () => {
  // round(64 * 1 / 3) = round(21.33…) = 21
  assert.equal(effectiveTileSize(64, 1, 3), 21);
});

test('effectiveTileSize: handles non-square base tiles', () => {
  assert.equal(effectiveTileSize(128, 2, 1), 256);
  assert.equal(effectiveTileSize(32, 1, 1), 32);
});

// ---------------------------------------------------------------------------
// 2. Row/col computation
// ---------------------------------------------------------------------------

test('computeGrid: exact fit (896 / 64 = 14 each)', () => {
  const { cols, rows } = computeGrid(896, 896, 64, 64);
  assert.equal(cols, 14);
  assert.equal(rows, 14);
});

test('computeGrid: partial column at right edge (ceil)', () => {
  // 100 / 64 = 1.5625 → ceil = 2
  const { cols } = computeGrid(100, 64, 64, 64);
  assert.equal(cols, 2);
});

test('computeGrid: partial row at bottom edge (ceil)', () => {
  const { rows } = computeGrid(64, 100, 64, 64);
  assert.equal(rows, 2);
});

test('computeGrid: single tile image', () => {
  const { cols, rows } = computeGrid(64, 64, 64, 64);
  assert.equal(cols, 1);
  assert.equal(rows, 1);
});

test('computeGrid: srcScale=2 reduces grid based on effective tile', () => {
  const tileW = effectiveTileSize(64, 2, 1);
  const { cols, rows } = computeGrid(1024, 1024, tileW, tileW);
  assert.equal(cols, 8);
  assert.equal(rows, 8);
});

test('inferSourceTileSize: infers 64px from 1024 sheet and icon grid', () => {
  const inferred = inferSourceTileSize({
    imageW: 1024,
    imageH: 1024,
    iconPositions: [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 128, y: 64 },
      { x: 960, y: 960 },
    ],
  });
  assert.equal(inferred.tileW, 64);
  assert.equal(inferred.tileH, 64);
});

// ---------------------------------------------------------------------------
// 3. Tile naming
// ---------------------------------------------------------------------------

test('tileName: produces correct pattern', () => {
  assert.equal(tileName('icons', 1, 0, 0), 'icons__s1__r0_c0.png');
  assert.equal(tileName('icons', 2, 3, 5), 'icons__s2__r3_c5.png');
  assert.equal(tileName('my-sheet', 1, 10, 14), 'my-sheet__s1__r10_c14.png');
});

// ---------------------------------------------------------------------------
// 4. sliceImage – manifest correctness and edge crop (integration)
// ---------------------------------------------------------------------------

if (HAS_FIXTURE) {
  test('sliceImage: manifest structure is correct (scale=1)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-test-'));
    try {
      const fixtureMeta = await sharp(FIXTURE_WEBP).metadata();
      const imageW = fixtureMeta.width;
      const imageH = fixtureMeta.height;
      const entry = await sliceImage({
        srcPath: FIXTURE_WEBP,
        outDir: tmpDir,
        baseName: 'icons',
        sourceImageId: 'icons',
        srcScale: 1,
        tgtScale: 1,
        baseTileW: 64,
        baseTileH: 64,
        derivedBaseTileW: 64,
        derivedBaseTileH: 64,
        edgePolicy: 'crop',
      });

      assert.equal(entry.sourceImageId, 'icons');
      assert.equal(entry.sourceScale, 1);
      assert.equal(entry.targetScale, 1);
      assert.equal(entry.srcScale, 1);
      assert.equal(entry.tgtScale, 1);
      assert.equal(entry.effectiveTileW, 64);
      assert.equal(entry.effectiveTileH, 64);
      assert.equal(entry.imageW, imageW);
      assert.equal(entry.imageH, imageH);
      assert.equal(entry.rows, Math.ceil(imageH / 64));
      assert.equal(entry.cols, Math.ceil(imageW / 64));
      assert.equal(entry.tiles.length, entry.rows * entry.cols);
      assert.equal(entry.edgePolicy, 'crop');

      // First tile
      const t0 = entry.tiles[0];
      assert.equal(t0.row, 0);
      assert.equal(t0.col, 0);
      assert.equal(t0.x, 0);
      assert.equal(t0.y, 0);
      assert.equal(t0.actualW, 64);
      assert.equal(t0.actualH, 64);
      assert.equal(t0.filename, 'icons__s1__r0_c0.png');

      // File was written
      assert.ok(fs.existsSync(path.join(tmpDir, 'icons__s1__r0_c0.png')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('sliceImage: scale=2 produces 7×7 grid with 128px tiles', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-test-scale2-'));
    try {
      const fixtureMeta = await sharp(FIXTURE_WEBP).metadata();
      const imageW = fixtureMeta.width;
      const imageH = fixtureMeta.height;
      const entry = await sliceImage({
        srcPath: FIXTURE_WEBP,
        outDir: tmpDir,
        baseName: 'icons',
        srcScale: 2,
        tgtScale: 1,
        baseTileW: 64,
        baseTileH: 64,
        edgePolicy: 'crop',
      });

      assert.equal(entry.effectiveTileW, 128);
      assert.equal(entry.effectiveTileH, 128);
      assert.equal(entry.rows, Math.ceil(imageH / 128));
      assert.equal(entry.cols, Math.ceil(imageW / 128));
      assert.equal(entry.tiles.length, entry.rows * entry.cols);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('sliceImage: edge tile has correct cropped dimensions (non-divisible size)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-test-edge-'));
    try {
      // Use 100px tile on fixture image and validate edge crop math dynamically.
      const fixtureMeta = await sharp(FIXTURE_WEBP).metadata();
      const imageW = fixtureMeta.width;
      const imageH = fixtureMeta.height;
      const entry = await sliceImage({
        srcPath: FIXTURE_WEBP,
        outDir: tmpDir,
        baseName: 'icons',
        srcScale: 1,
        tgtScale: 1,
        baseTileW: 100,
        baseTileH: 100,
        edgePolicy: 'crop',
      });

      assert.equal(entry.cols, Math.ceil(imageW / 100));
      assert.equal(entry.rows, Math.ceil(imageH / 100));

      // Last tile in first row
      const lastColTile = entry.tiles.find((t) => t.row === 0 && t.col === entry.cols - 1);
      assert.ok(lastColTile, 'should have a tile in last column');
      assert.equal(lastColTile.actualW, imageW - (entry.cols - 1) * 100);
      assert.equal(lastColTile.actualH, 100);

      // Last tile in last row
      const lastRowTile = entry.tiles.find((t) => t.row === entry.rows - 1 && t.col === 0);
      assert.ok(lastRowTile, 'should have a tile in last row');
      assert.equal(lastRowTile.actualW, 100);
      assert.equal(lastRowTile.actualH, imageH - (entry.rows - 1) * 100);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('sliceImage: pad policy extends edge tiles to full tile size', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-test-pad-'));
    try {
      const entry = await sliceImage({
        srcPath: FIXTURE_WEBP,
        outDir: tmpDir,
        baseName: 'icons',
        srcScale: 1,
        tgtScale: 1,
        baseTileW: 100,
        baseTileH: 100,
        edgePolicy: 'pad',
      });

      // All tiles are recorded with their actual (cropped) source dimensions
      const lastColTile = entry.tiles.find((t) => t.row === 0 && t.col === entry.cols - 1);
      assert.ok(lastColTile);
      assert.ok(lastColTile.actualW <= 100); // source area may be cropped at right edge

      // But the output PNG file should be 100x100 due to padding
      const { default: sharp } = await import('sharp');
      const outFile = path.join(tmpDir, lastColTile.filename);
      const meta = await sharp(outFile).metadata();
      assert.equal(meta.width, 100);
      assert.equal(meta.height, 100);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
} else {
  test('sliceImage integration tests: SKIPPED (dist/icons.webp not found)', () => {
    console.log('Skipping – dist/icons.webp not available in this environment.');
  });
}

// ---------------------------------------------------------------------------
// 5. Backward-compatibility smoke test (build script imports)
// ---------------------------------------------------------------------------

test('slice-images exports the required symbols', async () => {
  const mod = await import('./slice-images.mjs');
  assert.equal(typeof mod.effectiveTileSize, 'function');
  assert.equal(typeof mod.computeGrid, 'function');
  assert.equal(typeof mod.tileName, 'function');
  assert.equal(typeof mod.sliceImage, 'function');
});
