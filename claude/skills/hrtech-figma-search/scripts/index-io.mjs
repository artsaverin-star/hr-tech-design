import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const format = 'bulochka-figma-index-gzip-v1';

function validateIndex(index, source) {
  if (!index || typeof index !== 'object' || !Array.isArray(index.records)) {
    throw new Error(`Invalid Figma index at ${source}: expected records array`);
  }
  return index;
}

/** Read either an ordinary index JSON or its portable gzip/base64 envelope. */
export async function readIndex(indexPath) {
  const document = JSON.parse(await fs.readFile(indexPath, 'utf8'));
  if (document?.format === format) {
    if (typeof document.data !== 'string' || !document.data.length || !/^[A-Za-z0-9+/]*={0,2}$/.test(document.data)) {
      throw new Error(`Invalid packed Figma index at ${indexPath}: malformed base64 data`);
    }
    const json = gunzipSync(Buffer.from(document.data, 'base64')).toString('utf8');
    return validateIndex(JSON.parse(json), indexPath);
  }
  if (document?.format?.startsWith?.('bulochka-figma-index-')) {
    throw new Error(`Unsupported Figma index format: ${document.format}`);
  }
  return validateIndex(document, indexPath);
}

/** Atomically write an index envelope. No existing index is changed on failure. */
export async function writePackedIndex(indexPath, index) {
  validateIndex(index, indexPath);
  const json = JSON.stringify(index);
  const originalBytes = Buffer.byteLength(json);
  const compressed = gzipSync(json, { level: 6 });
  const envelope = JSON.stringify({ format, data: compressed.toString('base64') }) + '\n';
  const temporary = `${indexPath}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  try {
    await fs.writeFile(temporary, envelope);
    await fs.rename(temporary, indexPath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return { originalBytes, packedBytes: Buffer.byteLength(envelope), gzipBytes: compressed.length };
}
