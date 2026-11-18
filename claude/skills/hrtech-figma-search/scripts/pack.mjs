#!/usr/bin/env node
// Publish a local, immutable snapshot of an existing catalog; no network access.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readIndex, writePackedIndex } from './index-io.mjs';

function argumentsOf(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!['--source', '--destination'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
    options[arg.slice(2)] = path.resolve(argv[++i]);
  }
  if (!options.source || !options.destination) throw new Error('Use --source PATH/catalog.json --destination PATH/catalog.json');
  if (options.source === options.destination) throw new Error('Source and destination catalogs must differ');
  return options;
}

function resolveIndex(directory, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) throw new Error('Invalid indexPath');
  const resolved = path.resolve(directory, relativePath);
  const relative = path.relative(directory, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Index path escapes catalog directory: ${relativePath}`);
  return resolved;
}

async function pack(options) {
  // Read this once: catalog membership and metadata belong to a single snapshot.
  const catalog = JSON.parse(await fs.readFile(options.source, 'utf8'));
  if (!Array.isArray(catalog.files)) throw new Error('Catalog must contain a files array');
  const destinationDir = path.dirname(options.destination);
  const sourceDir = path.dirname(options.source);
  await fs.mkdir(path.join(destinationDir, 'indexes'), { recursive: true });
  const generationDir = await fs.mkdtemp(path.join(destinationDir, 'indexes', 'packed-'));
  const temporaryCatalog = `${options.destination}.${randomUUID()}.tmp`;
  let published = false;
  let originalBytes = 0; let packedBytes = 0; let logicalBytes = 0; let filesPacked = 0;
  const packedByKey = new Map();
  try {
    for (const file of catalog.files) {
      if (!file.indexPath) continue;
      if (!/^[A-Za-z0-9]+$/.test(file.key ?? '')) throw new Error(`Invalid file key: ${file.key}`);
      const sourcePath = resolveIndex(sourceDir, file.indexPath);
      const existing = packedByKey.get(file.key);
      if (existing) {
        if (existing.sourcePath !== sourcePath) throw new Error(`Conflicting indexes for file ${file.key}`);
        file.indexPath = existing.relativePath;
        continue;
      }
      const index = await readIndex(sourcePath);
      if (index.key != null && String(index.key) !== String(file.key)) throw new Error(`Index key mismatch for ${file.key}`);
      // If a live scan replaced an index after the catalog snapshot, retry later.
      // A stale index is legitimate and keeps the catalog's explicit stale status.
      if (file.scannedAt && index.scannedAt && file.scannedAt !== index.scannedAt) {
        throw new Error(`Source changed during packing: ${file.key}. Retry after the scan saves its catalog.`);
      }
      const outputPath = path.join(generationDir, `${file.key}.json`);
      const bytes = await writePackedIndex(outputPath, index);
      const relativePath = path.relative(destinationDir, outputPath).split(path.sep).join('/');
      packedByKey.set(file.key, { sourcePath, relativePath });
      file.indexPath = relativePath;
      originalBytes += (await fs.stat(sourcePath)).size;
      logicalBytes += bytes.originalBytes;
      packedBytes += bytes.packedBytes;
      filesPacked += 1;
    }
    catalog.packaging = {
      format: 'bulochka-figma-index-gzip-v1', packedAt: new Date().toISOString(),
      filesPacked, originalBytes, logicalBytes, packedBytes,
    };
    await fs.writeFile(temporaryCatalog, JSON.stringify(catalog, null, 2) + '\n');
    // Old destination catalogs keep referring to their old generation until here.
    await fs.rename(temporaryCatalog, options.destination);
    published = true;
    return { source: options.source, destination: options.destination, ...catalog.packaging };
  } finally {
    if (!published) {
      await fs.rm(temporaryCatalog, { force: true }).catch(() => {});
      await fs.rm(generationDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

try {
  const options = argumentsOf(process.argv.slice(2));
  if (options.help) console.log('node pack.mjs --source PATH/catalog.json --destination PATH/catalog.json\nPacks local indexes and atomically publishes a catalog snapshot. No network access.');
  else console.log(JSON.stringify(await pack(options), null, 2));
} catch (error) {
  console.error(`Packing failed: ${error.message}`);
  process.exitCode = 1;
}
