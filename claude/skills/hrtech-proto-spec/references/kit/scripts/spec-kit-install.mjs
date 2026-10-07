#!/usr/bin/env node
/* eslint-disable no-console -- консольная утилита, вывод и есть её результат */
/**
 * Установка комплекта «Карта» (hrtech-proto-spec v6) в прототип одной командой. Вида «Сценарий» нет.
 *
 *   node <скил>/references/kit/scripts/spec-kit-install.mjs --to <папка прототипа>
 *   node <скил>/references/kit/scripts/spec-kit-install.mjs --to <папка прототипа> --force   # обновить движок
 *
 * Что делает:
 *   1. Копирует движок и виды в `<прототип>/src/`, скрипты — в `<прототип>/src/scripts/`.
 *      Уже существующие файлы движка без `--force` не трогает, но говорит, если они СТАРЫЕ.
 *   2. Кладёт заготовки `spec.ts`, `spec-sections.ts`, `spec-seeds.ts`, `spec-snapshots.json` —
 *      ТОЛЬКО если таких файлов ещё нет. Свои файлы продукта не перезаписываются никогда.
 *   3. Подключает вид: в стандартный корень `src/index.tsx` витрины
 *      (`<PrototypeProviders><PrototypeDraft /></PrototypeProviders>`) вписывает `<SpecGate>`.
 *      Корень нестандартный — печатает, что вписать руками.
 *   4. Проверяет зависимости и печатает следующие шаги с готовыми командами.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const toIndex = argv.indexOf('--to');
const force = argv.includes('--force');

if (toIndex < 0 || !argv[toIndex + 1]) {
    console.error('Укажите папку прототипа: --to prototypes/<...>/<slug>');
    process.exit(2);
}

const target = path.resolve(argv[toIndex + 1]);
const src = path.join(target, 'src');
const manifestPath = path.join(target, 'manifest.json');

if (!fs.existsSync(src) || !fs.existsSync(manifestPath)) {
    console.error(`Это не папка прототипа (нет src/ или manifest.json): ${target}`);
    process.exit(2);
}

const ENGINE = [
    'map-board.ts',
    'MapBoard.tsx',
    'MapBoard.module.css',
    'SpecView.tsx',
    'SpecGate.tsx',
    'SpecGate.module.css',
    'spec-snapshots.ts',
    'url-state.ts',
    'spec-seed-runtime.ts',
];
const SCRIPTS = ['spec-snapshots.mjs', 'spec-map-check.mjs', 'spec-lint.mjs'];
const TEMPLATES = ['spec.ts', 'spec-sections.ts', 'spec-seeds.ts'];
const report = [];
const warnings = [];

const copy = (from, to, overwrite, engine) => {
    const exists = fs.existsSync(to);

    if (exists && !overwrite) {
        const stale = engine && fs.readFileSync(to, 'utf8') !== fs.readFileSync(from, 'utf8');

        report.push(`  ${stale ? '!' : '='} ${path.relative(target, to)} — уже есть${stale ? ', СТАРАЯ версия' : ''}, не трогаю`);

        if (stale) {
            warnings.push(`${path.relative(target, to)} отличается от комплекта — старый вид спеки. Сверь с владельцем и перезапусти с --force (файлы продукта spec.ts, spec-sections.ts, spec-seeds.ts он не трогает).`);
        }

        return;
    }

    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    report.push(`  ${exists ? '↻' : '+'} ${path.relative(target, to)}`);
};

ENGINE.forEach(file => copy(path.join(KIT, file), path.join(src, file), force, true));
SCRIPTS.forEach(file => copy(path.join(KIT, 'scripts', file), path.join(src, 'scripts', file), force, true));
TEMPLATES.forEach(file => copy(path.join(KIT, 'templates', file), path.join(src, file), false, false));
copy(path.join(KIT, 'spec-snapshots.json'), path.join(src, 'spec-snapshots.json'), false, false);
fs.mkdirSync(path.join(target, 'assets', 'spec'), { recursive: true });

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const title = String(manifest.title ?? 'Прототип').replace(/"/g, '«');

/* ---------- Подключение вида: SpecGate в стандартный корень витрины ---------- */

const indexPath = path.join(src, 'index.tsx');
let wired = 'нет src/index.tsx — впиши <SpecGate> в корень прототипа руками (см. ниже)';

if (fs.existsSync(indexPath)) {
    const index = fs.readFileSync(indexPath, 'utf8');
    const ownPanel = fs.readdirSync(src).some(file =>
        /\.tsx$/.test(file) && !['SpecGate.tsx', 'SpecView.tsx', 'MapBoard.tsx'].includes(file) &&
        /<SpecView[\s>]/.test(fs.readFileSync(path.join(src, file), 'utf8')));

    if (/<SpecGate[\s>]/.test(index)) {
        wired = 'уже подключён (<SpecGate> в src/index.tsx)';
    } else if (ownPanel) {
        wired = 'у прототипа своя панель режимов (<SpecView> уже рендерится) — SpecGate не нужен';
    } else {
        const match = index.match(/<PrototypeProviders>\s*\n(\s*)(<([A-Z]\w*)\s*\/>)\s*\n(\s*)<\/PrototypeProviders>/);

        if (match) {
            const [whole, indent, element] = match;
            const inner = `${indent}    `;
            const replaced = whole.replace(
                `${indent}${element}`,
                `${indent}<SpecGate title="${title}">\n${inner}${element}\n${indent}</SpecGate>`,
            );
            const lastImport = [...index.matchAll(/^import .*;$/gm)].filter(item => !/\.css';$/.test(item[0])).pop();
            let next = index.replace(whole, replaced);

            if (lastImport) {
                next = next.replace(lastImport[0], `${lastImport[0]}\nimport { SpecGate } from './SpecGate';`);
            } else {
                next = `import { SpecGate } from './SpecGate';\n${next}`;
            }

            fs.writeFileSync(indexPath, next);
            wired = `вписан: <PrototypeProviders><SpecGate title="${title}"><${match[3]} /></SpecGate></PrototypeProviders>`;
        } else {
            wired = 'корень src/index.tsx нестандартный — впиши <SpecGate> руками (см. ниже)';
            warnings.push('SpecGate не вписан автоматически: оберни корень прототипа ВНУТРИ PrototypeProviders.');
        }
    }
}

/* ---------- Чистый старт рецептов: движок рецептов загружается раньше продукта ---------- */

/*
 * С `?seed=` движок рецептов подменяет хранилище прототипа памятью страницы (spec-seed-runtime.ts):
 * прототип не восстанавливает прошлый выбор человека и не запоминает шаг спеки. Подмена должна
 * случиться раньше, чем модули продукта что-то прочитают, — поэтому импорт ради побочного эффекта.
 * Сортировка импортов витрины (`simple-import-sort`: react → побочные эффекты → пакеты → свои)
 * ставит его сразу после react, то есть выше всех модулей продукта.
 */
let cleanStart = 'нет src/index.tsx — впиши первой строкой импортов: import \'./spec-seed-runtime\';';

if (fs.existsSync(indexPath)) {
    const index = fs.readFileSync(indexPath, 'utf8');
    const line = "import './spec-seed-runtime';";

    if (index.includes(line)) {
        cleanStart = 'уже подключён';
    } else {
        const reactImports = [...index.matchAll(/^import [^;]*from 'react[^']*';$/gm)];
        const afterReact = reactImports.length ? reactImports[reactImports.length - 1] : null;
        const next = afterReact ?
            index.replace(afterReact[0], `${afterReact[0]}\n\n${line}`) :
            `${line}\n\n${index}`;

        fs.writeFileSync(indexPath, next.replace(/\n{3,}/g, '\n\n'));
        cleanStart = `вписан: ${line} в src/index.tsx`;
    }
}

/* ---------- Демо-панель прототипа: data-spec-chrome ---------- */

/*
 * Панель переключения сценариев над продуктом (как у многих прототипов витрины: «Сценарии
 * прототипа», «Варианты прототипа», `styles.prototypeVariantBar`) — не интерфейс продукта. Помеченная
 * `data-spec-chrome`, она прячется на кадрах спеки, а рецепты по-прежнему могут её нажимать.
 * Ставим атрибут сами только по надёжным признакам и только на HTML-контейнер; похожее — подсказкой.
 */
const STRONG_LABEL = /aria-label="(Сценари[а-я]* прототипа|Вариант[а-я]* прототипа|Управление прототипом|Выбор сценария|Другие состояния|Чаты прототипа)"/;
const STRONG_CLASS = /className=\{styles\.(prototypeVariantBar|scenarioSwitcher|scenarioBar|scenarioPanel|demoPanel)\}/;
const WEAK_LABEL = /aria-label="[^"]*(сценари|вариант|состояни|демо)[^"]*"/i;
const chromeMarks = [];
const chromeHints = [];
const walkTsx = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
        return entry.name === 'scripts' ? [] : walkTsx(full);
    }

    return /\.tsx$/.test(entry.name) && !ENGINE.includes(entry.name) ? [full] : [];
});

walkTsx(src).forEach(file => {
    let text = fs.readFileSync(file, 'utf8');
    let changed = false;

    text = text.replace(/<(section|div|nav|aside|header|footer|fieldset|form|ul)\b([^>]*?)>/g, (tag, name, attrs, offset) => {
        const line = text.slice(0, offset).split('\n').length;
        const where = `${path.relative(target, file)}:${line}`;

        if (/data-spec-chrome/.test(attrs)) {
            return tag;
        }

        /* Сами — только по явной подписи «Сценарии/Варианты прототипа…». По имени класса так же
           называют и экраны продукта (`scenarioPanel` бывает экраном «Ответы»), поэтому класс — подсказка. */
        if (STRONG_LABEL.test(attrs)) {
            changed = true;
            chromeMarks.push(`${where} <${name} ${attrs.match(STRONG_LABEL)[0]}>`);

            return `<${name} data-spec-chrome${attrs}>`;
        }

        const weak = attrs.match(STRONG_CLASS) || attrs.match(WEAK_LABEL);

        if (weak) {
            chromeHints.push(`${where} <${name} ${weak[0]}>`);
        }

        return tag;
    });

    if (changed) {
        fs.writeFileSync(file, text);
    }
});

/* ---------- Зависимости ---------- */

const pkgPath = path.join(target, 'package.json');
const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : {};
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

if (!deps['@yandex-int/hr-components']) {
    warnings.push('В package.json нет @yandex-int/hr-components — виды спеки собраны на HRDS, без него не соберутся.');
}

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);

if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 15)) {
    warnings.push(`Node ${process.versions.node}: скриптам спеки нужен Node ≥ 22.15 (витрина требует ≥ 24.15).`);
}

/* Корень витрины — ближайший предок с папкой prototypes/: tsc запускается оттуда. */
let root = target;

while (path.dirname(root) !== root && !fs.existsSync(path.join(root, 'prototypes'))) {
    root = path.dirname(root);
}

const fromRoot = path.relative(root, target);
const base = `https://prototipnitsa.local.yandex-team.ru:<порт>/prototype-builds/${manifest.slug ?? '<slug>'}/`;

console.log(`Комплект установлен в ${target}\n`);
report.forEach(line => console.log(line));
console.log(`\nВид спеки: ${wired}`);
console.log(`Чистый старт рецептов: ${cleanStart}`);

if (chromeMarks.length) {
    console.log('\nДемо-панель прототипа помечена data-spec-chrome (на кадрах спрячется):');
    chromeMarks.forEach(line => console.log(`  + ${line}`));
}

if (chromeHints.length) {
    console.log('\nПроверь: похоже на демо-панель — если это переключатели сценариев НАД продуктом, поставь data-spec-chrome:');
    chromeHints.forEach(line => console.log(`  ? ${line}`));
}

if (warnings.length) {
    console.log('\nВнимание:');
    warnings.forEach(line => console.log(`  ! ${line}`));
}

console.log(`
Дальше — строго по порядку (SKILL.md §0 «Регламент»). Команды node src/scripts/… — из папки прототипа:
  cd ${target}

  4. Проверка подключения (вид, рецепты, демо-панель):
       node src/scripts/spec-snapshots.mjs --base ${base} --wiring
     → три строки «✓». Корень не стандартный — вручную, ВНУТРИ PrototypeProviders:
       <PrototypeProviders><SpecGate title="${title}"><КореньПрототипа /></SpecGate></PrototypeProviders>
     (своя панель режимов — рендери там <SpecView mode={…} title="…" onModeChange={…} />)

  5. Смысл и разведка: прочитай manifest.json (description) и CONTEXT.md, потом
       node src/scripts/spec-snapshots.mjs --base ${base} --probe '?'
       node src/scripts/spec-snapshots.mjs --base ${base} --explore '?'
       node src/scripts/spec-snapshots.mjs --base ${base} --probe '?' --click '<кнопка>' --click '<кнопка>'
     → запиши «ЧТО ОБЕЩАНО» и «ПУТЬ СЛОВАМИ» в шапку src/spec-sections.ts.

  6. src/spec-seeds.ts — рецепты («Готовый рецепт» из разведки один в один); каждый:
       node src/scripts/spec-snapshots.mjs --base ${base} --probe '?seed=<id>'   → «рецепт: ready» на 1440 и 375

  7. src/spec.ts — кадры:  node src/scripts/spec-lint.mjs --stage frames   → «Кадры чистые.»
  8. src/spec-sections.ts: node src/scripts/spec-lint.mjs                  → «Состав чистый.»
     и из корня витрины (${root}):
       node_modules/.bin/tsc -p ${fromRoot}/tsconfig.json --noEmit           → нет ошибок в файлах спеки

  9. Снимки и лист:
       node src/scripts/spec-snapshots.mjs --base ${base} --prune --sheet /tmp/spec-sheet.png
     → код выхода 0, открой /tmp/spec-sheet.png: нет красного, жёлтое объяснено.

  10–11. Приёмка и скриншоты:
       node src/scripts/spec-map-check.mjs --base ${base} --shots /tmp/spec-shots
     → «Карта чистая.», открой /tmp/spec-shots/*.png.`);
