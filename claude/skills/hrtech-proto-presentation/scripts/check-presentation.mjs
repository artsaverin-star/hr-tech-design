#!/usr/bin/env node
/**
 * Универсальный валидатор и прозвонщик презентации прототипа.
 *
 * Режимы работы:
 *   1. Прозвон живого экрана (печатает реальные заголовки и кликабельные элементы):
 *      node scripts/check-presentation.mjs --probe <url> [--device mobile|desktop] [--wait 500]
 *
 *   2. Статический аудит (без браузера и без внешних зависимостей — правила P01..P13):
 *      node scripts/check-presentation.mjs --proto <prototypeDir>
 *
 *   3. Полная приёмка (статика + живой headless-браузер по каждому слайду + DOM-хотспоты + скриншоты + contact-sheet.html):
 *      node scripts/check-presentation.mjs --proto <prototypeDir> --base <url> [--shots <dir>] [--browser <path>]
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import vm from 'node:vm';

const DEFAULT_HOTSPOT_SELECTOR = 'button, [role="button"], [role="tab"], a, article, [data-hotspot]';

const PLACEHOLDER_RE = [
    /Главная мысль продукта/i,
    /Текст реальной кнопки/i,
    /Первый критерий успеха/i,
    /Название прототипа/i,
    /\bTODO\b/i,
    /\bTBD\b/i,
    /\bFIXME\b/i,
    /\blorem\b/i,
];

const STOP_WORD_RULES = [
    {
        re: /(^|[^а-яёa-z])спокойн(?:ый|ая|ое|ые|о|ого|ому|ым|ую|ой|ых)(?=$|[^а-яёa-z])/i,
        word: 'спокойный/спокойно',
        hint: 'Замените на конкретику: без лишнего шума, сразу, без перестройки',
    },
    {
        re: /(^|[^а-яёa-z])хвост(?:ы|ов|ами|ах)?(?=$|[^а-яёa-z])/i,
        word: 'хвосты',
        hint: 'Пишите «дела», «задачи», «что осталось доделать»',
    },
    {
        re: /(^|[^а-яёa-z])бесшовн[а-яё]*(?=$|[^а-яёa-z])/i,
        word: 'бесшовный',
        hint: 'Опишите конкретное действие: «без переключения вкладок», «прямо в карточке»',
    },
    {
        re: /(^|[^а-яёa-z])интуитивн[а-яё]*(?=$|[^а-яёa-z])/i,
        word: 'интуитивный',
        hint: 'Уберите оценку — покажите, что именно понятно с первого взгляда',
    },
    {
        re: /(^|[^а-яёa-z])единое\s+окно(?=$|[^а-яёa-z])/i,
        word: 'единое окно',
        hint: 'Назовите место по-человечески: «на одном экране», «внутри Я Team»',
    },
    {
        re: /(^|[^а-яёa-z])синерги[а-яё]*(?=$|[^а-яёa-z])/i,
        word: 'синергия',
        hint: 'Скажите простыми словами, что соединилось и какую пользу дало',
    },
    {
        re: /(^|[^а-яёa-z])революцион[а-яё]*(?=$|[^а-яёa-z])/i,
        word: 'революционный',
        hint: 'Уберите пафос — назовите конкретное изменение',
    },
    {
        re: /(^|[^а-яёa-z])элегантн[а-яё]*(?=$|[^а-яёa-z])/i,
        word: 'элегантный',
        hint: 'Уберите оценку дизайна — опишите пользу для сотрудника',
    },
    {
        re: /(^|[^а-яёa-z])юзер[а-яё]*(?=$|[^а-яёa-z])/i,
        word: 'юзер',
        hint: 'Пишите «человек» или «сотрудник»',
    },
    {
        re: /(^|[^а-яёa-z])флоу(?=$|[^а-яёa-z])/i,
        word: 'флоу',
        hint: 'Пишите «сценарий» или «путь»',
    },
    {
        re: /(^|[^а-яёa-z])фич[аиеуой](?=$|[^а-яёa-z])/i,
        word: 'фича',
        hint: 'Назовите саму возможность (поиск, напоминание, итоги)',
    },
    {
        re: /(^|[^а-яёa-z])дровер[а-яё]*(?=$|[^а-яёa-z])/i,
        word: 'дровер',
        hint: 'Пишите «панель», «карточка» или назовите содержимое',
    },
    {
        re: /(^|[^а-яёa-z])шторк[аиеуой](?=$|[^а-яёa-z])/i,
        word: 'шторка',
        hint: 'Назовите смысл окна (настройки, фильтры, карточка)',
    },
    {
        re: /(^|[^а-яёa-z])модалк[аиеуой](?=$|[^а-яёa-z])/i,
        word: 'модалка',
        hint: 'Назовите диалог или действие по смыслу',
    },
    {
        re: /(^|[^а-яёa-z])компонент[а-яё]*(?=$|[^а-яёa-z])/i,
        word: 'компонент',
        hint: 'Не рассказывайте про вёрстку — описывайте продукт глазами сотрудника',
    },
    {
        re: /(^|[^а-яёa-z])(?:viewport|iframe|seed=|query)(?=$|[^а-яёa-z])/i,
        word: 'технический термин (viewport/iframe/seed/query)',
        hint: 'Уберите внутренние параметры прототипа из текста слайда',
    },
];

function parseArgs(argv) {
    const opts = {
        probe: '',
        proto: '',
        base: '',
        shots: '',
        browser: '',
        device: 'mobile',
        wait: 500,
        help: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--probe' && argv[i + 1]) {
            opts.probe = argv[++i];
        } else if (arg === '--proto' && argv[i + 1]) {
            opts.proto = argv[++i];
        } else if (arg === '--base' && argv[i + 1]) {
            opts.base = argv[++i];
        } else if (arg === '--shots' && argv[i + 1]) {
            opts.shots = argv[++i];
        } else if (arg === '--browser' && argv[i + 1]) {
            opts.browser = argv[++i];
        } else if (arg === '--device' && argv[i + 1]) {
            opts.device = argv[++i];
        } else if (arg === '--wait' && argv[i + 1]) {
            opts.wait = Number.parseInt(argv[++i], 10) || 500;
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
        '  1) Прозвон экрана:     node scripts/check-presentation.mjs --probe <url> [--device mobile|desktop] [--wait 500] [--browser <path>]',
        '  2) Статический аудит:  node scripts/check-presentation.mjs --proto <prototypeDir>',
        '  3) Полная приёмка:     node scripts/check-presentation.mjs --proto <prototypeDir> --base <url> [--shots <dir>] [--browser <path>]',
    ].join('\n'));
}

function resolvePackage(pkgName, startDirs) {
    const seen = new Set();
    for (const startDir of startDirs) {
        if (!startDir) {
            continue;
        }
        let dir = path.resolve(startDir);
        for (let depth = 0; depth < 12; depth += 1) {
            if (seen.has(dir)) {
                break;
            }
            seen.add(dir);
            const probeFile = path.join(dir, 'package.json');
            if (fs.existsSync(probeFile)) {
                try {
                    const req = createRequire(probeFile);
                    return req(pkgName);
                } catch {
                    // keep walking up
                }
            }
            const parent = path.dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
    }
    try {
        const req = createRequire(import.meta.url);
        return req(pkgName);
    } catch {
        return null;
    }
}

function stripTsFallback(source) {
    let code = source;
    code = code.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
    code = code.replace(/^\s*export\s+(?:type|interface)\s+[\s\S]*?\n\}\s*$/gm, '');
    code = code.replace(/export\s+const\s+PRESENTATION_CONFIG\s*:\s*[^=]+=/, 'exports.PRESENTATION_CONFIG =');
    code = code.replace(/export\s+const\s+PRESENTATION_CONFIG\s*=/, 'exports.PRESENTATION_CONFIG =');
    code = code.replace(/export\s+const\s+(\w+)\s*:\s*[^=]+=/g, 'const $1 =');
    code = code.replace(/export\s+const\s+(\w+)\s*=/g, 'const $1 =');
    code = code.replace(/\s+as\s+const\b/g, '');
    return code;
}

function loadPresentationConfig(slidesPath, protoDir) {
    const source = fs.readFileSync(slidesPath, 'utf8');
    const ts = resolvePackage('typescript', [protoDir, process.cwd()]);
    let jsCode;

    if (ts) {
        const transpiled = ts.transpileModule(source, {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                esModuleInterop: true,
            },
        });
        jsCode = transpiled.outputText;
    } else {
        jsCode = stripTsFallback(source);
    }

    const sandbox = {
        exports: {},
        module: { exports: {} },
        require: id => {
            if (id.includes('presentationTypes')) {
                return {};
            }
            throw new Error(`В presentationSlides.ts допустимы только типы и данные (обнаружен import '${id}')`);
        },
    };
    sandbox.module.exports = sandbox.exports;

    vm.runInNewContext(jsCode, sandbox, { filename: slidesPath, timeout: 2000 });
    return sandbox.module.exports.PRESENTATION_CONFIG ?? sandbox.exports.PRESENTATION_CONFIG;
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
        } else {
            acc.push(full);
        }
    }
    return acc;
}

function countSentences(text) {
    const cleaned = text
        .replace(/\b(?:т\.д|т\.п|т\.е|др|пр|см|стр|млн|млрд|тыс)\./gi, '')
        .replace(/\d+\.\d+/g, '')
        .trim();
    if (!cleaned) {
        return 0;
    }
    const parts = cleaned.split(/[.!?]+(?:\s+|$)/).filter(Boolean);
    return parts.length;
}

function checkTextCopy(issues, slideId, field, value) {
    if (typeof value !== 'string') {
        return;
    }
    for (const re of PLACEHOLDER_RE) {
        if (re.test(value)) {
            issues.push({
                level: 'error',
                code: 'P02',
                msg: `[${slideId}.${field}] Остался шаблонный плейсхолдер: «${value}»`,
            });
            break;
        }
    }
    for (const rule of STOP_WORD_RULES) {
        if (rule.re.test(value)) {
            issues.push({
                level: 'error',
                code: 'P05',
                msg: `[${slideId}.${field}] Стоп-слово «${rule.word}» в «${value}». ${rule.hint}`,
            });
        }
    }
}

function stripCssCommentsAndGlobals(css) {
    let out = css.replace(/\/\*[\s\S]*?\*\//g, '');
    out = out.replace(/:global\([^)]*\)/g, '');
    return out;
}

function findNonCamelCaseCssClasses(css) {
    const cleaned = stripCssCommentsAndGlobals(css);
    const bad = new Set();
    // Находим селекторы до `{` (игнорируем значения свойств внутри блоков `{ ... }`)
    const withoutBodies = cleaned.replace(/\{[^{}]*\}/g, ' {} ');
    const classRe = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;
    let m;
    while ((m = classRe.exec(withoutBodies)) !== null) {
        const cls = m[1];
        if (cls.includes('_') || cls.includes('-')) {
            bad.add(cls);
        }
    }
    return Array.from(bad);
}

function runStaticAudit(protoDir) {
    const issues = [];
    const presDir = path.join(protoDir, 'src/presentation');
    const slidesPath = path.join(presDir, 'presentationSlides.ts');

    if (!fs.existsSync(slidesPath)) {
        issues.push({
            level: 'error',
            code: 'P01',
            msg: `Не найден файл ${path.relative(protoDir, slidesPath)}. Запустите install-presentation.mjs.`,
        });
        return { issues, config: null };
    }

    let config = null;
    try {
        config = loadPresentationConfig(slidesPath, protoDir);
    } catch (err) {
        issues.push({
            level: 'error',
            code: 'P01',
            msg: `Не удалось прочитать PRESENTATION_CONFIG из presentationSlides.ts: ${err.message}`,
        });
        return { issues, config: null };
    }

    if (!config || typeof config !== 'object' || !Array.isArray(config.slides) || config.slides.length === 0) {
        issues.push({
            level: 'error',
            code: 'P01',
            msg: 'PRESENTATION_CONFIG должен содержать непустой массив slides.',
        });
        return { issues, config: null };
    }

    if (config.defaultDevice !== 'mobile' && config.defaultDevice !== 'desktop') {
        issues.push({
            level: 'error',
            code: 'P01',
            msg: `defaultDevice должен быть 'mobile' или 'desktop' (сейчас: ${String(config.defaultDevice)}).`,
        });
    }

    checkTextCopy(issues, 'config', 'title', config.title);

    if (config.slides.length < 4) {
        issues.push({
            level: 'warn',
            code: 'P02',
            msg: `Слишком мало слайдов (${config.slides.length}). Для полноценной презентации обычно нужно 6–15 слайдов.`,
        });
    } else if (config.slides.length > 18) {
        issues.push({
            level: 'warn',
            code: 'P02',
            msg: `Слишком много слайдов (${config.slides.length}). Сократите до 8–15, чтобы не перегрузить рассказ.`,
        });
    }

    const seenIds = new Set();
    let flowCount = 0;

    for (let i = 0; i < config.slides.length; i += 1) {
        const slide = config.slides[i];
        const sid = slide?.id || `slide#${i + 1}`;

        if (!slide?.id || typeof slide.id !== 'string') {
            issues.push({ level: 'error', code: 'P02', msg: `У слайда #${i + 1} отсутствует строковый id.` });
        } else if (seenIds.has(slide.id)) {
            issues.push({ level: 'error', code: 'P02', msg: `Дублируется id слайда: «${slide.id}».` });
        } else {
            seenIds.add(slide.id);
        }

        // P03: заголовок
        const title = typeof slide.title === 'string' ? slide.title.trim() : '';
        if (!title) {
            issues.push({ level: 'error', code: 'P03', msg: `[${sid}] Пустой заголовок title.` });
        } else {
            if (title.length > 68) {
                issues.push({
                    level: 'error',
                    code: 'P03',
                    msg: `[${sid}] Заголовок слишком длинный (${title.length} зн., лимит 68): «${title}»`,
                });
            } else if (title.length > 58) {
                issues.push({
                    level: 'warn',
                    code: 'P03',
                    msg: `[${sid}] Заголовок длиннее 58 знаков (${title.length} зн.) — лучше сократить: «${title}»`,
                });
            }
            if (/\.$/.test(title)) {
                issues.push({
                    level: 'error',
                    code: 'P03',
                    msg: `[${sid}] Уберите точку в конце заголовка: «${title}»`,
                });
            }
            if (/^(?:слайд\s*\d+|\d+[.)]\s+)/i.test(title)) {
                issues.push({
                    level: 'error',
                    code: 'P03',
                    msg: `[${sid}] Уберите номер из заголовка (номер уже есть внизу слайда): «${title}»`,
                });
            }
            if (title.includes('!')) {
                issues.push({
                    level: 'warn',
                    code: 'P03',
                    msg: `[${sid}] Уберите восклицательный знак в заголовке: «${title}»`,
                });
            }
            checkTextCopy(issues, sid, 'title', title);
        }

        // P04: подпись body
        const body = typeof slide.body === 'string' ? slide.body.trim() : '';
        if (!body) {
            issues.push({ level: 'error', code: 'P04', msg: `[${sid}] Пустая подпись body.` });
        } else {
            if (body.length > 180) {
                issues.push({
                    level: 'error',
                    code: 'P04',
                    msg: `[${sid}] Подпись body слишком длинная (${body.length} зн., лимит 180): «${body}»`,
                });
            } else if (body.length > 155) {
                issues.push({
                    level: 'warn',
                    code: 'P04',
                    msg: `[${sid}] Подпись body длиннее 155 знаков (${body.length} зн.) — сожмите до одного короткого предложения.`,
                });
            }
            const sentences = countSentences(body);
            if (sentences > 2) {
                issues.push({
                    level: 'error',
                    code: 'P04',
                    msg: `[${sid}] В body ${sentences} предложения (допустимо 1–2): «${body}»`,
                });
            }
            if (title && body.toLowerCase() === title.toLowerCase()) {
                issues.push({
                    level: 'error',
                    code: 'P04',
                    msg: `[${sid}] body буквально повторяет title — раскройте мысль, а не копируйте заголовок.`,
                });
            }
            checkTextCopy(issues, sid, 'body', body);
        }

        // Проверки по видам слайдов
        if (slide.kind === 'flow') {
            flowCount += 1;
            const screens = Array.isArray(slide.screens) ? slide.screens : [];
            const devices = screens.map(s => s?.device ?? config.defaultDevice);
            const hasDesktop = devices.includes('desktop');
            const maxScreens = hasDesktop ? 2 : 3;

            if (screens.length < 2 || screens.length > maxScreens) {
                issues.push({
                    level: 'error',
                    code: 'P06',
                    msg: `[${sid}] В flow должно быть ${hasDesktop ? 'строго 2 экрана для desktop' : '2–3 экрана для mobile'} (сейчас ${screens.length}).`,
                });
            }

            for (let sIdx = 0; sIdx < screens.length; sIdx += 1) {
                const sc = screens[sIdx];
                if (sIdx < screens.length - 1) {
                    const hs = sc?.hotspot;
                    if (!hs || (!hs.text && !hs.aria && !hs.selector)) {
                        issues.push({
                            level: 'error',
                            code: 'P06',
                            msg: `[${sid}] У экрана #${sIdx + 1} в flow нет hotspot ({ text | aria | selector }) — стрелке не из чего выйти.`,
                        });
                    }
                    if (hs?.text) {
                        checkTextCopy(issues, sid, `screens[${sIdx}].hotspot.text`, hs.text);
                    }
                    const next = screens[sIdx + 1];
                    const curSig = JSON.stringify({ q: sc?.query ?? '', st: sc?.steps ?? [] });
                    const nextSig = JSON.stringify({ q: next?.query ?? '', st: next?.steps ?? [] });
                    if (curSig === nextSig) {
                        issues.push({
                            level: 'error',
                            code: 'P06',
                            msg: `[${sid}] Экраны #${sIdx + 1} и #${sIdx + 2} имеют одинаковые query и steps — переход ничего не меняет.`,
                        });
                    }
                } else if (sc?.hotspot) {
                    issues.push({
                        level: 'warn',
                        code: 'P06',
                        msg: `[${sid}] У последнего экрана в flow указан hotspot — он не используется (стрелки идут только вперёд).`,
                    });
                }
            }
        } else if (slide.kind === 'compare') {
            const screens = Array.isArray(slide.screens) ? slide.screens : [];
            const devices = screens.map(s => s?.device ?? config.defaultDevice);
            const hasDesktop = devices.includes('desktop');
            const maxScreens = hasDesktop ? 2 : 3;
            if (screens.length < 2 || screens.length > maxScreens) {
                issues.push({
                    level: 'error',
                    code: 'P06',
                    msg: `[${sid}] В compare должно быть ${hasDesktop ? '2 экрана (desktop/mixed)' : '2–3 экрана'} (сейчас ${screens.length}).`,
                });
            }
            screens.forEach((sc, idx) => {
                if (!sc?.caption) {
                    issues.push({
                        level: 'warn',
                        code: 'P06',
                        msg: `[${sid}] У экрана #${idx + 1} в compare нет подписи caption (например «До» / «После» или «Этап 1»).`,
                    });
                } else {
                    checkTextCopy(issues, sid, `screens[${idx}].caption`, sc.caption);
                }
            });
        } else if (slide.kind === 'numbers') {
            const items = Array.isArray(slide.items) ? slide.items : [];
            if (items.length < 2 || items.length > 3) {
                issues.push({
                    level: 'error',
                    code: 'P10',
                    msg: `[${sid}] В numbers должно быть 2–3 числа (сейчас ${items.length}).`,
                });
            }
            items.forEach((it, idx) => checkTextCopy(issues, sid, `items[${idx}].label`, it?.label));
            const src = typeof slide.source === 'string' ? slide.source.trim() : '';
            if (src.length < 4 || /^(?:todo|tbd|нет|пример|none)$/i.test(src)) {
                issues.push({
                    level: 'error',
                    code: 'P11',
                    msg: `[${sid}] Слайд с числами требует реальный source (тикет/аналитика). Если реальных цифр нет — удалите слайд.`,
                });
            }
        } else if (slide.kind === 'bars') {
            const bars = Array.isArray(slide.bars) ? slide.bars : [];
            if (bars.length < 2 || bars.length > 5) {
                issues.push({
                    level: 'error',
                    code: 'P10',
                    msg: `[${sid}] В bars должно быть от 2 до 5 полос (сейчас ${bars.length}).`,
                });
            }
            bars.forEach((b, idx) => checkTextCopy(issues, sid, `bars[${idx}].label`, b?.label));
            const src = typeof slide.source === 'string' ? slide.source.trim() : '';
            if (src.length < 4 || /^(?:todo|tbd|нет|пример|none)$/i.test(src)) {
                issues.push({
                    level: 'error',
                    code: 'P11',
                    msg: `[${sid}] Слайд с графиком требует реальный source (тикет/аналитика). Если реальных цифр нет — удалите слайд.`,
                });
            }
        } else if (slide.kind === 'toggleNumbers') {
            const groups = Array.isArray(slide.groups) ? slide.groups : [];
            if (groups.length < 2 || groups.length > 4) {
                issues.push({
                    level: 'error',
                    code: 'P10',
                    msg: `[${sid}] В toggleNumbers должно быть 2–4 группы переключения (сейчас ${groups.length}).`,
                });
            }
            for (const g of groups) {
                if (!Array.isArray(g.items) || g.items.length < 2 || g.items.length > 3) {
                    issues.push({
                        level: 'error',
                        code: 'P10',
                        msg: `[${sid}] В группе «${g.label}» должно быть 2–3 числа.`,
                    });
                }
                (g.items ?? []).forEach((it, idx) => checkTextCopy(issues, sid, `group(${g.id})[${idx}]`, it?.label));
            }
            const src = typeof slide.source === 'string' ? slide.source.trim() : '';
            if (src.length < 4 || /^(?:todo|tbd|нет|пример|none)$/i.test(src)) {
                issues.push({
                    level: 'error',
                    code: 'P11',
                    msg: `[${sid}] Слайд toggleNumbers требует реальный source. Если данных нет — удалите слайд.`,
                });
            }
        } else if (slide.kind === 'checklist') {
            const items = Array.isArray(slide.items) ? slide.items : [];
            if (items.length < 2 || items.length > 6) {
                issues.push({
                    level: 'error',
                    code: 'P10',
                    msg: `[${sid}] В checklist должно быть 2–6 пунктов (сейчас ${items.length}).`,
                });
            }
            items.forEach((it, idx) => {
                checkTextCopy(issues, sid, `items[${idx}].title`, it?.title);
                checkTextCopy(issues, sid, `items[${idx}].detail`, it?.detail);
            });
        } else if (slide.kind !== 'single') {
            issues.push({
                level: 'error',
                code: 'P01',
                msg: `[${sid}] Неизвестный kind слайда: «${String(slide.kind)}».`,
            });
        }
    }

    if (config.slides.length >= 4 && flowCount === 0) {
        issues.push({
            level: 'warn',
            code: 'P13',
            msg: 'В презентации нет ни одного flow-слайда со стрелками перехода. Добавьте 2–5 живых сценариев.',
        });
    }

    // P07, P08, P09 — проверка файлов движка и CSS в src/presentation/
    const presFiles = collectFiles(presDir);
    for (const file of presFiles) {
        const rel = path.relative(protoDir, file);
        const content = fs.readFileSync(file, 'utf8');

        if (file.endsWith('.tsx')) {
            if (/<iframe\b[^>]*\btitle\s*=/.test(content)) {
                issues.push({
                    level: 'error',
                    code: 'P07',
                    msg: `[${rel}] Найден атрибут title= на <iframe> — он даёт серый тултип при наведении. Используйте aria-label.`,
                });
            }
            if (/styles\[['"][^'"]*[_-][^'"]*['"]\]/.test(content)) {
                issues.push({
                    level: 'error',
                    code: 'P08',
                    msg: `[${rel}] Обращение к CSS Module ключу с «_» или «-» сломается в production (camelCaseOnly).`,
                });
            }
            if (path.basename(file) === 'PresentationDeck.tsx') {
                const connectorPaths = content.match(/<path\b[^>]*flowConnector[^>]*>/g) ?? [];
                for (const tag of connectorPaths) {
                    if (!/\bfill\s*=\s*["']none["']/.test(tag)) {
                        issues.push({
                            level: 'error',
                            code: 'P09',
                            msg: `[${rel}] На SVG <path> стрелки не указан явный fill="none".`,
                        });
                    }
                }
            }
        }

        if (file.endsWith('.module.css')) {
            const badClasses = findNonCamelCaseCssClasses(content);
            if (badClasses.length > 0) {
                issues.push({
                    level: 'error',
                    code: 'P08',
                    msg: `[${rel}] CSS-классы с «_» или «-» сломаются при localsConvention: camelCaseOnly: ${badClasses.join(', ')}`,
                });
            }
        }
    }

    // P12 — проверка подключения в src/
    const allSrcFiles = collectFiles(path.join(protoDir, 'src')).filter(
        f => !f.startsWith(presDir) && /\.(tsx?|jsx?)$/.test(f),
    );
    const hasWiring = allSrcFiles.some(f => {
        const c = fs.readFileSync(f, 'utf8');
        return c.includes('PresentationGate') || c.includes('PresentationDeck');
    });
    if (!hasWiring) {
        issues.push({
            level: 'error',
            code: 'P12',
            msg: 'Презентация установлена в src/presentation/, но не подключена в src/index.tsx или Preview.tsx (запустите install-presentation.mjs --wire).',
        });
    }

    return { issues, config };
}

class CdpBrowser {
    constructor(socket) {
        this.socket = socket;
        this.nextId = 0;
        this.pending = new Map();
        this.listeners = new Map();

        socket.addEventListener('message', event => {
            const msg = JSON.parse(String(event.data));
            if (msg.id && this.pending.has(msg.id)) {
                const entry = this.pending.get(msg.id);
                clearTimeout(entry.timer);
                this.pending.delete(msg.id);
                if (msg.error) {
                    entry.reject(new Error(msg.error.message || 'CDP error'));
                } else {
                    entry.resolve(msg.result);
                }
            } else if (msg.method) {
                const set = this.listeners.get(msg.method);
                if (set) {
                    for (const fn of set) {
                        fn(msg.params, msg.sessionId);
                    }
                }
            }
        });

        socket.addEventListener('close', () => {
            for (const entry of this.pending.values()) {
                clearTimeout(entry.timer);
                entry.reject(new Error('Браузер отключился'));
            }
            this.pending.clear();
        });
    }

    send(method, params = {}, sessionId = undefined) {
        return new Promise((resolve, reject) => {
            const id = ++this.nextId;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP ${method}: превышено время ожидания`));
            }, 30000);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
    }

    on(method, fn) {
        if (!this.listeners.has(method)) {
            this.listeners.set(method, new Set());
        }
        this.listeners.get(method).add(fn);
        return () => this.listeners.get(method)?.delete(fn);
    }

    async evaluate(sessionId, expression) {
        const res = await this.send(
            'Runtime.evaluate',
            { expression, awaitPromise: true, returnByValue: true },
            sessionId,
        );
        if (res.exceptionDetails) {
            throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'JS error');
        }
        return res.result?.value;
    }
}

async function launchHeadlessBrowser(explicitBinary) {
    if (typeof WebSocket !== 'function') {
        throw new Error('Для живой проверки нужен Node.js 22+ (встроенный WebSocket).');
    }
    const defaults =
        process.platform === 'darwin' ?
            [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Yandex.app/Contents/MacOS/Yandex',
                '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
                '/Applications/Chromium.app/Contents/MacOS/Chromium',
                '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            ] :
            ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
    const candidates = explicitBinary ? [explicitBinary] : defaults;
    const binary = candidates.find(p => fs.existsSync(p));
    if (!binary) {
        throw new Error(
            'Chromium-браузер (Chrome или Яндекс.Браузер) не найден. Передайте путь через --browser <path>.',
        );
    }

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pres-cdp-'));
    const child = spawn(
        binary,
        [
            '--headless=new',
            '--remote-debugging-port=0',
            `--user-data-dir=${profile}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-component-update',
            '--hide-scrollbars',
            '--proxy-bypass-list=127.0.0.1,localhost',
            'about:blank',
        ],
        { stdio: 'ignore' },
    );

    let startupError = null;
    child.on('error', err => {
        startupError = err;
    });

    let socket = null;
    const close = async() => {
        try {
            socket?.close();
        } catch {
            // ignore
        }
        if (child.exitCode === null) {
            child.kill();
        }
        await delay(200);
        fs.rmSync(profile, { recursive: true, force: true });
    };

    try {
        let port = '';
        for (let attempt = 0; attempt < 100 && !port; attempt += 1) {
            if (startupError) {
                throw startupError;
            }
            if (child.exitCode !== null) {
                throw new Error(`Браузер завершился с кодом ${child.exitCode}`);
            }
            const portFile = path.join(profile, 'DevToolsActivePort');
            if (fs.existsSync(portFile)) {
                port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
            }
            if (!port) {
                await delay(100);
            }
        }
        if (!port) {
            throw new Error('Браузер не запустил DevTools за 10 секунд');
        }

        const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json());
        socket = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            socket.addEventListener('open', () => resolve(), { once: true });
            socket.addEventListener('error', () => reject(new Error('Не удалось подключиться к DevTools')), {
                once: true,
            });
        });

        const cdp = new CdpBrowser(socket);
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Runtime.enable', {}, sessionId);

        return { cdp, sessionId, close };
    } catch (err) {
        await close();
        throw err;
    }
}

async function navigateAndWait(cdp, sessionId, url, waitMs = 600) {
    let loaded = false;
    const offLoad = cdp.on('Page.loadEventFired', (_params, sid) => {
        if (sid === sessionId) {
            loaded = true;
        }
    });
    try {
        await cdp.send('Page.navigate', { url }, sessionId);
        const deadline = Date.now() + 25000;
        while (!loaded && Date.now() < deadline) {
            await delay(60);
        }
    } finally {
        offLoad();
    }
    await cdp.evaluate(sessionId, 'document.fonts ? document.fonts.ready.then(() => true) : true').catch(() => undefined);
    await delay(waitMs);
}

async function runProbe(opts) {
    const viewport = opts.device === 'desktop' ? { width: 1440, height: 900 } : { width: 375, height: 812 };
    const { cdp, sessionId, close } = await launchHeadlessBrowser(opts.browser);
    try {
        await cdp.send(
            'Emulation.setDeviceMetricsOverride',
            { width: viewport.width, height: viewport.height, deviceScaleFactor: 2, mobile: opts.device === 'mobile' },
            sessionId,
        );
        await navigateAndWait(cdp, sessionId, opts.probe, opts.wait);

        const data = await cdp.evaluate(
            sessionId,
            `(() => {
                const selector = ${JSON.stringify(DEFAULT_HOTSPOT_SELECTOR)};
                const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
                    .map(el => ({
                        tag: el.tagName.toLowerCase(),
                        text: (el.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 90),
                        rect: el.getBoundingClientRect(),
                    }))
                    .filter(h => h.text && h.rect.width > 0 && h.rect.height > 0);

                const controls = [];
                const seenText = new Map();
                for (const el of Array.from(document.querySelectorAll(selector))) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) {
                        continue;
                    }
                    const text = (el.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 80);
                    const aria = (el.getAttribute('aria-label') ?? '').trim();
                    if (!text && !aria) {
                        continue;
                    }
                    const key = text || aria;
                    const nth = seenText.get(key) ?? 0;
                    seenText.set(key, nth + 1);
                    controls.push({
                        tag: el.tagName.toLowerCase(),
                        role: el.getAttribute('role') ?? '',
                        text,
                        aria,
                        nth,
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        w: Math.round(rect.width),
                        h: Math.round(rect.height),
                    });
                }

                return { title: document.title, headings, controls };
            })()`,
        );

        console.log('');
        console.log(`Прозвон экрана (${viewport.width}×${viewport.height}): ${opts.probe}`);
        if (data.headings.length) {
            console.log('\nЗаголовки:');
            for (const h of data.headings) {
                console.log(`  <${h.tag}> ${h.text}`);
            }
        }
        console.log(`\nВидимые кликабельные элементы (${data.controls.length}) — берите text/aria для hotspot дословно:`);
        for (const c of data.controls) {
            const parts = [];
            if (c.text) {
                parts.push(`text: '${c.text}'`);
            }
            if (c.aria) {
                parts.push(`aria: '${c.aria}'`);
            }
            if (c.nth > 0) {
                parts.push(`nth: ${c.nth}`);
            }
            const tagLabel = c.role ? `${c.tag}[${c.role}]` : c.tag;
            console.log(`  - { ${parts.join(', ')} }   (${tagLabel}, ${c.x},${c.y} ${c.w}×${c.h})`);
        }
        console.log('');
    } finally {
        await close();
    }
}

function buildSlideUrl(baseUrl, slideNum) {
    const url = new URL(baseUrl);
    url.searchParams.delete('viewport');
    url.searchParams.set('view', 'presentation');
    url.searchParams.set('slide', String(slideNum));
    return url.toString();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function runLiveAudit(opts, config) {
    let browserHandle;
    try {
        browserHandle = await launchHeadlessBrowser(opts.browser);
    } catch (err) {
        return [{ level: 'error', code: 'L00', msg: err.message }];
    }

    const { cdp, sessionId, close } = browserHandle;
    const liveIssues = [];
    const shotCards = [];
    if (opts.shots) {
        fs.mkdirSync(opts.shots, { recursive: true });
    }

    try {
        await cdp.send(
            'Emulation.setDeviceMetricsOverride',
            { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false },
            sessionId,
        );
        const total = config.slides.length;

        for (let idx = 0; idx < total; idx += 1) {
            const slide = config.slides[idx];
            const slideNum = idx + 1;
            const slideErrors = [];
            const pageErrors = [];

            const offConsole = cdp.on('Runtime.consoleAPICalled', (params, sid) => {
                if (sid === sessionId && params?.type === 'error') {
                    const text = (params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ');
                    pageErrors.push(`console.error: ${text}`);
                }
            });
            const offExc = cdp.on('Runtime.exceptionThrown', (params, sid) => {
                if (sid === sessionId) {
                    const d = params?.exceptionDetails;
                    pageErrors.push(`pageerror: ${d?.exception?.description ?? d?.text ?? 'exception'}`);
                }
            });

            const url = buildSlideUrl(opts.base, slideNum);
            await navigateAndWait(cdp, sessionId, url, 250);

            // Дожидаемся загрузки всех iframe на слайде (актуально при холодном старте Vite)
            const iframeDeadline = Date.now() + 10000;
            while (Date.now() < iframeDeadline) {
                const ready = await cdp
                    .evaluate(
                        sessionId,
                        `(() => {
                            const frames = Array.from(document.querySelectorAll('iframe'));
                            if (frames.length === 0) return true;
                            return frames.every(f => {
                                try {
                                    const doc = f.contentDocument;
                                    return Boolean(
                                        doc && doc.readyState === 'complete' && doc.body &&
                                        (doc.body.innerText ?? '').trim().length > 0
                                    );
                                } catch {
                                    return true;
                                }
                            });
                        })()`,
                    )
                    .catch(() => false);
                if (ready) {
                    break;
                }
                await delay(120);
            }
            // Даём время на runStepsInDoc и 500ms-замер хотспотов
            await delay(850);

            const inspect = await cdp.evaluate(
                sessionId,
                `(() => {
                    const selector = ${JSON.stringify(DEFAULT_HOTSPOT_SELECTOR)};
                    const deck = document.querySelector('[data-presentation-deck="1"]');
                    const overflow = document.documentElement.scrollWidth - window.innerWidth;
                    const iframes = Array.from(document.querySelectorAll('iframe'));

                    const frameReports = iframes.map((iframe, fIdx) => {
                        try {
                            const doc = iframe.contentDocument;
                            if (!doc || !doc.body) {
                                return { idx: fIdx, empty: true, chromeVisible: false, controls: [] };
                            }
                            const textLen = (doc.body.innerText ?? '').trim().length;
                            const chromeEl = doc.querySelector('[data-presentation-chrome]');
                            const chromeVisible = Boolean(
                                chromeEl &&
                                    window.getComputedStyle(chromeEl).display !== 'none' &&
                                    chromeEl.getBoundingClientRect().height > 0,
                            );
                            const controls = Array.from(doc.querySelectorAll(selector))
                                .map(el => {
                                    const r = el.getBoundingClientRect();
                                    return {
                                        text: (el.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 60),
                                        aria: (el.getAttribute('aria-label') ?? '').trim(),
                                        ok: r.width > 0 && r.height > 0,
                                    };
                                })
                                .filter(c => c.ok && (c.text || c.aria))
                                .slice(0, 20);
                            return { idx: fIdx, empty: textLen === 0, chromeVisible, controls };
                        } catch {
                            return { idx: fIdx, empty: false, chromeVisible: false, controls: [], crossOrigin: true };
                        }
                    });

                    const hotspots = Array.from(document.querySelectorAll('[data-hotspot-index]')).map(g => {
                        const rectEl = g.querySelector('rect');
                        const w = rectEl ? Number(rectEl.getAttribute('width') ?? 0) : 0;
                        const h = rectEl ? Number(rectEl.getAttribute('height') ?? 0) : 0;
                        return {
                            index: Number(g.getAttribute('data-hotspot-index')),
                            source: g.getAttribute('data-hotspot-source') ?? 'missing',
                            w,
                            h,
                        };
                    });

                    return {
                        hasDeck: Boolean(deck),
                        slideCountAttr: deck ? Number(deck.getAttribute('data-slide-count')) : 0,
                        overflow,
                        frameReports,
                        hotspots,
                    };
                })()`,
            );

            offConsole();
            offExc();

            for (const err of pageErrors) {
                slideErrors.push({ code: 'L01', msg: `[Слайд ${slideNum} · ${slide.id}] ${err}` });
            }
            if (!inspect.hasDeck) {
                slideErrors.push({
                    code: 'L02',
                    msg: `[Слайд ${slideNum} · ${slide.id}] Не отрендерился [data-presentation-deck="1"] по URL ${url}`,
                });
            }
            if (inspect.overflow > 4) {
                slideErrors.push({
                    code: 'L03',
                    msg: `[Слайд ${slideNum} · ${slide.id}] Горизонтальный перехлёст страницы на ${inspect.overflow}px.`,
                });
            }
            for (const fr of inspect.frameReports) {
                if (fr.empty) {
                    slideErrors.push({
                        code: 'L04',
                        msg: `[Слайд ${slideNum} · ${slide.id}] Пустой экран (iframe #${fr.idx + 1}) — проверьте query и консоль.`,
                    });
                }
                if (fr.chromeVisible) {
                    slideErrors.push({
                        code: 'L05',
                        msg: `[Слайд ${slideNum} · ${slide.id}] Внутри iframe #${fr.idx + 1} видна верхняя шапка презентации — скрывайте её при ?viewport=frame.`,
                    });
                }
            }
            for (const hs of inspect.hotspots) {
                if (hs.source !== 'dom' || hs.w < 10 || hs.h < 10) {
                    const fr = inspect.frameReports[hs.index];
                    const available = (fr?.controls ?? [])
                        .map(c => (c.text ? `'${c.text}'` : `aria:'${c.aria}'`))
                        .slice(0, 10)
                        .join(', ');
                    slideErrors.push({
                        code: 'L06',
                        msg:
                            `[Слайд ${slideNum} · ${slide.id}] Хотспот экрана #${hs.index + 1} не найден в живом DOM ` +
                            `(source=${hs.source}). Реальные элементы на этом экране: ${available || 'не найдено'}`,
                    });
                }
            }

            for (const e of slideErrors) {
                liveIssues.push({ level: 'error', ...e });
            }

            let shotName = '';
            if (opts.shots) {
                shotName = `slide-${String(slideNum).padStart(2, '0')}.png`;
                const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
                fs.writeFileSync(path.join(opts.shots, shotName), Buffer.from(data, 'base64'));
            }

            shotCards.push({
                slideNum,
                id: slide.id,
                kind: slide.kind,
                title: slide.title,
                shotName,
                errors: slideErrors.map(e => `${e.code}: ${e.msg}`),
            });
        }

        if (opts.shots) {
            const html = [
                '<!doctype html><html lang="ru"><head><meta charset="utf-8">',
                `<title>Контакт-лист презентации: ${escapeHtml(config.title)}</title>`,
                '<style>',
                'body{margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f6f8;color:#111;}',
                'h1{margin:0 0 20px;font-size:20px;}',
                '.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;}',
                '.card{background:#fff;border-radius:12px;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,.06);}',
                '.card.fail{outline:2px solid #e53935;}',
                '.meta{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px;}',
                '.badge{padding:2px 8px;border-radius:999px;font-weight:600;font-size:11px;}',
                '.ok{background:#e8f5e9;color:#1b5e20;}',
                '.err{background:#ffebee;color:#b71c1c;}',
                'img{width:100%;height:auto;border-radius:8px;border:1px solid #e6e8ec;display:block;}',
                '.errs{margin:8px 0 0;padding-left:18px;color:#b71c1c;font-size:12px;}',
                '</style></head><body>',
                `<h1>${escapeHtml(config.title)} — ${shotCards.length} слайдов</h1>`,
                '<div class="grid">',
                ...shotCards.map(c => {
                    const ok = c.errors.length === 0;
                    return [
                        `<div class="card ${ok ? '' : 'fail'}">`,
                        '<div class="meta">',
                        `<span><b>${c.slideNum}.</b> ${escapeHtml(c.title)} <code>(${escapeHtml(c.kind)})</code></span>`,
                        `<span class="badge ${ok ? 'ok' : 'err'}">${ok ? 'OK' : `Ошибок: ${c.errors.length}`}</span>`,
                        '</div>',
                        c.shotName ? `<img src="${escapeHtml(c.shotName)}" alt="Слайд ${c.slideNum}" />` : '',
                        c.errors.length ?
                            `<ul class="errs">${c.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` :
                            '',
                        '</div>',
                    ].join('');
                }),
                '</div></body></html>',
            ].join('\n');
            fs.writeFileSync(path.join(opts.shots, 'contact-sheet.html'), html, 'utf8');
        }
    } finally {
        await close();
    }

    return liveIssues;
}

async function main() {
    let opts;
    try {
        opts = parseArgs(process.argv.slice(2));
    } catch (err) {
        console.error(`Ошибка: ${err.message}`);
        printUsage();
        process.exit(1);
    }

    if (opts.help || (!opts.probe && !opts.proto)) {
        printUsage();
        process.exit(opts.help ? 0 : 1);
    }

    if (opts.probe) {
        await runProbe(opts);
        return;
    }

    const protoDir = path.resolve(opts.proto);
    const { issues, config } = runStaticAudit(protoDir);
    let liveIssues = [];

    if (opts.base && config) {
        liveIssues = await runLiveAudit(opts, config);
    }

    const allIssues = [...issues, ...liveIssues];
    const errors = allIssues.filter(i => i.level === 'error');
    const warns = allIssues.filter(i => i.level === 'warn');

    console.log('');
    console.log(`Проверка презентации: ${path.relative(process.cwd(), protoDir) || protoDir}`);
    if (config) {
        console.log(`Слайдов: ${config.slides.length} · Форм-фактор: ${config.defaultDevice}`);
    }
    if (opts.shots && opts.base) {
        console.log(`Скриншоты и контакт-лист: ${path.join(opts.shots, 'contact-sheet.html')}`);
    }

    if (errors.length) {
        console.log(`\nОШИБКИ (${errors.length}) — нужно исправить до сдачи:`);
        for (const e of errors) {
            console.log(`  ✗ [${e.code}] ${e.msg}`);
        }
    }
    if (warns.length) {
        console.log(`\nПРЕДУПРЕЖДЕНИЯ (${warns.length}):`);
        for (const w of warns) {
            console.log(`  ! [${w.code}] ${w.msg}`);
        }
    }
    if (errors.length === 0) {
        console.log(`\n✓ Приёмка пройдена (ошибок: 0, предупреждений: ${warns.length}).`);
    }
    console.log('');

    process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`Сбой проверки: ${err.stack || err.message}`);
    process.exit(1);
});
