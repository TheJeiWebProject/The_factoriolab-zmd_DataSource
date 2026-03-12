import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = path.join('upstream', 'src', 'data', 'aef', 'data.json');
const DEFAULT_OUT_DIR = 'dist';
const DEFAULT_PACK_ID = 'aef';
const DEFAULT_GAME_ID = 'aef';
const DEFAULT_DISPLAY_NAME = 'Arknights:Endfield';

// Default values for machine properties when not specified
const DEFAULT_MACHINE_SPEED = 1;      // 1x speed
const DEFAULT_MACHINE_POWER = 100;    // 100 kW

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function namespacedItemId(id) {
  return `aef.vanilla.${id}`;
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function parseAmount(v) {
  if (isFiniteNumber(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const f = Number.parseFloat(v);
    if (Number.isFinite(f)) return f;
    return v;
  }
  return 1;
}

function toLiteItem(itemDef, detailPath) {
  const lite = { ...itemDef, detailPath };
  delete lite.wiki;
  delete lite.recipes;
  return lite;
}

function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      out.help = true;
      continue;
    }
    if (token === '--source' && argv[i + 1]) {
      out.source = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--out-dir' && argv[i + 1]) {
      out.outDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--pack-id' && argv[i + 1]) {
      out.packId = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--game-id' && argv[i + 1]) {
      out.gameId = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--display-name' && argv[i + 1]) {
      out.displayName = argv[i + 1];
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return out;
}

function writePagesServiceFiles(outDir, displayName, packId, version) {
  // Prevent GitHub Pages from excluding underscore-prefixed paths.
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');

  // Keep accidental runtime junk out of published artifacts.
  fs.writeFileSync(path.join(outDir, '.gitignore'), 'node_modules\n.DS_Store\nThumbs.db\n', 'utf8');

  // CORS headers for platforms supporting `_headers` (Cloudflare Pages / Netlify).
  const headersContent = `/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS
  Access-Control-Allow-Headers: *
`;
  fs.writeFileSync(path.join(outDir, '_headers'), headersContent, 'utf8');

  // CORS headers for Tencent EdgeOne Pages.
  writeJson(path.join(outDir, 'edgeone.json'), {
    headers: [
      {
        source: '/*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, HEAD, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: '*' },
        ],
      },
    ],
  });

  const generatedAt = new Date().toISOString();
  const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${displayName}</title>
  <style>
    body { font-family: sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #222; }
    h1 { margin-bottom: 0.5rem; }
    .meta { color: #666; margin-bottom: 1.5rem; }
    ul { padding-left: 1.2rem; }
    li { margin: 0.4rem 0; }
    a { color: #0b57d0; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>${displayName}</h1>
  <div class="meta">
    <div>Pack ID: ${packId}</div>
    <div>Version: ${version}</div>
    <div>Generated: ${generatedAt}</div>
  </div>
  <h2>Files</h2>
  <ul>
    <li><a href="manifest.json">manifest.json</a></li>
    <li><a href="items.json">items.json</a></li>
    <li><a href="itemsLite.json">itemsLite.json</a></li>
    <li><a href="tags.json">tags.json</a></li>
    <li><a href="recipeTypes.json">recipeTypes.json</a></li>
    <li><a href="recipes.json">recipes.json</a></li>
    <li><a href="source-meta.json">source-meta.json</a></li>
  </ul>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml, 'utf8');
}

function recipeProducers(r) {
  if (Array.isArray(r.producers) && r.producers.length) return r.producers;
  return ['unknown'];
}

function buildSlots(maxIn, maxOut, maxCat) {
  const slots = [];

  const inCols = Math.max(1, Math.min(3, maxIn || 1));
  for (let i = 0; i < maxIn; i += 1) {
    slots.push({
      slotId: `in${i + 1}`,
      io: 'input',
      accept: ['item', 'tag'],
      x: i % inCols,
      y: Math.floor(i / inCols),
      label: 'In',
    });
  }

  const outCols = Math.max(1, Math.min(2, maxOut || 1));
  const outX0 = inCols + 1;
  for (let i = 0; i < maxOut; i += 1) {
    slots.push({
      slotId: `out${i + 1}`,
      io: 'output',
      accept: ['item'],
      x: outX0 + (i % outCols),
      y: Math.floor(i / outCols),
      label: 'Out',
    });
  }

  const catCols = 3;
  const baseY = Math.max(Math.ceil(maxIn / inCols), Math.ceil(maxOut / outCols)) + 1;
  for (let i = 0; i < maxCat; i += 1) {
    slots.push({
      slotId: `cat${i + 1}`,
      io: 'catalyst',
      accept: ['item'],
      x: i % catCols,
      y: baseY + Math.floor(i / catCols),
      label: 'Machine',
    });
  }

  return slots;
}

function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.help) {
    console.log(`Usage:
  node src/build-aef-pack.mjs [options]

Options:
  --source <path>        Source data.json path (default: ${DEFAULT_SOURCE})
  --out-dir <path>       Output directory (default: ${DEFAULT_OUT_DIR})
  --pack-id <id>         Manifest packId (default: ${DEFAULT_PACK_ID})
  --game-id <id>         Manifest gameId (default: ${DEFAULT_GAME_ID})
  --display-name <name>  Manifest displayName (default: "${DEFAULT_DISPLAY_NAME}")
  --help, -h             Show help
`);
    return;
  }

  const source = path.resolve(repoRoot, cli.source ?? DEFAULT_SOURCE);
  const outDir = path.resolve(repoRoot, cli.outDir ?? DEFAULT_OUT_DIR);
  const packId = cli.packId ?? DEFAULT_PACK_ID;
  const gameId = cli.gameId ?? DEFAULT_GAME_ID;
  const displayName = cli.displayName ?? DEFAULT_DISPLAY_NAME;

  if (!fs.existsSync(source)) {
    throw new Error(`Source file not found: ${source}`);
  }

  const data = readJson(source);

  const version = data?.version?.['arknights-endfield'] ?? 'unknown';
  const iconsRaw = Array.isArray(data.icons) ? data.icons : [];
  const iconById = new Map(iconsRaw.map((ic) => [ic.id, ic]));
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const rawItemNameById = new Map(itemsRaw.map((it) => [it.id, it.name ?? it.id]));

  // Build a map of machine properties for reference
  const machinePropsById = new Map();
  for (const it of itemsRaw) {
    if (it.machine) {
      machinePropsById.set(it.id, {
        power: isFiniteNumber(it.machine.usage) ? it.machine.usage : DEFAULT_MACHINE_POWER,
        speed: isFiniteNumber(it.machine.speed) ? it.machine.speed : DEFAULT_MACHINE_SPEED,
        fuelValue: isFiniteNumber(it.fuelValue) ? it.fuelValue : null,
        moduleSlots: isFiniteNumber(it.moduleSlots) ? it.moduleSlots : 0,
        beaconSlots: isFiniteNumber(it.beaconSlots) ? it.beaconSlots : 0,
      });
    }
    if (it.fuel) {
      const existing = machinePropsById.get(it.id) || {};
      machinePropsById.set(it.id, {
        ...existing,
        fuelValue: isFiniteNumber(it.fuelValue) ? it.fuelValue : 100, // kJ per unit
        fuelCategory: it.fuelCategory || 'chemical',
      });
    }
  }

  const items = itemsRaw.map((it) => {
    const tags = [];
    if (it.category) tags.push(it.category);
    if (it.machine) tags.push('machine');
    if (it.belt) tags.push('belt');
    if (it.pipe) tags.push('pipe');
    if (it.module) tags.push('module');
    if (it.fuel) tags.push('fuel');
    if (it.technology) tags.push('technology');

    const iconId = it.icon ?? it.id ?? 'missing-icon';
    const icon = iconById.get(iconId) ?? iconById.get('missing-icon');

    // Add machine/fuel properties to item data for planner calculations
    const extraData = {};
    if (it.machine) {
      const props = machinePropsById.get(it.id) || {};
      extraData.machine = {
        power: props.power || DEFAULT_MACHINE_POWER,
        speed: props.speed || DEFAULT_MACHINE_SPEED,
        moduleSlots: props.moduleSlots || 0,
        beaconSlots: props.beaconSlots || 0,
      };
    }
    if (it.fuel) {
      const props = machinePropsById.get(it.id) || {};
      extraData.fuel = {
        fuelValue: props.fuelValue || 100,
        fuelCategory: props.fuelCategory || 'chemical',
      };
    }
    if (it.module) {
      extraData.module = {
        speedBonus: isFiniteNumber(it.speedBonus) ? it.speedBonus : 0,
        productivityBonus: isFiniteNumber(it.productivityBonus) ? it.productivityBonus : 0,
        consumptionBonus: isFiniteNumber(it.consumptionBonus) ? it.consumptionBonus : 0,
        pollutionBonus: isFiniteNumber(it.pollutionBonus) ? it.pollutionBonus : 0,
      };
    }
    if (it.beacon) {
      extraData.beacon = {
        effectivity: isFiniteNumber(it.effectivity) ? it.effectivity : 0.5,
        range: isFiniteNumber(it.range) ? it.range : 3,
        moduleSlots: isFiniteNumber(it.moduleSlots) ? it.moduleSlots : 2,
      };
    }
    if (it.belt) {
      extraData.belt = {
        speed: isFiniteNumber(it.beltSpeed) ? it.beltSpeed : 0.5, // items per second
      };
    }

    return {
      key: { id: namespacedItemId(it.id) },
      name: it.name ?? it.id,
      ...(icon
        ? {
          iconSprite: {
            url: '/packs/aef/icons.webp',
            position: icon.position ?? '0px 0px',
            ...(icon.color ? { color: icon.color } : {}),
            size: 64,
          },
        }
        : {}),
      ...(tags.length ? { tags } : {}),
      ...extraData,
    };
  });

  const itemsLite = items
    .map((item, index) => toLiteItem(item, `items.json#${index}`))
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

  const recipesRaw = Array.isArray(data.recipes) ? data.recipes : [];

  const maxByMachine = new Map();
  for (const r of recipesRaw) {
    const inCount = Object.keys(r.in ?? {}).length;
    const outCount = Object.keys(r.out ?? {}).length;
    const catCount = Object.keys(r.catalyst ?? {}).length;
    for (const producerId of recipeProducers(r)) {
      const cur = maxByMachine.get(producerId) ?? { in: 0, out: 0, cat: 0 };
      cur.in = Math.max(cur.in, inCount);
      cur.out = Math.max(cur.out, outCount);
      cur.cat = Math.max(cur.cat, catCount);
      maxByMachine.set(producerId, cur);
    }
  }

  const recipeTypes = Array.from(maxByMachine.entries()).map(([producerId, max]) => {
    const displayName =
      producerId === 'unknown'
        ? 'Unknown'
        : rawItemNameById.get(producerId) ??
        categoryNameById.get(producerId) ??
        producerId;

    // Get machine properties from the items data
    const machineProps = machinePropsById.get(producerId);

    const machineDef = {
      id: namespacedItemId(producerId),
      name: displayName,
    };

    // Add machine calculation properties
    const defaults = {};
    if (producerId !== 'unknown' && machineProps) {
      defaults.power = machineProps.power || DEFAULT_MACHINE_POWER;
      defaults.speed = machineProps.speed || DEFAULT_MACHINE_SPEED;
      defaults.moduleSlots = machineProps.moduleSlots || 0;
      defaults.beaconSlots = machineProps.beaconSlots || 0;
    }

    return {
      key: `aef:machine/${producerId}`,
      displayName,
      renderer: 'slot_layout',
      ...(producerId !== 'unknown'
        ? { machine: machineDef }
        : {}),
      slots: buildSlots(max.in, max.out, max.cat),
      paramSchema: {
        time: { displayName: 'Time', unit: 's', format: 'duration' },
        usage: { displayName: 'Usage' },
        cost: { displayName: 'Cost' },
      },
      ...(Object.keys(defaults).length ? { defaults } : {}),
    };
  });

  recipeTypes.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const recipes = [];
  for (const r of recipesRaw) {
    const baseSlotContents = {};

    const ins = Object.entries(r.in ?? {}).sort(([a], [b]) => a.localeCompare(b));
    ins.forEach(([id, amt], idx) => {
      baseSlotContents[`in${idx + 1}`] = { kind: 'item', id: namespacedItemId(id), amount: parseAmount(amt) };
    });

    const outs = Object.entries(r.out ?? {}).sort(([a], [b]) => a.localeCompare(b));
    outs.forEach(([id, amt], idx) => {
      baseSlotContents[`out${idx + 1}`] = { kind: 'item', id: namespacedItemId(id), amount: parseAmount(amt) };
    });

    const cats = Object.entries(r.catalyst ?? {}).map(([id, amt]) => ({ id, amt }));
    const catalystSlotContents = {};
    cats
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach(({ id, amt }, idx) => {
        catalystSlotContents[`cat${idx + 1}`] = {
          kind: 'item',
          id: namespacedItemId(id),
          amount: parseAmount(amt),
        };
      });

    const params = {};
    if (r.time !== undefined) params.time = parseAmount(r.time);
    if (r.usage !== undefined) params.usage = parseAmount(r.usage);
    if (r.cost !== undefined) params.cost = parseAmount(r.cost);

    for (const producerId of recipeProducers(r)) {
      const slotContents = { ...baseSlotContents, ...catalystSlotContents };
      recipes.push({
        id: `aef:${r.id}@${producerId}`,
        type: `aef:machine/${producerId}`,
        slotContents,
        ...(Object.keys(params).length ? { params } : {}),
      });
    }
  }

  const tagValuesByTagId = new Map();
  for (const it of itemsRaw) {
    if (!it.category) continue;
    const tagId = `aef:${it.category}`;
    const list = tagValuesByTagId.get(tagId) ?? [];
    list.push(namespacedItemId(it.id));
    tagValuesByTagId.set(tagId, list);
  }
  const tags = { item: {} };
  for (const [tagId, values] of tagValuesByTagId.entries()) {
    values.sort();
    tags.item[tagId] = { values };
  }

  ensureDir(outDir);
  const iconSheetSrc = path.resolve(path.dirname(source), 'icons.webp');
  const iconSheetDst = path.join(outDir, 'icons.webp');
  if (fs.existsSync(iconSheetSrc)) {
    fs.copyFileSync(iconSheetSrc, iconSheetDst);
  }

  writeJson(path.join(outDir, 'manifest.json'), {
    packId,
    gameId,
    displayName,
    version,
    files: {
      items: 'items.json',
      itemsLite: 'itemsLite.json',
      tags: 'tags.json',
      recipeTypes: 'recipeTypes.json',
      recipes: 'recipes.json',
    },
    planner: {
      targetRatePresets: {
        halfPerMinute: 3,
        fullPerMinute: 6,
      },
    },
    startupDialog: {
      id: 'aef-item-id-notice-v1',
      title: '重要说明',
      message: '请注意：本工具中显示的物品 ID（如 endfield.xxx）仅供本站内部索引与配方关联使用，并非游戏内的真实物品 ID。请勿将其作为游戏内控制台代码或其他修改工具的参考依据。\n\n此数据包内容较少，若想查看更多内容请使用 “Arknights:Endfield Skland Wiki” 数据包。',
      confirmText: '我知道了',
    },
  });

  writeJson(path.join(outDir, 'items.json'), items);
  writeJson(path.join(outDir, 'itemsLite.json'), itemsLite);
  writeJson(path.join(outDir, 'recipeTypes.json'), recipeTypes);
  writeJson(path.join(outDir, 'recipes.json'), recipes);
  writeJson(path.join(outDir, 'tags.json'), tags);
  writeJson(path.join(outDir, 'source-meta.json'), {
    sourceRepository: 'https://github.com/endfield-calc/factoriolab/tree/ark-endfield-3rd-test',
    sourceRelativePath: 'src/data/aef/data.json',
    sourceAbsolutePath: source,
    upstreamCommit: process.env.UPSTREAM_COMMIT ?? null,
    generatedAt: new Date().toISOString(),
  });
  writePagesServiceFiles(outDir, displayName, packId, version);

  console.log(`Wrote AEF pack to ${outDir}`);
}

main();
