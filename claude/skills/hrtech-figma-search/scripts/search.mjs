#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { readIndex } from './index-io.mjs';
import { DEFAULT_TEAM_ID, resolveCatalogPath, discoveryHint } from './catalog-path.mjs';

const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е');
const tokensOf = value => [...new Set(normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [])];
const displayPath = value => Array.isArray(value)
  ? value.map(part => typeof part === 'object' ? part.name ?? part.id ?? '' : part).join(' / ')
  : String(value ?? '');

function usage() {
  return `Поиск по локальному каталогу Figma HR Tech
node search.mjs [--catalog PATH] "запрос" [--limit N] [--type TYPE] [--file FILTER] [--json]

--type: FILE, CANVAS, SECTION, FRAME, TEXT, COMPONENT и другие типы Figma; можно через запятую.
--file: часть названия, ключа или пути файла. По умолчанию выводится 12 результатов.
Несколько слов ищутся вместе; если совпадений нет, поиск по отдельным словам отмечается явно.
Каталог: --catalog PATH → BULOCHKA_FIGMA_CATALOG → ~/.hrtech/figma-catalog.json →
~/.hrtech/figma-catalog/${DEFAULT_TEAM_ID}/catalog.json.
Первый запуск: scripts/scan.mjs discover (Node: references/runtime.md).`;
}

function parseArgs(argv) {
  const options = { catalog: undefined, limit: 12, query: [], json: false, types: null, file: '' };
  const values = new Map([['--catalog', 'catalog'], ['--limit', 'limit'], ['--type', 'types'], ['--file', 'file']]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--') { options.query.push(...argv.slice(i + 1)); break; }
    if (values.has(arg)) {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`Не задано значение ${arg}`);
      options[values.get(arg)] = argv[++i];
    } else if (arg.startsWith('--')) throw new Error(`Неизвестный параметр ${arg}`);
    else options.query.push(arg);
  }
  options.query = options.query.join(' ').trim();
  if (!tokensOf(options.query).length) throw new Error('Укажите непустой поисковый запрос');
  options.limit = Number(options.limit);
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 200) throw new Error('--limit должен быть целым числом от 1 до 200');
  options.types = options.types ? new Set(options.types.toUpperCase().split(',').map(x => x.trim()).filter(Boolean)) : null;
  return options;
}

function snippet(value, terms, max = 210) {
  const text = String(value ?? '').replace(/\s+/gu, ' ').trim();
  if (text.length <= max) return text;
  const folded = normalize(text);
  const indexes = terms.map(term => folded.indexOf(term)).filter(index => index >= 0);
  const first = indexes.length ? Math.min(...indexes) : 0;
  const start = Math.max(0, first - 55);
  return `${start ? '…' : ''}${text.slice(start, start + max)}${start + max < text.length ? '…' : ''}`;
}

function rankCandidate(candidate, query, terms) {
  const weights = { name: 90, text: 18, page: 30, path: 20, file: 12, folder: 6 };
  const fields = Object.entries(candidate.fields).map(([key, value]) => [key, normalize(value)]);
  const matchedTerms = terms.filter(term => fields.some(([, value]) => value.includes(term)));
  if (!matchedTerms.length) return null;
  let score = matchedTerms.length * 120;
  const matchedFields = [];
  for (const [key, value] of fields) {
    const matches = terms.filter(term => value.includes(term)).length;
    if (!matches) continue;
    matchedFields.push(key);
    score += matches * weights[key];
    if (value.includes(query)) score += weights[key] * 1.5;
    if (value === query) score += weights[key] * 2;
  }
  // A name match on a navigable object outranks its repeated copy in body text.
  if (matchedFields.includes('name')) score += ({ FILE: 80, CANVAS: 70, SECTION: 60, FRAME: 50, COMPONENT_SET: 45, COMPONENT: 40 })[candidate.type] ?? 0;
  if (candidate.visible === false) score -= 3;
  const { fields: omitted, ...result } = candidate;
  return { ...result, score, matchedTerms, matchedFields, excerpt: snippet(candidate.fields.text, terms) };
}

const collator = new Intl.Collator('ru');
const compareHits = (a, b) => b.score - a.score
  || collator.compare(String(a.fileName), String(b.fileName))
  || collator.compare(String(a.id), String(b.id));

class TopHits {
  constructor(limit) { this.limit = limit; this.items = []; }
  add(hit) {
    if (this.items.length === this.limit && compareHits(hit, this.items.at(-1)) >= 0) return;
    let low = 0; let high = this.items.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compareHits(hit, this.items[middle]) < 0) high = middle;
      else low = middle + 1;
    }
    this.items.splice(low, 0, hit);
    if (this.items.length > this.limit) this.items.pop();
  }
}

function resultBucket(limit) {
  return { count: 0, primary: new TopHits(limit), overflow: new TopHits(limit) };
}

function mergeFileHits(bucket, fileHits, diverse) {
  for (const [index, hit] of fileHits.items.entries()) {
    (diverse && index >= 3 ? bucket.overflow : bucket.primary).add(hit);
  }
}

async function search(options) {
  let catalog;
  try { catalog = JSON.parse(await fs.readFile(options.catalog, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Локальный каталог ещё не создан: ${options.catalog}\n${discoveryHint(options.catalog)}`);
    throw error;
  }
  if (!Array.isArray(catalog.files)) throw new Error('Неверный каталог: поле files должно быть массивом');
  const terms = tokensOf(options.query);
  const query = normalize(options.query);
  const filterTerms = tokensOf(options.file);
  const warnings = [];
  const andBucket = resultBucket(options.limit);
  const orBucket = resultBucket(options.limit);
  const seenFiles = new Set();
  let indexesRead = 0;
  let filesSearched = 0;
  let filesWithIndex = 0;
  const catalogDir = path.dirname(options.catalog);
  for (const file of catalog.files) {
    if (seenFiles.has(file.key)) continue;
    seenFiles.add(file.key);
    if (file.indexPath) filesWithIndex += 1;
    const folder = displayPath(file.folderPath ?? catalog.folders?.find(x => String(x.id) === String(file.folderId))?.path);
    const fileHaystack = normalize(`${file.key} ${file.name} ${folder}`);
    if (filterTerms.length && !filterTerms.every(term => fileHaystack.includes(term))) continue;
    filesSearched += 1;
    // Keep deduplication and top hits local to this file; corpus size does not
    // determine retained search memory. JSON loading is still per index file.
    const seen = new Set();
    const fileAnd = new TopHits(options.limit);
    const fileOr = new TopHits(options.limit);
    const add = candidate => {
      if (options.types && !options.types.has(candidate.type)) return;
      const key = `${candidate.id ?? 'FILE'}:${candidate.type}`;
      if (seen.has(key)) return;
      seen.add(key);
      const ranked = rankCandidate(candidate, query, terms);
      if (!ranked) return;
      if (ranked.matchedTerms.length === terms.length) {
        andBucket.count += 1;
        fileAnd.add(ranked);
      } else {
        orBucket.count += 1;
        fileOr.add(ranked);
      }
    };
    const fileUrl = file.url ?? `https://www.figma.com/design/${encodeURIComponent(file.key)}`;
    const base = {
      fileKey: file.key, fileName: file.name, folderPath: folder,
      parentKey: file.parentKey ?? null,
      scanDepth: file.depth ?? null, limitedReason: file.limitedReason ?? null,
      scanStatus: file.scanStatus ?? 'unknown', lastModified: file.lastModified ?? null,
    };
    add({ ...base, id: null, type: 'FILE', name: file.name, pageName: null, path: folder, url: fileUrl,
      fields: { name: file.name, text: '', page: '', path: '', file: '', folder } });
    if (file.indexPath) try {
      const indexPath = path.resolve(catalogDir, file.indexPath);
      const relative = path.relative(catalogDir, indexPath);
      if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('indexPath выходит за пределы каталога');
      const index = await readIndex(indexPath);
      if (index.key != null && String(index.key) !== String(file.key)) throw new Error('ключ индекса не совпадает с ключом файла');
      if (!Array.isArray(index.records)) throw new Error('нет массива records');
      indexesRead += 1;
      for (const node of index.records) {
        const nodePath = displayPath(node.path);
        add({ ...base, id: node.id, type: node.type ?? 'UNKNOWN', name: node.name ?? '',
          pageName: node.pageName ?? '', path: nodePath, visible: node.visible,
          indexedAt: index.pageScannedAt?.[node.pageId] ?? index.baseScannedAt ?? index.scannedAt ?? null, indexDepth: index.pageDepths?.[node.pageId] ?? index.depth ?? null,
          stale: index.stalePageIds?.includes(node.pageId) ?? (!!index.staleOtherPages && index.pageDepths?.[node.pageId] !== 0),
          url: node.url ?? `${fileUrl.split('?')[0]}?node-id=${encodeURIComponent(String(node.id).replace(/:/g, '-'))}`,
          fields: { name: node.name, text: node.text, page: node.pageName, path: nodePath, file: file.name, folder } });
      }
    } catch (error) {
      warnings.push({ fileKey: file.key, message: `Индекс недоступен: ${error.message}` });
    }
    mergeFileHits(andBucket, fileAnd, !options.file);
    mergeFileHits(orBucket, fileOr, !options.file);
  }
  const mode = andBucket.count || !orBucket.count ? 'AND' : 'OR_FALLBACK';
  const bucket = mode === 'AND' ? andBucket : orBucket;
  const results = [...bucket.primary.items, ...bucket.overflow.items.slice(0, options.limit - bucket.primary.items.length)];
  return {
    query: options.query, mode, catalog: options.catalog, teamId: catalog.teamId,
    teamName: catalog.teamName, scannedAt: catalog.scannedAt, coverage: catalog.coverage ?? null,
    scope: { totalFiles: catalog.files.length, filesWithIndex, filesSearched, indexesRead, unreadableIndexes: warnings.length },
    totalMatches: bucket.count, results, warnings,
    ...(catalog.files.length ? {} : { nextStep: discoveryHint(options.catalog) }),
  };
}

function printText(report) {
  console.log(`Каталог: ${report.teamName ?? report.teamId ?? 'Figma'} · ${report.scannedAt ?? 'дата неизвестна'}`);
  console.log(`Файлов: ${report.scope.totalFiles}; с индексом: ${report.scope.filesWithIndex}; поиск: ${report.scope.filesSearched} файлов, ${report.scope.indexesRead} индексов.`);
  if (report.coverage != null) console.log(`Покрытие: ${typeof report.coverage === 'string' ? report.coverage : JSON.stringify(report.coverage)}`);
  if (report.mode === 'OR_FALLBACK') console.log('Совпадений со всеми словами нет. Ниже результаты по отдельным словам (OR).');
  console.log(`Найдено: ${report.totalMatches}; показано: ${report.results.length}.`);
  if (report.nextStep) console.log(report.nextStep);
  for (const [i, hit] of report.results.entries()) {
    console.log(`\n${i + 1}. [${hit.type}] ${hit.name}${hit.visible === false ? ' [скрытый слой]' : ''}`);
    console.log(`   ${[hit.folderPath, hit.fileName, hit.pageName, hit.path].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(' → ')}`);
    console.log(`   ${hit.url}`);
    if (hit.parentKey) console.log(`   Ветка файла: https://www.figma.com/design/${encodeURIComponent(hit.parentKey)}`);
    console.log(`   Совпало: ${hit.matchedTerms.join(', ')}; поля: ${hit.matchedFields.join(', ')}; скан: ${hit.scanStatus}; глубина: ${hit.indexDepth ?? hit.scanDepth ?? 'не читалось'}.`);
    if(hit.stale) console.log('   Страница из прежней версии файла; требуется обновление.');
    if(hit.limitedReason) console.log(`   Ограничение: ${hit.limitedReason}`);
    if (hit.excerpt) console.log(`   ${hit.excerpt}`);
  }
  for (const warning of report.warnings) console.error(`Предупреждение ${warning.fileKey}: ${warning.message}`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) console.log(usage());
  else {
    options.catalog = await resolveCatalogPath({ catalog: options.catalog });
    const report = await search(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printText(report);
  }
} catch (error) {
  console.error(`Ошибка поиска: ${error.message}`);
  process.exitCode = 1;
}
