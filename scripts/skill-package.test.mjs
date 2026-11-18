import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = path.join(root, 'bulochka-v4-26', 'skill-package-tests');
const skillsRoot = path.join(root, 'claude', 'skills');
const names = fs.readdirSync(skillsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
  .map(entry => entry.name)
  .sort();
const sharedReferences = [
  '../../commands/hrtech.md', '../../commands/hrds-knowledge.md',
  '../../knowledge/team-notes.md',
];

test('installed Codex and Claude skills find shared knowledge from an unrelated chat directory', () => {
  assert.ok(names.includes('hrtech'), 'package includes the main routing skill');
  fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, 'case-'));
  try {
    const userDir = path.join(dir, 'isolated user');
    const payload = path.join(userDir, 'Library', 'Application Support', 'Bulochka');
    const chatDir = path.join(dir, 'unrelated chat project');
    fs.mkdirSync(chatDir, { recursive: true });
    fs.mkdirSync(path.join(payload, 'scripts'), { recursive: true });
    for (const folder of ['skills', 'commands', 'knowledge']) {
      fs.cpSync(path.join(root, 'claude', folder), path.join(payload, 'claude', folder), { recursive: true });
    }
    const linkScript = path.join(payload, 'scripts', 'link-knowledge.sh');
    fs.copyFileSync(path.join(root, 'scripts', 'link-knowledge.sh'), linkScript);
    const env = { HOME: userDir, CODEX_HOME: path.join(userDir, '.codex'), PATH: '/usr/bin:/bin' };
    const install = spawnSync('/bin/bash', [linkScript], { cwd: chatDir, env, encoding: 'utf8' });
    assert.equal(install.status, 0, install.stdout + install.stderr);

    for (const assistantRoot of ['.agents', '.claude']) {
      const installed = path.join(userDir, assistantRoot, 'skills');
      assert.deepEqual(fs.readdirSync(installed).sort(), names);
      for (const name of names) {
        const skillLink = path.join(installed, name);
        assert.ok(fs.lstatSync(skillLink).isSymbolicLink(), `${assistantRoot}/${name} is linked`);
        // Follow the portable path-resolution instruction given in SKILL.md, with no
        // dependency on system Node/Python/realpath or the designer's chat directory.
        const resolved = spawnSync('/bin/bash', ['-c', 'cd "$1" && pwd -P', '_', skillLink], {
          cwd: chatDir, env, encoding: 'utf8',
        });
        assert.equal(resolved.status, 0, resolved.stderr);
        const skillDir = resolved.stdout.trim();
        assert.equal(skillDir, fs.realpathSync(path.join(payload, 'claude', 'skills', name)));
        const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
        assert.match(name, /^hrtech(?:-[a-z0-9-]+)?$/, `${name} is discoverable by the bridge`);
        const declaredName = content.match(/^name:\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
        assert.equal(declaredName, name, `${name} declares its installed name`);
        const links = [...content.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
        for (const target of links.filter(target => !/^(?:[a-z]+:|#)/i.test(target))) {
          const resolvedTarget = fs.realpathSync(path.resolve(skillDir, target.split('#')[0]));
          assert.ok(resolvedTarget.startsWith(fs.realpathSync(payload) + path.sep), `${name}: ${target} stays in package`);
          assert.ok(fs.statSync(resolvedTarget).isFile(), `${name}: ${target} resolves to a readable file`);
          fs.readFileSync(resolvedTarget, 'utf8');
        }
        if (name === 'hrtech') {
          for (const target of sharedReferences) {
            assert.ok(links.includes(target), `main skill exposes shared knowledge: ${target}`);
          }
          for (const specialized of names.filter(name => name !== 'hrtech')) {
            assert.ok(links.includes(`../${specialized}/SKILL.md`), `main skill exposes ${specialized}`);
          }
        }
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
