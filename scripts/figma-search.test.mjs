import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scanner = path.join(root, 'claude/skills/hrtech-figma-search/scripts/scan.mjs');
const scratch = path.join(root, 'hrtech-figma-catalog/testing');
const teamId = '978907722219265370';
const firstModified = '2026-01-01T10:00:00Z';
const nextModified = '2026-01-02T10:00:00Z';

// Every request is intercepted in a separate Node process. There is no network
// fallback; an unlisted request fails the command and is recorded for assertions.
const fetchStub = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
const routes = JSON.parse(fs.readFileSync(process.env.FIGMA_TEST_ROUTES, 'utf8'));
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const endpoint = url.pathname + url.search;
  fs.appendFileSync(process.env.FIGMA_TEST_REQUESTS, JSON.stringify({ origin: url.origin, endpoint, method: options.method || 'GET' }) + '\\n');
  assert.equal(url.origin, 'https://api.figma.com');
  assert.equal(options.method || 'GET', 'GET');
  assert.equal(new Headers(options.headers).get('X-Figma-Token'), 'fixture-only');
  const configured = routes[endpoint];
  const route = Array.isArray(configured) ? configured.shift() : configured;
  assert.ok(route, 'Unexpected fixture request: ' + endpoint);
  return new Response(JSON.stringify(route.body), { status: route.status || 200, headers: route.headers || {} });
};
`;

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function fixture(t) {
  fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, 'scanner-offline-'));
  const home = path.join(dir, 'home');
  fs.mkdirSync(home);
  const stub = path.join(dir, 'fetch-stub.mjs');
  fs.writeFileSync(stub, fetchStub);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, home, stub, catalogPath: path.join(dir, 'catalog.json'), runCount: 0 };
}

function run(f, command, routes, args = []) {
  const number = ++f.runCount;
  const routesPath = path.join(f.dir, `routes-${number}.json`);
  const requestsPath = path.join(f.dir, `requests-${number}.jsonl`);
  writeJSON(routesPath, routes);
  const result = spawnSync(process.execPath, [
    '--import', pathToFileURL(f.stub).href, scanner, command,
    '--catalog', f.catalogPath, '--team', teamId, '--interval-ms', '0', ...args,
  ], {
    cwd: f.dir,
    env: { ...process.env, HOME: f.home, FIGMA_ACCESS_TOKEN: 'fixture-only', NODE_OPTIONS: '', FIGMA_TEST_ROUTES: routesPath, FIGMA_TEST_REQUESTS: requestsPath },
    encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  const requests = fs.existsSync(requestsPath)
    ? fs.readFileSync(requestsPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    : [];
  return { ...result, requests, endpoints: requests.map(request => request.endpoint) };
}

function ok(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

function catalog(f) {
  return JSON.parse(fs.readFileSync(f.catalogPath, 'utf8'));
}

function entry(key, overrides = {}) {
  return {
    key, name: key, folderId: 'A', folderPath: 'Встречи',
    url: `https://www.figma.com/design/${key}`, lastModified: firstModified,
    parentKey: null, scanStatus: 'metadata', ...overrides,
  };
}

function seed(f, files) {
  writeJSON(f.catalogPath, { schemaVersion: 1, teamId, teamName: 'HR Tech', folders: [], files, errors: [], inventoryComplete: true });
}

function discoveryRoutes() {
  return {
    [`/v2/teams/${teamId}/folders`]: { body: { name: 'HR Tech', folders: [{ id: 'A', name: 'Встречи' }] } },
    '/v2/folders/A/folders': { body: { folders: [{ id: 'B', name: 'Доступ', parent_folder_id: 'A' }] } },
    '/v2/folders/A/files?branch_data=true': { body: { files: [{ key: 'Main', name: 'Встречи · Сценарии', last_modified: firstModified, branches: [{ key: 'Branch', name: 'Отзыв доступа', last_modified: firstModified }] }] } },
    '/v2/folders/B/folders': { body: { folders: [] } },
    '/v2/folders/B/files?branch_data=true': { body: { files: [{ key: 'Nested', name: 'Запрос доступа', last_modified: firstModified }] } },
  };
}

function fileResponse(key) {
  return { body: { name: key, version: 'fixture-version', lastModified: firstModified, document: {
    id: '0:0', name: 'Document', type: 'DOCUMENT', children: [{
      id: '0:1', name: 'Доступ', type: 'CANVAS', children: [{
        id: '1:1', name: 'Отказ', type: 'FRAME', visible: false, children: [{
          id: '1:2', name: 'Причина', type: 'TEXT', characters: 'В доступе отказано',
        }],
      }],
    }],
  } } };
}

test('discover traverses nested folders and includes branch provenance', t => {
  const f = fixture(t);
  const routes = discoveryRoutes();
  const result = run(f, 'discover', routes);
  ok(result);
  assert.deepEqual(result.endpoints, Object.keys(routes));
  const found = catalog(f);
  assert.equal(found.teamName, 'HR Tech');
  assert.equal(found.inventoryComplete, true);
  assert.deepEqual(found.folders.map(folder => [folder.id, folder.path, folder.parentId, folder.status]), [
    ['A', 'Встречи', null, 'complete'], ['B', 'Встречи / Доступ', 'A', 'complete'],
  ]);
  assert.deepEqual(found.files.map(file => [file.key, file.parentKey, file.folderPath]), [
    ['Main', null, 'Встречи'], ['Branch', 'Main', 'Встречи'], ['Nested', null, 'Встречи / Доступ'],
  ]);
  assert.equal(found.coverage.files, 3);
  assert.deepEqual(found.coverage.byStatus, { metadata: 3 });
});

test('partial discovery preserves unseen files and their saved indexes', t => {
  const f = fixture(t);
  const retained = entry('Nested', { folderId: 'B', folderPath: 'Встречи / Доступ', scanStatus: 'full', depth: 0, indexPath: 'indexes/Nested.json' });
  seed(f, [retained, entry('Unseen')]);
  const oldIndex = { key: 'Nested', records: [{ id: '1:2', text: 'Сохранённый текст' }] };
  writeJSON(path.join(f.dir, retained.indexPath), oldIndex);
  const routes = discoveryRoutes();
  routes['/v2/folders/B/files?branch_data=true'] = { status: 403, body: { message: 'Fixture permission denied' } };
  const result = run(f, 'discover', routes);
  ok(result);
  const found = catalog(f);
  assert.equal(found.inventoryComplete, false);
  assert.equal(found.errors.length, 1);
  assert.equal(found.errors[0].folderId, 'B');
  assert.match(found.errors[0].message, /HTTP 403/);
  assert.deepEqual(found.files.find(file => file.key === 'Nested'), retained);
  assert.ok(found.files.some(file => file.key === 'Unseen'), 'incomplete inventory must not prune unvisited old files');
  assert.ok(found.files.some(file => file.key === 'Main'), 'successful folders still update the catalog');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir, retained.indexPath))), oldIndex);
});

test('rediscovery marks changed files stale while preserving indexes and unchanged scans', t => {
  const f = fixture(t);
  seed(f, [
    entry('Main', { scanStatus: 'full', depth: 0, indexPath: 'indexes/Main.json' }),
    entry('Nested', { scanStatus: 'structure', depth: 2, indexPath: 'indexes/Nested.json' }),
    entry('Gone'),
  ]);
  const routes = discoveryRoutes();
  routes['/v2/folders/A/files?branch_data=true'].body.files[0].last_modified = nextModified;
  ok(run(f, 'discover', routes));
  const found = catalog(f);
  const changed = found.files.find(file => file.key === 'Main');
  assert.equal(changed.scanStatus, 'stale');
  assert.equal(changed.indexPath, 'indexes/Main.json');
  assert.equal(changed.lastModified, nextModified);
  const unchanged = found.files.find(file => file.key === 'Nested');
  assert.equal(unchanged.scanStatus, 'structure');
  assert.equal(unchanged.indexPath, 'indexes/Nested.json');
  assert.equal(unchanged.depth, 2);
  assert.ok(!found.files.some(file => file.key === 'Gone'), 'only a completed inventory prunes absent files');
});

test('full scan extracts text and visibility, then resume skips unchanged files without requests', t => {
  const f = fixture(t);
  seed(f, [entry('Main'), entry('Nested')]);
  const routes = { '/v1/files/Main': fileResponse('Main'), '/v1/files/Nested': fileResponse('Nested') };
  const first = run(f, 'scan', routes, ['--depth', '0']);
  ok(first);
  assert.deepEqual(first.endpoints, Object.keys(routes));
  const found = catalog(f);
  assert.deepEqual(found.coverage.byStatus, { full: 2 });
  const indexed = JSON.parse(fs.readFileSync(path.join(f.dir, 'indexes/Main.json'), 'utf8'));
  const text = indexed.records.find(record => record.id === '1:2');
  assert.equal(text.text, 'В доступе отказано');
  assert.equal(text.pageName, 'Доступ');
  assert.equal(text.path, 'Доступ / Отказ / Причина');
  assert.equal(text.visible, false, 'hidden ancestor visibility reaches text descendants');
  assert.equal(text.url, 'https://www.figma.com/design/Main?node-id=1%3A2');
  const fullResume = run(f, 'scan', {}, ['--depth', '0']);
  ok(fullResume);
  assert.deepEqual(fullResume.requests, []);
  const shallowResume = run(f, 'scan', {}, ['--depth', '2']);
  ok(shallowResume);
  assert.deepEqual(shallowResume.requests, []);
  assert.deepEqual(catalog(f).files, found.files, 'resume preserves per-file scan timestamps and index metadata');
});

test('429 checkpoints completed scans, stops further requests, and resumes remaining files', t => {
  const f = fixture(t);
  seed(f, [entry('Main'), entry('Branch', { parentKey: 'Main' }), entry('Nested')]);
  const first = run(f, 'scan', {
    '/v1/files/Main': fileResponse('Main'),
    '/v1/files/Branch': { status: 429, headers: { 'Retry-After': '37' }, body: { message: 'Fixture rate limit' } },
  }, ['--depth', '0']);
  assert.equal(first.status, 1, first.stdout + first.stderr);
  assert.deepEqual(first.endpoints, ['/v1/files/Main', '/v1/files/Branch']);
  assert.match(first.stderr, /Retry-After: 37/);
  const checkpoint = catalog(f);
  assert.equal(checkpoint.files[0].scanStatus, 'full');
  assert.ok(fs.existsSync(path.join(f.dir, checkpoint.files[0].indexPath)));
  assert.equal(checkpoint.files[1].scanStatus, 'error');
  assert.equal(checkpoint.files[1].error.retryAfter, '37');
  assert.equal(checkpoint.files[2].scanStatus, 'metadata');
  assert.equal(checkpoint.contentScannedAt, undefined, 'interrupted pass is not marked complete');
  const resumed = run(f, 'scan', {
    '/v1/files/Branch': fileResponse('Branch'), '/v1/files/Nested': fileResponse('Nested'),
  }, ['--depth', '0']);
  ok(resumed);
  assert.deepEqual(resumed.endpoints, ['/v1/files/Branch', '/v1/files/Nested']);
  assert.deepEqual(catalog(f).coverage.byStatus, { full: 3 });
  assert.ok(catalog(f).files.every(file => !file.error));
});

test('429 during discovery checkpoints completed folders and retains old unseen records', t => {
  const f = fixture(t);
  seed(f, [entry('Nested', { scanStatus: 'full', indexPath: 'indexes/Nested.json', depth: 0 })]);
  const routes = discoveryRoutes();
  routes['/v2/folders/B/folders'] = { status: 429, headers: { 'Retry-After': '19' }, body: { message: 'Fixture rate limit' } };
  const result = run(f, 'discover', routes);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Retry-After: 19/);
  assert.ok(!result.endpoints.includes('/v2/folders/B/files?branch_data=true'));
  const checkpoint = catalog(f);
  assert.equal(checkpoint.inventoryComplete, false);
  assert.equal(checkpoint.folders.find(folder => folder.id === 'A').status, 'complete');
  assert.equal(checkpoint.folders.find(folder => folder.id === 'B').status, 'error');
  assert.ok(checkpoint.files.some(file => file.key === 'Main'));
  assert.equal(checkpoint.files.find(file => file.key === 'Nested').indexPath, 'indexes/Nested.json');
  assert.equal(checkpoint.errors[0].retryAfter, '19');
});

test('oversized responses fall back to page lists and only --force retries the attempted depth', t => {
  for (const depth of [2, 0]) {
    const f = fixture(t);
    seed(f, [entry('Main')]);
    const deepEndpoint = `/v1/files/Main${depth ? `?depth=${depth}` : ''}`;
    const shallow = fileResponse('Main');
    shallow.body.document.children[0].children = [];
    const first = run(f, 'scan', {
      [deepEndpoint]: { status: 400, body: { err: 'Request too large' } },
      '/v1/files/Main?depth=1': shallow,
    }, ['--depth', String(depth)]);
    ok(first);
    assert.deepEqual(first.endpoints, [deepEndpoint, '/v1/files/Main?depth=1']);
    const saved = catalog(f).files[0];
    assert.equal(saved.scanStatus, 'structure');
    assert.equal(saved.depth, 1);
    assert.equal(saved.attemptedDepth, depth);
    assert.match(saved.limitedReason, /larger response/);
    const index = JSON.parse(fs.readFileSync(path.join(f.dir, saved.indexPath), 'utf8'));
    assert.equal(index.depth, 1);
    assert.deepEqual(index.records.map(record => record.type), ['CANVAS']);

    // An empty route table proves a resume is offline, including a failed full-tree attempt.
    const resumed = run(f, 'scan', {}, ['--depth', String(depth)]);
    ok(resumed);
    assert.deepEqual(resumed.requests, [], `depth ${depth}: unchanged limited file must not repeat its oversized request`);
    assert.deepEqual(catalog(f).files[0], saved);

    const forced = run(f, 'scan', { [deepEndpoint]: fileResponse('Main') }, ['--depth', String(depth), '--force']);
    ok(forced);
    assert.deepEqual(forced.endpoints, [deepEndpoint]);
    assert.equal(catalog(f).files[0].depth, depth);
    assert.equal(catalog(f).files[0].scanStatus, depth === 0 ? 'full' : 'structure');
  }
});

test('page refresh preserves other pages and keeps stale page ids until all pages reach the new version', t => {
  const f = fixture(t);
  seed(f, [entry('Main')]);
  const pageIds = ['10:1', '20:1', '30:1'];
  const page = (id, version) => ({
    id, type: 'CANVAS', name: `Страница ${id}`, children: [{
      id: id.replace(':1', ':2'), type: 'TEXT', name: 'Содержимое', characters: `Текст ${id} ${version}`,
    }],
  });
  const baseline = fileResponse('Main');
  baseline.body.version = 'v1';
  baseline.body.document.children = pageIds.map(id => page(id, 'v1'));
  ok(run(f, 'scan', { '/v1/files/Main': baseline }, ['--depth', '0']));
  const readIndex = () => JSON.parse(fs.readFileSync(path.join(f.dir, 'indexes/Main.json'), 'utf8'));
  const baselineIndex = readIndex();
  const refresh = (pageId, version) => {
    const endpoint = `/v1/files/Main/nodes?ids=${encodeURIComponent(pageId)}`;
    const result = run(f, 'page', { [endpoint]: { body: {
      name: 'Main', version, lastModified: version === 'v1' ? firstModified : nextModified,
      nodes: { [pageId]: { document: page(pageId, version) } },
    } } }, ['--file', 'Main', '--page', pageId]);
    ok(result);
    assert.deepEqual(result.endpoints, [endpoint]);
    return readIndex();
  };

  const sameVersion = refresh(pageIds[0], 'v1');
  assert.deepEqual(
    sameVersion.records.filter(record => record.pageId !== pageIds[0]),
    baselineIndex.records.filter(record => record.pageId !== pageIds[0]),
    'a page read must retain every record of untouched pages',
  );
  assert.deepEqual(sameVersion.stalePageIds, []);
  assert.equal(catalog(f).files[0].scanStatus, 'full');

  for (let i = 0; i < pageIds.length; i++) {
    const refreshed = refresh(pageIds[i], 'v2');
    const pending = pageIds.slice(i + 1);
    assert.deepEqual([...refreshed.stalePageIds].sort(), [...pending].sort(), 'same-version follow-up retains the remaining stale page ids');
    assert.equal(refreshed.staleOtherPages, pending.length > 0);
    assert.equal(refreshed.version, 'v2');
    assert.equal(refreshed.stats.pages, pageIds.length);
    assert.equal(new Set(refreshed.records.map(record => record.id)).size, baselineIndex.records.length, 'refresh replaces page records without dropping other pages or duplicating nodes');
    for (let j = 0; j < pageIds.length; j++) {
      const expectedVersion = j <= i ? 'v2' : 'v1';
      assert.equal(refreshed.records.find(record => record.id === pageIds[j].replace(':1', ':2')).text, `Текст ${pageIds[j]} ${expectedVersion}`);
    }
    assert.equal(catalog(f).files[0].scanStatus, pending.length ? 'partial' : 'full');
  }
  assert.equal(readIndex().depth, 0);
  assert.deepEqual(readIndex().pageDepths, Object.fromEntries(pageIds.map(id => [id, 0])));
});

test('optional rate-limit retries recover a transient 429 and stop at the configured retry count', t => {
  const limited = { status: 429, headers: { 'Retry-After': '0.001' }, body: { message: 'Fixture rate limit' } };
  const recoveredFixture = fixture(t);
  seed(recoveredFixture, [entry('Main')]);
  const recovered = run(recoveredFixture, 'scan', {
    '/v1/files/Main': [limited, fileResponse('Main')],
  }, ['--depth', '0', '--rate-limit-retries', '1']);
  ok(recovered);
  assert.deepEqual(recovered.endpoints, ['/v1/files/Main', '/v1/files/Main']);
  const saved = catalog(recoveredFixture).files[0];
  assert.equal(saved.scanStatus, 'full');
  assert.equal(saved.error, undefined);
  assert.ok(fs.existsSync(path.join(recoveredFixture.dir, saved.indexPath)));

  const exhaustedFixture = fixture(t);
  seed(exhaustedFixture, [entry('Main'), entry('Nested')]);
  const exhausted = run(exhaustedFixture, 'scan', {
    '/v1/files/Main': limited,
  }, ['--depth', '0', '--rate-limit-retries', '2']);
  assert.equal(exhausted.status, 1, exhausted.stdout + exhausted.stderr);
  assert.deepEqual(exhausted.endpoints, Array(3).fill('/v1/files/Main'), 'one initial attempt plus exactly two retries');
  assert.match(exhausted.stderr, /Retry-After: 0\.001/);
  const checkpoint = catalog(exhaustedFixture);
  assert.equal(checkpoint.files[0].scanStatus, 'error');
  assert.equal(checkpoint.files[0].error.retryAfter, '0.001');
  assert.equal(checkpoint.files[1].scanStatus, 'metadata', 'retry exhaustion stops before the next file');
  assert.equal(checkpoint.contentScannedAt, undefined);
});
