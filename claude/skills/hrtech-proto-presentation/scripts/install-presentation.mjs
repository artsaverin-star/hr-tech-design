#!/usr/bin/env node
/**
 * Установщик универсального движка интерактивной презентации в прототип Прототипницы.
 *
 * Использование:
 *   node scripts/install-presentation.mjs --to <path-to-prototype> [--device mobile|desktop] [--wire] [--force] [--force-slides]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const KIT_DIR = path.resolve(SCRIPT_DIR, '../references/kit');

const ENGINE_FILES = [
    'presentationTypes.ts',
    'presentationTypograf.ts',
    'PresentationDeck.module.css',
    'PresentationDeck.tsx',
    'PresentationGate.module.css',
    'PresentationGate.tsx',
];

function parseArgs(argv) {
    const opts = {
        to: '',
        device: '',
        wire: false,
        force: false,
        forceSlides: false,
        help: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--to' && argv[i + 1]) {
            opts.to = argv[++i];
        } else if (arg === '--device' && argv[i + 1]) {
            opts.device = argv[++i];
        } else if (arg === '--wire') {
            opts.wire = true;
        } else if (arg === '--force') {
            opts.force = true;
        } else if (arg === '--force-slides') {
            opts.forceSlides = true;
        } else if (arg === '--help' || arg === '-h') {
            opts.help = true;
        } else {
            throw new Error(`Неизвестный аргумент: ${arg}`);
        }
    }
    return opts;
}

function printUsage() {
    console.log([
        'Использование:',
        '  node scripts/install-presentation.mjs --to <dir> [--device mobile|desktop] [--wire] [--force] [--force-slides]',
        '',
        'Флаги:',
        '  --to <dir>        Путь к папке прототипа (содержащей src/)',
        '  --device <kind>   mobile или desktop (если не указан — определяется по коду)',
        '  --wire            Автоматически обернуть корень в src/index.tsx в <PresentationGate>',
        '  --force           Перезаписать файлы движка (не трогает presentationSlides.ts)',
        '  --force-slides    Перезаписать также presentationSlides.ts из шаблона',
    ].join('\n'));
}

function collectFiles(dir, acc = []) {
    if (!fs.existsSync(dir)) {
        return acc;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectFiles(full, acc);
        } else if (/\.(tsx?|css|json)$/i.test(entry.name)) {
            acc.push(full);
        }
    }
    return acc;
}

function detectDevice(protoDir) {
    const files = collectFiles(path.join(protoDir, 'src'));
    let mobileScore = 0;
    let desktopScore = 0;

    for (const file of files) {
        if (file.includes(`${path.sep}presentation${path.sep}`)) {
            continue;
        }
        const content = fs.readFileSync(file, 'utf8');
        if (/\b375\b|PhoneFrame|BottomTabBar|Drawer|mobile|phoneShell|phoneViewport/i.test(content)) {
            mobileScore += 1;
        }
        if (/\b1440\b|DesktopLayout|Sidebar|topNav|HeaderNav|DataTable|desktop/i.test(content)) {
            desktopScore += 1;
        }
    }
    if (mobileScore > desktopScore && mobileScore >= 2) {
        return 'mobile';
    }
    return 'desktop';
}

function readPrototypeTitle(protoDir) {
    const manifestPath = path.join(protoDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (typeof manifest.title === 'string' && manifest.title.trim()) {
                return manifest.title.trim();
            }
            if (typeof manifest.name === 'string' && manifest.name.trim()) {
                return manifest.name.trim();
            }
        } catch {
            // ignore broken json
        }
    }
    return path.basename(protoDir);
}

function escapeSingleQuotes(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function tryWireIndexTsx(protoDir) {
    const indexPath = path.join(protoDir, 'src/index.tsx');
    if (!fs.existsSync(indexPath)) {
        return { wired: false, reason: 'src/index.tsx не найден' };
    }
    const raw = fs.readFileSync(indexPath, 'utf8');
    if (raw.includes('PresentationGate') || raw.includes('PresentationDeck')) {
        return { wired: true, already: true, reason: 'уже подключено в src/index.tsx' };
    }

    const providerRe = /(<PrototypeProviders\b[^>]*>)([\s\S]*?)(<\/PrototypeProviders>)/;
    const match = raw.match(providerRe);
    if (!match) {
        return {
            wired: false,
            reason: 'нестандартный src/index.tsx (не найден блок <PrototypeProviders>...</PrototypeProviders>)',
        };
    }

    const inner = match[2];
    const trimmedInner = inner.trim();
    if (!trimmedInner) {
        return { wired: false, reason: 'пустой блок <PrototypeProviders>' };
    }

    const indentMatch = inner.match(/\n([ \t]+)</);
    const childIndent = indentMatch ? indentMatch[1] : '        ';
    const nestedIndent = `${childIndent}    `;
    const indentedInner = trimmedInner
        .split('\n')
        .map(line => (line.trim() ? `${nestedIndent}${line.trim()}` : ''))
        .join('\n');

    const wrapped = [
        match[1],
        `${childIndent}<PresentationGate config={PRESENTATION_CONFIG}>`,
        indentedInner,
        `${childIndent}</PresentationGate>`,
        `${childIndent.slice(0, Math.max(0, childIndent.length - 4))}${match[3]}`,
    ].join('\n');

    let next = raw.replace(providerRe, wrapped);

    const importBlock = [
        "import { PresentationGate } from './presentation/PresentationGate';",
        "import { PRESENTATION_CONFIG } from './presentation/presentationSlides';",
    ].join('\n');

    const lines = next.split('\n');
    let lastImportIdx = -1;
    let lastRelativeImportIdx = -1;
    for (let i = 0; i < lines.length; i += 1) {
        if (/^\s*import\s/.test(lines[i])) {
            lastImportIdx = i;
            if (/from\s+['"]\.\.?\//.test(lines[i])) {
                lastRelativeImportIdx = i;
            }
        }
    }

    if (lastRelativeImportIdx >= 0) {
        lines.splice(lastRelativeImportIdx + 1, 0, importBlock);
    } else if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, '', importBlock);
    } else {
        lines.unshift(importBlock, '');
    }

    next = lines.join('\n');
    fs.writeFileSync(indexPath, next, 'utf8');
    return { wired: true, already: false, reason: 'подключено через <PresentationGate> в src/index.tsx' };
}

function hasCustomViewSwitcher(protoDir) {
    const files = collectFiles(path.join(protoDir, 'src'));
    for (const file of files) {
        if (file.includes(`${path.sep}presentation${path.sep}`)) {
            continue;
        }
        const content = fs.readFileSync(file, 'utf8');
        if (/params\.get\(['"]view['"]\)|view\s*===\s*['"]presentation['"]/.test(content)) {
            return path.relative(protoDir, file);
        }
    }
    return null;
}

function main() {
    let opts;
    try {
        opts = parseArgs(process.argv.slice(2));
    } catch (err) {
        console.error(`Ошибка: ${err.message}`);
        printUsage();
        process.exit(1);
    }

    if (opts.help || !opts.to) {
        printUsage();
        process.exit(opts.help ? 0 : 1);
    }

    if (opts.device && opts.device !== 'mobile' && opts.device !== 'desktop') {
        console.error(`Ошибка: --device должен быть mobile или desktop (получено: ${opts.device})`);
        process.exit(1);
    }

    const protoDir = path.resolve(opts.to);
    const srcDir = path.join(protoDir, 'src');
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
        console.error(`Ошибка: не найдена папка src/ внутри ${protoDir}`);
        process.exit(1);
    }

    if (!fs.existsSync(KIT_DIR)) {
        console.error(`Ошибка: не найден кит движка по пути ${KIT_DIR}`);
        process.exit(1);
    }

    const device = opts.device || detectDevice(protoDir);
    const title = readPrototypeTitle(protoDir);
    const targetDir = path.join(srcDir, 'presentation');
    fs.mkdirSync(targetDir, { recursive: true });

    const copied = [];
    const skipped = [];

    for (const file of ENGINE_FILES) {
        const from = path.join(KIT_DIR, file);
        const to = path.join(targetDir, file);
        if (fs.existsSync(to) && !opts.force) {
            skipped.push(file);
            continue;
        }
        fs.copyFileSync(from, to);
        copied.push(file);
    }

    const slidesPath = path.join(targetDir, 'presentationSlides.ts');
    let slidesStatus = 'сохранён существующий';
    if (!fs.existsSync(slidesPath) || opts.forceSlides) {
        const templatePath = path.join(KIT_DIR, 'presentationSlides.template.ts');
        let template = fs.readFileSync(templatePath, 'utf8');
        template = template.replace(
            /title:\s*'Название прототипа'/,
            `title: '${escapeSingleQuotes(title)}'`,
        );
        template = template.replace(
            /defaultDevice:\s*'mobile'/,
            `defaultDevice: '${device}'`,
        );
        fs.writeFileSync(slidesPath, template, 'utf8');
        slidesStatus = fs.existsSync(slidesPath) && opts.forceSlides ? 'перезаписан из шаблона' : 'создан из шаблона';
    }

    console.log('');
    console.log(`✓ Движок презентации установлен в ${path.relative(process.cwd(), targetDir) || targetDir}`);
    console.log(`  Название: ${title}`);
    console.log(`  Форм-фактор: ${device}${opts.device ? '' : ' (определён автоматически; меняется в presentationSlides.ts)'}`);
    if (copied.length) {
        console.log(`  Скопированы файлы движка: ${copied.join(', ')}`);
    }
    if (skipped.length) {
        console.log(`  Оставлены без изменений (передайте --force для обновления): ${skipped.join(', ')}`);
    }
    console.log(`  Файл слайдов presentationSlides.ts: ${slidesStatus}`);

    const customSwitcher = hasCustomViewSwitcher(protoDir);
    if (opts.wire) {
        if (customSwitcher) {
            console.log('');
            console.log(`! В прототипе уже есть переключение ?view= в ${customSwitcher}.`);
            console.log('  Не оборачиваю src/index.tsx автоматически, чтобы не создать вторую шапку.');
            console.log('  Подключите <PresentationDeck config={PRESENTATION_CONFIG} ... /> в существующий переключатель.');
        } else {
            const res = tryWireIndexTsx(protoDir);
            console.log('');
            if (res.wired) {
                console.log(`✓ Подключение: ${res.reason}`);
            } else {
                console.log(`! Автоподключение пропущено: ${res.reason}`);
                console.log('  Оберните корень прототипа вручную в:');
                console.log('    <PresentationGate config={PRESENTATION_CONFIG}><YourRoot /></PresentationGate>');
            }
        }
    } else {
        console.log('');
        if (customSwitcher) {
            console.log(`Подсказка: в ${customSwitcher} уже есть ?view=. Подключите <PresentationDeck /> в существующие табы,`);
            console.log('а для ?viewport=frame рендерите сам прототип без внешней шапки.');
        } else {
            console.log('Подсказка: чтобы подключить вкладку «Презентация | Прототип» автоматически, запустите с --wire');
            console.log('или оберните корень в src/index.tsx в <PresentationGate config={PRESENTATION_CONFIG}>...');
        }
    }

    const checkScriptPath = path.join(SCRIPT_DIR, 'check-presentation.mjs');
    console.log('');
    console.log('Дальше по шагам:');
    console.log('  1. Прозвоните живые экраны, чтобы взять точные тексты кнопок:');
    console.log(`     node "${checkScriptPath}" --probe <URL-прототипа> --device ${device}`);
    console.log('  2. Заполните ТОЛЬКО src/presentation/presentationSlides.ts (движок и CSS не трогайте).');
    console.log('  3. Проверьте статикой и живыми скриншотами:');
    console.log(`     node "${checkScriptPath}" --proto "${protoDir}" --base <URL-прототипа> --shots /tmp/pres-shots`);
    console.log('');
}

main();
