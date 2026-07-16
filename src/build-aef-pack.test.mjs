import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

function createFixtureSource(tmpRoot) {
  const srcDir = path.join(tmpRoot, 'src');
  const outDir = path.join(tmpRoot, 'out');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const fixture = {
    version: { 'arknights-endfield': 'fixture' },
    iconScale: 2,
    icons: [
      { id: 'item-a', position: '0px 0px' },
      { id: 'item-b', position: '-64px 0px' },
      { id: 'missing-icon', position: '-128px 0px' },
    ],
    items: [
      { id: 'item-a', name: 'A', icon: 'item-a' },
      { id: 'item-b', name: 'B', icon: 'item-b' },
    ],
    recipes: [],
    categories: [],
  };

  fs.writeFileSync(path.join(srcDir, 'data.json'), JSON.stringify(fixture), 'utf8');
  return { srcDir, outDir };
}

async function createFixtureImage(srcDir) {
  // 192x64 with 64px source tiles -> derived logical tile is 32 when srcScale=2,target=1
  const image = sharp({
    create: {
      width: 192,
      height: 64,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  await image.webp().toFile(path.join(srcDir, 'icons.webp'));
}

function runBuild({ sourcePath, outDir, adaptiveSplit }) {
  const args = [
    'src/build-aef-pack.mjs',
    '--source', sourcePath,
    '--out-dir', outDir,
    '--target-scale', '1',
  ];
  args.push(adaptiveSplit ? '--adaptive-split' : '--no-adaptive-split');
  const run = spawnSync('node', args, { encoding: 'utf8' });
  assert.equal(run.status, 0, `build failed: ${run.stderr || run.stdout}`);
}

test('build-aef-pack: adaptive split writes manifest and item tile references', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'build-aef-pack-split-'));
  try {
    const { srcDir, outDir } = createFixtureSource(tmpRoot);
    await createFixtureImage(srcDir);

    runBuild({
      sourcePath: path.join(srcDir, 'data.json'),
      outDir,
      adaptiveSplit: true,
    });

    const manifestPath = path.join(outDir, 'image-slice-manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest should exist when split is enabled');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.sourceImageId, 'icons');
    assert.equal(manifest.sourceScale, 2);
    assert.equal(manifest.targetScale, 1);
    assert.equal(manifest.imageW, 192);
    assert.equal(manifest.imageH, 64);
    assert.equal(manifest.effectiveTileW, 64);
    assert.equal(manifest.effectiveTileH, 64);
    assert.equal(manifest.derivedBaseTileW, 32);
    assert.equal(manifest.derivedBaseTileH, 32);
    assert.equal(manifest.cols, 3);
    assert.equal(manifest.rows, 1);
    assert.equal(manifest.tiles.length, 3);
    assert.ok(fs.existsSync(path.join(outDir, 'tiles', manifest.tiles[0].filename)));

    const items = JSON.parse(fs.readFileSync(path.join(outDir, 'items.json'), 'utf8'));
    assert.ok(items.every((item) => item.iconSprite.url.startsWith('tiles/')));
    assert.ok(items.every((item) => item.iconSprite.size === 32));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('build-aef-pack: split disabled keeps icons.webp references', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'build-aef-pack-nosplit-'));
  try {
    const { srcDir, outDir } = createFixtureSource(tmpRoot);
    await createFixtureImage(srcDir);

    runBuild({
      sourcePath: path.join(srcDir, 'data.json'),
      outDir,
      adaptiveSplit: false,
    });

    assert.ok(!fs.existsSync(path.join(outDir, 'image-slice-manifest.json')));
    const items = JSON.parse(fs.readFileSync(path.join(outDir, 'items.json'), 'utf8'));
    assert.ok(items.every((item) => item.iconSprite.url === 'icons.webp'));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
