#!/usr/bin/env node
/* eslint-disable no-console -- консольная утилита, вывод и есть её результат */
/**
 * Собирает умение (папку со SKILL.md) в ОДИН markdown-файл, который можно отдать чужому агенту
 * без доступа к этому репозиторию: markdown-файлы умения лежат в нём как есть, код — блоками
 * с подписью пути; каждый файл обёрнут маркерами-комментариями, по которым распаковщик (он же
 * вложен в начало файла) восстанавливает папку умения один в один.
 *
 *   node scripts/bundle-skill.mjs claude/skills/hrtech-proto-spec --out ~/Downloads/hrtech-proto-spec.md
 *
 * Проверка круга: node <распаковщик> <сборка.md> /tmp/x && diff -r /tmp/x/<умение> claude/skills/<умение>
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const skillDir = args.find((a) => !a.startsWith('--'));
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
if (!skillDir || !fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    console.error('usage: node scripts/bundle-skill.mjs <папка умения со SKILL.md> [--out <файл.md>]');
    process.exit(1);
}
const skillPath = path.resolve(skillDir);
const skillName = path.basename(skillPath);
const outPath = path.resolve((outArg || `${skillName}.md`).replace(/^~(?=$|\/)/, os.homedir()));
const outName = path.basename(outPath);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ---------- файлы умения ----------
const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : walk(p);
        return e.isFile() ? [p] : [];
    });
const rank = (rel) => (rel === 'SKILL.md' ? 0 : rel.endsWith('.md') && !rel.includes('/kit/') ? 1 : 2);
const readmeFirst = (rel) => (rel.endsWith('README.md') ? 0 : 1);
const files = walk(skillPath)
    .map((p) => path.relative(skillPath, p).split(path.sep).join('/'))
    .filter((rel) => !rel.endsWith('.DS_Store'))
    .sort((a, b) => rank(a) - rank(b) || readmeFirst(a) - readmeFirst(b) || a.localeCompare(b));
const plural = (n, one, few, many) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many}`;
const note = args.includes('--note') ? args[args.indexOf('--note') + 1] : '';
const read = (rel) => fs.readFileSync(path.join(skillPath, rel));
for (const rel of files) {
    if (read(rel).includes(0)) {
        console.error(`Бинарный файл в умении: ${rel} — в markdown не упаковать`);
        process.exit(1);
    }
}

// ---------- маркеры и длина ограждения ----------
const OPEN = (rel) => `<!-- @file ${skillName}/${rel} -->`;
const CLOSE = '<!-- @endfile -->';
const texts = Object.fromEntries(files.map((rel) => [rel, read(rel).toString('utf8')]));
for (const rel of files) {
    if (texts[rel].includes('<!-- @file ') || texts[rel].includes(CLOSE)) {
        console.error(`Файл ${rel} содержит маркер сборки — переименуй маркеры в скрипте`);
        process.exit(1);
    }
}
const maxTicks = Math.max(3, ...files.map((rel) => Math.max(0, ...(texts[rel].match(/`{3,}/g) || []).map((s) => s.length))));
const FENCE = '`'.repeat(maxTicks + 1);
const lang = (rel) => ({ ts: 'ts', tsx: 'tsx', mjs: 'js', js: 'js', css: 'css', json: 'json', sh: 'bash', md: 'markdown' })[rel.split('.').pop()] || 'text';

// ---------- происхождение ----------
const sh = (cmd) => {
    try { return execSync(cmd, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
};
const commit = sh(`git log -1 --format='%h от %ad' --date=short -- ${JSON.stringify(skillPath)}`);
const dirty = sh(`git status --porcelain -- ${JSON.stringify(skillPath)}`) ? ' (+ незакоммиченные правки)' : '';
const versionMatch = (() => {
    try { return fs.readFileSync(path.join(repoRoot, 'figma-desktop-bridge/code.js'), 'utf8').match(/hrtechVersion\s*=\s*['"]([^'"]+)['"]/); } catch { return null; }
})();
const today = new Date().toISOString().slice(0, 10);
const fm = texts['SKILL.md'].match(/^---\n([\s\S]*?)\n---/);
const description = fm
    ? (fm[1].match(/description:\s*>-?\n([\s\S]*?)(?:\n\w|$)/)?.[1] || fm[1].match(/description:\s*(.+)/)?.[1] || '')
        .split('\n').map((l) => l.trim()).join(' ').trim()
    : '';

// ---------- распаковщик (маркеры собраны из частей, чтобы его блок не читался как файл) ----------
const unpacker = `// Распаковщик сборки умения: node unpack-skill.mjs <${outName}> [папка умений]
// Создаёт папку ${skillName}/ с файлами умения один в один. Повторный запуск перезаписывает их.
import fs from 'node:fs';
import path from 'node:path';

const [bundle, dest = '.'] = process.argv.slice(2);
if (!bundle) { console.error('usage: node unpack-skill.mjs <сборка.md> [папка умений]'); process.exit(1); }
const text = fs.readFileSync(bundle, 'utf8');
const open = '<!-- @' + 'file ';
const close = '\\n<!-- @' + 'endfile -->';
const re = new RegExp(open + '(.+?) -->\\\\n([\\\\s\\\\S]*?)' + close, 'g');
let n = 0;
for (const m of text.matchAll(re)) {
    const rel = m[1].trim();
    let body = m[2];
    if (path.isAbsolute(rel) || rel.split('/').includes('..')) throw new Error('подозрительный путь: ' + rel);
    const fence = body.match(/^(\`{4,})\\S*\\n/);            // код лежит в ограждении — снять его
    if (fence) {
        body = body.slice(fence[0].length);
        const tail = '\\n' + fence[1];
        if (!body.endsWith(tail)) throw new Error('ограждение не закрыто: ' + rel);
        body = body.slice(0, -tail.length);
    }
    const out = path.join(dest, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, body);
    n += 1;
    console.log('+ ' + out);
}
console.log(n ? \`Распаковано файлов: \${n} → \${path.resolve(dest, '${skillName}')}\` : 'Файлов не найдено: это не сборка умения?');
`;

// ---------- сборка ----------
const kb = (s) => `${Math.max(1, Math.round(s / 1024))} КБ`;
const total = files.reduce((s, rel) => s + Buffer.byteLength(texts[rel]), 0);
const parts = [];
parts.push(`# Умение «${skillName}» в одном файле — для агента дизайнера

${description ? `> **Когда срабатывает.** ${description}\n` : ''}
Собрано ${today} из репозитория Булочки (HR TECH DESIGN, \`hr-tech-design\`): папка умения
\`claude/skills/${skillName}\`, коммит ${commit || '—'}${dirty}${versionMatch ? `, версия Булочки ${versionMatch[1]}` : ''}.
Внутри — ${plural(files.length, 'файл', 'файла', 'файлов')} умения (${kb(total)}) один в один, как в репозитории; этот файл их только упаковывает.${note ? `\n${note}` : ''}

## Коллеге: как отдать умение своему агенту

1. Сохрани этот файл (\`${outName}\`) в любую папку — например, в папку прототипа или в «Загрузки».
2. В своей задаче напиши агенту (Codex CLI или Claude Code) примерно так:

   > В файле \`${outName}\` лежит умение Булочки в одном документе. Разверни его по разделу «Агенту: как
   > развернуть умение из этого файла» и дальше работай по его SKILL.md. Задача: … (что сделать, с каким
   > прототипом или файлом, ссылка на тикет).

3. Дальше агент всё делает сам: распаковывает умение, читает его и выполняет задачу по его регламенту.
   Что понадобится на машине (программы, доступы, запущенные сервисы) — перечислено в самом умении,
   агент скажет, если чего-то не хватает.

Чтобы умение осталось у агента насовсем, пусть распакует его в папку умений: Claude Code —
\`~/.claude/skills\`, Codex — \`~/.codex/skills\` (тогда оно будет срабатывать само по описанию, без файла).

## Агенту: как развернуть умение из этого файла

Это папка умения, упакованная в текст: каждый файл начинается маркером-комментарием с его путём и
заканчивается маркером конца; markdown-файлы лежат как есть, код — в блоках кода (ограждение из
${maxTicks + 1} обратных кавычек) с подписью языка. **Не восстанавливай файлы чтением и перепечаткой —
распакуй скриптом** (нет возможности запустить Node — тогда создай файлы по маркерам вручную, снимая
ограждение у блоков кода):

1. Сохрани блок «Распаковщик» ниже как \`unpack-skill.mjs\` (в любую папку, нужен Node ≥ 18).
2. Запусти \`node unpack-skill.mjs <путь к этому файлу> <папка назначения>\` — появится папка
   \`${skillName}/\` со всеми файлами. Папка назначения: папка умений (Claude Code — \`~/.claude/skills\`,
   Codex — \`~/.codex/skills\`; для Прототипницы — \`.agents/skills\` витрины) или просто рабочая папка:
   все пути внутри умения относительные, \`<скил>\` в его командах — путь к распакованной папке.
3. Сверь список файлов с таблицей «Состав» ниже (распаковщик печатает каждый созданный файл).
4. Прочитай \`SKILL.md\` целиком и остальные markdown-файлы умения; работай по его регламенту.
   Файлы кода (часть 3) читать не нужно — умение само говорит, как их ставить и запускать.

Ссылки вида \`claude/skills/…\` и \`claude/commands/…\` в тексте — файлы репозитория Булочки (соседние
умения и база знаний). Если их у тебя нет, работай по этому файлу; разделы, которым нужен мост Булочки
(MCP-сервер \`figma-hrtech\`), выполняй только когда этот сервер есть среди твоих инструментов —
умение само отмечает, какие это разделы.

### Распаковщик

${FENCE}js
${unpacker}${FENCE}

### Состав

| файл | размер |
|---|---|
${files.map((rel) => `| \`${skillName}/${rel}\` | ${kb(Buffer.byteLength(texts[rel]))} |`).join('\n')}
`);

const section = (title) => `\n---\n\n## ${title}\n`;
const embed = (rel) => {
    const body = texts[rel];
    if (rel.endsWith('.md')) return `${OPEN(rel)}\n${body}\n${CLOSE}\n`;
    return `${OPEN(rel)}\n${FENCE}${lang(rel)}\n${body}\n${FENCE}\n${CLOSE}\n`;
};
const groups = [
    ['Часть 1 · SKILL.md — само умение', files.filter((r) => rank(r) === 0)],
    ['Часть 2 · Справочники умения (markdown)', files.filter((r) => rank(r) === 1)],
    ['Часть 3 · Комплект кода и заготовки (ставятся установщиком, читать не нужно)', files.filter((r) => rank(r) === 2)],
].filter(([, list]) => list.length);
for (const [title, list] of groups) {
    parts.push(section(title));
    for (const rel of list) {
        parts.push(`\n### Файл \`${skillName}/${rel}\`\n\n${embed(rel)}`);
    }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, parts.join(''));
console.log(`Собрано: ${outPath} — ${files.length} файлов, ${kb(fs.statSync(outPath).size)}`);
