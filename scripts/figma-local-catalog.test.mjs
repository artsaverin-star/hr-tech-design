import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_TEAM_ID, resolveCatalogPath } from '../claude/skills/hrtech-figma-search/scripts/catalog-path.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const skill = path.join(root, 'claude/skills/hrtech-figma-search');
const scratch = path.join(root, 'hrtech-figma-catalog/testing');
function json(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}
function fixture(t) {
  fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, 'local-catalog-'));
  const home = path.join(dir, 'user home');
  fs.mkdirSync(home);
  const defaultPath = path.join(home, '.hrtech/figma-catalog', DEFAULT_TEAM_ID, 'catalog.json');
  const configPath = path.join(home, '.hrtech/figma-catalog.json');
  const stub = path.join(dir, 'fetch-stub.mjs');
  fs.writeFileSync(stub, `
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.fetch = async (input, options) => {
  fs.appendFileSync(process.env.REQUEST_LOG, String(input) + '\\n');
  assert.equal(input, 'https://api.figma.com/v2/teams/${DEFAULT_TEAM_ID}/folders');
  assert.equal(options.method || 'GET', 'GET');
  assert.equal(new Headers(options.headers).get('X-Figma-Token'), 'fixture-token');
  return new Response(JSON.stringify({ name: 'Fixture team', folders: [] }));
};`);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, home, defaultPath, configPath, stub, log: path.join(dir, 'requests.log') };
}
function run(f, script, args = [], env = {}) {
  return spawnSync(process.execPath, ['--import', pathToFileURL(f.stub).href, path.join(skill, 'scripts', script), ...args], {
    cwd: f.dir, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, HOME: f.home, NODE_OPTIONS: '', BULOCHKA_FIGMA_CATALOG: '', FIGMA_ACCESS_TOKEN: '', REQUEST_LOG: f.log, ...env },
  });
}
function seed(file, files = []) {
  json(file, { schemaVersion: 1, teamId: DEFAULT_TEAM_ID, folders: [], files, errors: [] });
}
function hit(key) { return { key, name: 'Fixture calendar', scanStatus: 'metadata', url: `https://www.figma.com/design/${key}` }; }
function ok(result) { assert.ifError(result.error); assert.equal(result.status, 0, result.stdout + result.stderr); }

test('catalog location respects explicit path, environment, per-user config and default', async t => {
  const f = fixture(t);
  assert.equal(await resolveCatalogPath({ home: f.home, env: {} }), f.defaultPath);
  assert.equal(await resolveCatalogPath({ home: f.home, env: {}, teamId: '123' }), path.join(f.home, '.hrtech/figma-catalog/123/catalog.json'));
  const configured = path.join(f.dir, 'existing', 'catalog.json');
  json(f.configPath, { catalogPath: configured });
  assert.equal(await resolveCatalogPath({ home: f.home, env: {} }), configured);
  const environment = path.join(f.dir, 'environment.json');
  assert.equal(await resolveCatalogPath({ home: f.home, env: { BULOCHKA_FIGMA_CATALOG: environment } }), environment);
  const explicit = path.join(f.dir, 'explicit.json');
  fs.writeFileSync(f.configPath, 'invalid JSON');
  assert.equal(await resolveCatalogPath({ home: f.home, env: { BULOCHKA_FIGMA_CATALOG: environment }, catalog: explicit }), explicit);
  assert.equal(await resolveCatalogPath({ home: f.home, env: { BULOCHKA_FIGMA_CATALOG: environment } }), environment);
  await assert.rejects(resolveCatalogPath({ home: f.home, env: {} }), /figma-catalog\.json/);
  json(f.configPath, { catalogPath: 'relative.json' });
  await assert.rejects(resolveCatalogPath({ home: f.home, env: {} }), /absolute\/path/);
});

test('missing local catalog gives a next step without network or writes', t => {
  const f = fixture(t);
  for (const [script, args] of [['search.mjs', ['calendar']], ['scan.mjs', ['status']], ['scan.mjs', ['scan']]]) {
    const result = run(f, script, args);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(f.defaultPath));
    assert.match(result.stderr, /discover/);
    assert.match(result.stderr, /figma-token/);
  }
  assert.ok(!fs.existsSync(f.defaultPath));
  assert.ok(!fs.existsSync(f.log));
});

test('discover creates an empty local inventory with the existing token and no bundled seed', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.home, '.hrtech'), { recursive: true });
  fs.writeFileSync(path.join(f.home, '.hrtech/figma-token'), 'fixture-token');
  ok(run(f, 'scan.mjs', ['discover', '--interval-ms', '0']));
  const catalog = JSON.parse(fs.readFileSync(f.defaultPath, 'utf8'));
  assert.deepEqual(catalog.files, []);
  assert.equal(catalog.inventoryComplete, true);
  assert.equal(fs.readFileSync(f.log, 'utf8').trim().split('\n').length, 1);
  assert.ok(!fs.readFileSync(f.defaultPath, 'utf8').includes('fixture-token'));
  const search = run(f, 'search.mjs', ['calendar', '--json']);
  ok(search);
  const report = JSON.parse(search.stdout);
  assert.equal(report.totalMatches, 0);
  assert.equal(report.scope.totalFiles, 0);
  assert.match(report.nextStep, /discover/);
  assert.equal(fs.readFileSync(f.log, 'utf8').trim().split('\n').length, 1);
});

test('search and scanner share local config and explicit override stays isolated', t => {
  const f = fixture(t);
  const existing = path.join(f.dir, 'existing/catalog.json');
  const explicit = path.join(f.dir, 'other/catalog.json');
  seed(existing, [hit('FixtureConfigured')]);
  seed(explicit, [hit('FixtureExplicit')]);
  json(f.configPath, { catalogPath: existing });
  const search = run(f, 'search.mjs', ['calendar', '--json']);
  ok(search);
  assert.equal(JSON.parse(search.stdout).results[0].fileKey, 'FixtureConfigured');
  const status = run(f, 'scan.mjs', ['status']);
  ok(status);
  assert.equal(JSON.parse(status.stdout).catalog, existing);
  const snapshot = fs.readFileSync(existing, 'utf8');
  for (const options of [
    { args: ['--catalog', explicit], env: {} },
    { args: [], env: { BULOCHKA_FIGMA_CATALOG: explicit } },
  ]) {
    const result = run(f, 'search.mjs', ['calendar', '--json', ...options.args], options.env);
    ok(result);
    assert.equal(JSON.parse(result.stdout).results[0].fileKey, 'FixtureExplicit');
  }
  assert.equal(fs.readFileSync(existing, 'utf8'), snapshot);
  assert.ok(!fs.existsSync(f.defaultPath));
  assert.ok(!fs.existsSync(f.log));
});

test('runtime instructions work through installed symlinks without a system Node', t => {
  const f = fixture(t);
  const payload = path.join(f.home, 'Library/Application Support/Bulochka');
  const installed = path.join(payload, 'claude/skills/hrtech-figma-search');
  fs.cpSync(skill, installed, { recursive: true });
  const runtime = path.join(payload, 'runtime/node/bin/node');
  fs.mkdirSync(path.dirname(runtime), { recursive: true });
  fs.symlinkSync(process.execPath, runtime);
  const link = path.join(f.home, '.agents/skills/hrtech-figma-search');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(installed, link);
  seed(f.defaultPath, [hit('FixtureInstalled')]);
  const doc = fs.readFileSync(path.join(skill, 'references/runtime.md'), 'utf8');
  const setup = doc.match(/```sh\n([\s\S]*?)\n```/)[1];
  const command = `cd -P "$1"\n${setup}\n"$BULOCHKA_NODE" scripts/search.mjs calendar --json`;
  const result = spawnSync('/bin/bash', ['-c', command, '_', link], {
    cwd: f.dir, env: { HOME: f.home, PATH: '/usr/bin:/bin', BULOCHKA_FIGMA_CATALOG: '' }, encoding: 'utf8', timeout: 15000,
  });
  ok(result);
  assert.equal(JSON.parse(result.stdout).results[0].fileKey, 'FixtureInstalled');
  assert.ok(!fs.existsSync(path.join(installed, 'references/catalog.json')));
  assert.ok(!fs.existsSync(path.join(installed, 'references/indexes')));
});

test('public skill payload contains code and instructions without a catalog or index', () => {
  const all = fs.readdirSync(skill, { recursive: true, withFileTypes: true });
  const files = all.filter(entry => entry.isFile()).map(entry => entry.name);
  assert.ok(files.length > 0);
  assert.ok(files.every(name => /\.(?:md|mjs)$/.test(name)), 'private JSON and packed indexes must not ship');
  assert.ok(!files.includes('coverage.md'), 'private coverage report must stay local');
  assert.ok(!fs.existsSync(path.join(skill, 'references/indexes')));
});
