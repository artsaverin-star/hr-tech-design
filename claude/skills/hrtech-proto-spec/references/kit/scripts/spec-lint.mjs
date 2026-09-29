#!/usr/bin/env node
/* eslint-disable no-console -- консольная утилита, вывод и есть её результат */
/**
 * ПРОВЕРКА СОСТАВА СПЕКИ — без браузера и дев-сервера, за секунды.
 *
 *   node src/scripts/spec-lint.mjs                  # из папки прототипа: всё
 *   node src/scripts/spec-lint.mjs --stage frames   # только кадры и рецепты (шаг 7, до состава)
 *
 * Читает `src/spec.ts`, `src/spec-sections.ts`, `src/spec-seeds.ts` и `src/spec-snapshots.json`,
 * прогоняет тот же движок раскладки, что рисует «Карту» (`map-board.ts`), и проверяет правила
 * скила hrtech-proto-spec (SKILL.md §0): у каждого экрана есть телефон, один узел — одно место,
 * подписи — событие, а не действие зрителя, ветки ромба — значения ответа, у `?seed=` есть рецепт
 * и рецепты подключены, шаги одной цепочки связаны, в секции есть связи, снимки свежие и без
 * дублей. Каждая строка — что не так и КАК исправить.
 *
 * Итог: «Состав чистый.» (код 0) или список дефектов (код 1). Предупреждения («!») сдачу не
 * блокируют, но каждое нужно либо исправить, либо объяснить в отчёте.
 *
 * Нужен Node ≥ 22.15 (витрина сама требует ≥ 24.15 — запускай тем же node). Импорты `.tsx` в
 * файлах спеки не поддерживаются — манифест и состав должны быть чистым `.ts`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);

if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 15) || !module.registerHooks) {
    console.error(`Node ${process.versions.node}: нужен Node ≥ 22.15 (витрина требует ≥ 24.15) — запусти тем же node, что и витрину.`);
    process.exit(2);
}

if (!process.features.typescript) {
    if (process.env.SPEC_LINT_RERUN) {
        console.error('Node не снимает типы TypeScript даже с --experimental-strip-types — обнови Node до ≥ 22.18.');
        process.exit(2);
    }

    /* Node 22.15–22.17 снимает типы только с флагом — перезапускаемся с ним один раз. */
    const rerun = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', ...process.argv.slice(1)], {
        env: { ...process.env, SPEC_LINT_RERUN: '1' },
        stdio: 'inherit',
    });

    process.exit(rerun.status ?? 1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC = path.join(ROOT, 'src');
const argv = process.argv.slice(2);
const STAGE = argv.includes('--stage') ? argv[argv.indexOf('--stage') + 1] : 'all';
const FULL = STAGE !== 'frames';

/* ---------------- Загрузка .ts без сборщика ---------------- */

const STUB_ASSET = 'data:text/javascript,export default {};';
/* Снимки грузит Vite (`import.meta.glob`) — движку для проверки состава они не нужны. */
const STUB_SNAPSHOTS =
    'data:text/javascript,export const SNAPSHOTS = {}; export const SNAPSHOTS_GENERATED_AT = "";' +
    'export const snapshotFileOf = id => id;';

const resolveHook = (specifier, context, next) => {
    if (/\.(css|scss|png|jpe?g|gif|svg|webp|mp4|woff2?)$/.test(specifier)) {
        return { shortCircuit: true, url: STUB_ASSET };
    }

    if (/(^|\/)spec-snapshots(\.ts)?$/.test(specifier)) {
        return { shortCircuit: true, url: STUB_SNAPSHOTS };
    }

    if ((specifier.startsWith('.') || specifier.startsWith('/')) && !/\.(m?js|ts|json)$/.test(specifier)) {
        for (const tail of ['.ts', '/index.ts', '.tsx']) {
            try {
                return next(specifier + tail, context);
            } catch {
                /* пробуем следующее расширение */
            }
        }
    }

    return next(specifier, context);
};

const loadHook = (url, context, next) => {
    if (url.endsWith('.json')) {
        return { format: 'module', shortCircuit: true, source: `export default ${fs.readFileSync(new URL(url), 'utf8')};` };
    }

    /* Файлы спеки — ES-модули, даже если в package.json прототипа нет "type": "module". */
    if (url.endsWith('.ts')) {
        return next(url, { ...context, format: 'module-typescript' });
    }

    return next(url, context);
};

module.registerHooks({ load: loadHook, resolve: resolveHook });

const importSrc = async file => import(pathToFileURL(path.join(SRC, file)).href);
const readSrc = file => (fs.existsSync(path.join(SRC, file)) ? fs.readFileSync(path.join(SRC, file), 'utf8') : '');

/* ---------------- Отчёт ---------------- */

const defects = [];
const warnings = [];
/** `where` — что проверяли, `what` — что не так, `fix` — как исправить (конкретно). */
const defect = (code, where, what, fix) => defects.push({ code, fix, what, where });
const warning = (code, where, what, fix) => warnings.push({ code, fix, what, where });

/* ---------------- Словари правил ---------------- */

/* `\b` в JS не видит границ кириллических слов — конец слова здесь `(?![\p{L}\p{N}])`. */
const END = '(?![\\p{L}\\p{N}])';
/** Заголовок кадра — событие или результат, а не действие зрителя. */
const VIEWER_ACTION = new RegExp(
    '^((пользователь|юзер)\\s+)?(открыл|открыла|открываем|нажал|нажала|нажимаем|кликнул|кликаем|перешёл|перешел|' +
    `перешла|выбрал|выбрала|ввёл|ввел|ввела|видишь|видим)${END}`,
    'iu',
);
/** Заголовок — имя экрана/компонента вместо события. */
const UI_NOUN = new RegExp(
    '^(экран|шторка|модалка|модальное|попап|поповер|дровер|drawer|modal|popup|меню|панель|страница|форма|окно|' +
    `список|вкладка|главная|главное|раздел|блок|кабинет)${END}`,
    'iu',
);
/**
 * Первое слово — команда или кнопка («Подключить Claude», «Выберите источник»), а не событие.
 * Вопрос окна подтверждения («Удалить чат?») — можно: он и есть содержание шага. Существительные
 * на -ость/-ность/-есть («Приватность встречи») — не команды.
 */
const COMMAND = new RegExp(
    `^(?!(часть|сеть|путь|связь|очередь|область|память|суть|\\p{L}*ость|\\p{L}*есть)${END})\\p{L}+(ть|ться|те|йте)${END}`,
    'iu',
);
/** «Экран 2», «шаг 3» — номер вместо события. */
const NUMBERED = /(экран|шаг|step|screen)\s*\d/iu;
/** Номер в начале названия секции: карта ставит «01» сама, получится «01 · 01 …». */
const LEADING_NUMBER = /^\s*\d{1,3}\s*[.·:)\-–—]?\s+/u;
/** Слова, которых не бывает в подписях спеки: разговор со зрителем, кухня прототипа, заглушки. */
const STOP_WORDS = new RegExp(
    `(?<!\\p{L})(видишь|видим${END}|кликаем|кликнуть|кликни${END}|рецепт|seed${END}|todo|px${END}|css${END}|инстанс|` +
    'плейсхолдер|placeholder|заглушк|lorem)',
    'iu',
);
/** Ветки ромба — значение ответа или дословная кнопка, не «Да/Нет». */
const YES_NO = /^(да|нет|yes|no|ок|ok|true|false)$/i;
/** Частые выдуманные подписи: их правда ли видно на экране — проверяет только `--probe`. */
const GENERIC_BUTTON = /^(далее|назад|закрыть|готово|ок|ok|продолжить|завершить|вернуться.*|перейти.*|открыть)$/i;
/** Текст заготовки комплекта — значит, шаблон не заполнен. */
const TEMPLATE_LEFTOVER = /(Текст кнопки дословно|Что человек видит первым|Что изменилось после нажатия|TODO)/;
/** Тикет — настоящий ключ Startrek, а не заглушка. */
const TICKET = /^[A-Z][A-Z0-9]+-[1-9]\d*$/;
const FAKE_TICKET = /^(TEST|TODO|XXX|ABC|FOO|DEMO|EXAMPLE)-/;

const words = text => text.trim().split(/\s+/).filter(Boolean);
/**
 * Фразы: конец предложения — знак + пробел + заглавная, но не после инициала или сокращения
 * («А. Батталова», «т. е.»).
 */
const sentences = text => {
    let count = 1;
    const pattern = /([\p{L}\p{N}]+)([.!?…])\s+(?=[\p{Lu}«])/gu;

    for (const match of text.matchAll(pattern)) {
        if (match[2] !== '.' || match[1].length > 3) {
            count += 1;
        }
    }

    return text.trim() ? count : 0;
};
const desktopIdOf = id => id.replace(/@m$/, '');
/** Адрес состояния без служебных параметров голой сцены — чтобы сравнить снимок с манифестом. */
const sceneOf = url => {
    const params = new URLSearchParams(String(url).replace(/^[^?]*\?/, ''));

    params.delete('viewport');
    params.delete('motion');

    return [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
};
const paramsOf = url => new URLSearchParams(String(url).replace(/^[^?]*\?/, ''));
const seedOf = url => paramsOf(url).get('seed');
/** Адрес без seed — «с какого экрана стартует рецепт». */
const baseOf = url => {
    const params = paramsOf(url);

    params.delete('seed');

    return [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
};

/* ---------------- Загрузка файлов прототипа ---------------- */

let spec;
let sections;

try {
    spec = await importSrc('spec.ts');
    sections = await importSrc('spec-sections.ts');
} catch (error) {
    console.error(`Не читается src/spec.ts или src/spec-sections.ts: ${error instanceof Error ? error.message : error}`);
    console.error('Проверь tsc; файлы спеки не должны импортировать .tsx и стили.');
    process.exit(2);
}

const FRAMES = spec.SPEC_FRAMES ?? [];
const DECISIONS = spec.SPEC_DECISIONS ?? [];
const MAP_SECTIONS = sections.MAP_SECTIONS ?? [];
const RETIRED = new Set((sections.MAP_RETIRED ?? []).flatMap(group => group.ids));
const NO_MOBILE = sections.MAP_NO_MOBILE ?? {};
const BOARD_META = sections.BOARD_META ?? {};
const frameById = new Map();
const decisionById = new Map(DECISIONS.map(decision => [decision.id, decision]));

/**
 * Рецепты: экспорт SEED_IDS / SEED_RECIPES; не импортируется (модуль тянет .tsx или стили) —
 * ключи верхнего уровня литерала SEED_RECIPES из текста файла, по глубине скобок.
 */
let seedIds = null;
let seedRecipes = null;
const seedsText = readSrc('spec-seeds.ts');

if (seedsText) {
    try {
        const seeds = await importSrc('spec-seeds.ts');

        seedRecipes = seeds.SEED_RECIPES ?? null;
        if (seeds.SEED_IDS) {
            seedIds = new Set(seeds.SEED_IDS);
        } else if (seedRecipes) {
            seedIds = new Set(Object.keys(seedRecipes));
        }
    } catch (error) {
        warning('L05', 'spec-seeds.ts', `не импортируется (${error instanceof Error ? error.message.split('\n')[0] : error})`,
            'рецепты читаю по тексту файла; цепочки рецептов (L18) не проверяются');
    }

    if (!seedIds) {
        const start = seedsText.search(/SEED_RECIPES[^=]*=\s*\{/);

        if (start >= 0) {
            /* Ключи верхнего уровня литерала: считаем скобки, пропуская строки и комментарии. */
            const body = seedsText.slice(seedsText.indexOf('{', start) + 1);
            const keys = new Set();
            let depth = 0;
            let token = '';
            let quote = '';

            for (let index = 0; index < body.length && depth >= 0; index += 1) {
                const char = body[index];

                if (quote) {
                    if (char === '\\') {
                        token += depth === 0 ? char + body[index + 1] : '';
                        index += 1;
                    } else {
                        if (char === quote) {
                            quote = '';
                        }

                        token += depth === 0 ? char : '';
                    }

                    continue;
                }

                if (char === '/' && body[index + 1] === '/') {
                    index = body.indexOf('\n', index);
                    index = index < 0 ? body.length : index;
                    continue;
                }

                if (char === '/' && body[index + 1] === '*') {
                    index = body.indexOf('*/', index + 2) + 1;
                    index = index <= 0 ? body.length : index;
                    continue;
                }

                if (char === '\'' || char === '"' || char === '`') {
                    quote = char;
                    token += depth === 0 ? char : '';
                    continue;
                }

                if ('{[('.includes(char)) {
                    depth += 1;
                } else if ('}])'.includes(char)) {
                    depth -= 1;
                } else if (depth === 0 && char === ':') {
                    const key = token.trim().replace(/^['"]|['"]$/g, '');

                    if (/^[\w@-]+$/.test(key)) {
                        keys.add(key);
                    }

                    token = '';
                    continue;
                } else if (depth === 0 && char === ',') {
                    token = '';
                    continue;
                }

                if (depth === 0 && char !== '\n') {
                    token += char;
                } else if (depth === 0) {
                    token = '';
                }
            }

            seedIds = keys.size ? keys : null;
        }

        if (!seedIds) {
            warning('L05', 'spec-seeds.ts', 'не нашёл ключей SEED_RECIPES', 'проверка «есть ли рецепт» (L05) пропущена');
        }
    }
}

const snapshotsFile = path.join(SRC, 'spec-snapshots.json');
const snapshotsJson = fs.existsSync(snapshotsFile) ? JSON.parse(fs.readFileSync(snapshotsFile, 'utf8')) : {};
const snapshots = snapshotsJson.frames ?? {};
const norm = text => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
/** Весь текст продукта со всех снимков — словарь «что вообще есть в прототипе». */
const ALL_TEXT = Object.values(snapshots).map(entry => entry.text ?? '').join(' ');
/** Тексты кнопок демо-панели (`data-spec-chrome`), собранные генератором снимков. */
const CHROME_LABELS = new Set((snapshotsJson.chrome ?? []).map(norm));
/** Разведка `--explore` (шаг 5): что меняет каждая кнопка. */
const exploreFile = path.join(SRC, 'spec-explore.json');
const explored = fs.existsSync(exploreFile) ? JSON.parse(fs.readFileSync(exploreFile, 'utf8')) : null;
/** Слова-события в заголовках — их на экране и не должно быть («открыт», «выбрана», «подключена»). */
const EVENT_WORDS = /^(откры|выбра|подкл|отмен|сохра|отпра|удале|ошибк|ожида|загру|заполн|измен|добав|появи|закры|включ|выклю|пусто|готов|успеш|прова|приня|отказ|запро|получ|созда|верну|перех|нажат|найде|показ)/;

/** Все исходники прототипа (кроме комплекта) — чтобы проверить подключение рецептов. */
const sourceTexts = (() => {
    const out = [];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory() && !['node_modules', 'scripts', 'assets'].includes(entry.name)) {
            walk(full);
        } else if (/\.(tsx?|mts)$/.test(entry.name) && !['spec-seeds.ts', 'SpecGate.tsx', 'spec-seed-runtime.ts'].includes(entry.name)) {
            out.push(fs.readFileSync(full, 'utf8'));
        }
    });

    walk(SRC);

    return out;
})();

/* ---------------- Кадры ---------------- */

FRAMES.forEach(frame => {
    if (frameById.has(frame.id)) {
        defect('L01', `кадр «${frame.id}»`, 'id повторяется', 'у каждого состояния свой id; повтор — удали или переименуй');
    }

    frameById.set(frame.id, frame);
});

/** Кадры, которые реально стоят на карте (без снятых с карты и телефонов-двойников). */
const onMapIds = new Set(MAP_SECTIONS.flatMap(section => section.lanes.flatMap(lane => lane.nodes)));
const desktopFrames = FRAMES.filter(frame => frame.platform === 'desktop' && !RETIRED.has(frame.id));
const urlOwner = new Map();
const noPhoneAtAll = Boolean(NO_MOBILE['*']);

desktopFrames.forEach(frame => {
    const where = `кадр «${frame.id}»`;
    const phone = frameById.get(`${frame.id}@m`);

    if (!phone && !NO_MOBILE[frame.id] && !noPhoneAtAll) {
        defect('L02', where, 'нет телефона', `заверни кадр в \`...withPhone({ … })\` (появится «${frame.id}@m»); у прототипа нет телефонной вёрстки (--probe пишет «страница шире экрана») — MAP_NO_MOBILE['*'] с причиной`);
    }

    if (phone && phone.url !== frame.url) {
        warning('L02', `${where}@m`, `адрес телефона «${phone.url}» ≠ адрес десктопа «${frame.url}»`, 'телефон открывает тот же адрес — ширину даёт вьюпорт; разные адреса нужны, только если продукт правда разный');
    }

    if (!String(frame.url).startsWith('?')) {
        defect('L03', where, `url «${frame.url}» не начинается с «?»`, 'url — только параметры: «?seed=<id>» или «?<параметр, который читает прототип>&seed=<id>»');
    }

    const seed = seedOf(frame.url);

    if (seed && seed !== frame.id) {
        defect('L04', where, `seed=${seed} не совпадает с id кадра`, `ключ рецепта = id кадра: «seed=${frame.id}»`);
    }

    if (seed && seedIds && !seedIds.has(seed)) {
        defect('L05', where, `нет рецепта «${seed}» в spec-seeds.ts`, `добавь в SEED_RECIPES ключ '${seed}' (пустой {} — если адрес без кликов уже открывает состояние)`);
    }

    if (seed && !seedsText) {
        defect('L05', where, 'в url есть seed, а файла src/spec-seeds.ts нет', 'рецепты — в src/spec-seeds.ts (заготовка кладётся установщиком)');
    }

    if (urlOwner.has(frame.url)) {
        defect('L06', where, `тот же url, что у «${urlOwner.get(frame.url)}»`, 'два кадра с одним адресом дадут одну и ту же картинку: у разных состояний — разные адреса или рецепты');
    } else {
        urlOwner.set(frame.url, frame.id);
    }

    const title = String(frame.title ?? '');

    if (!title.trim()) {
        defect('L07', where, 'пустой title', 'title — событие или результат в 2–4 слова: «Токен не подошёл»');
    } else if (VIEWER_ACTION.test(title)) {
        defect('L07', where, `title «${title}» — действие зрителя`, 'title называет, ЧТО на экране произошло: «Настройки открыты», «Подписка подключена», а не «Открыл…»/«Нажал…»');
    } else if (NUMBERED.test(title)) {
        defect('L07', where, `title «${title}» — номер экрана`, 'назови, что произошло на этом шаге: «Вход через Яндекс ID», «Доступ выдан»');
    } else if (words(title).length > 5) {
        defect('L07', where, `title «${title}» длиннее 5 слов`, 'сократи до 2–4 слов; подробности — в caption');
    } else if (COMMAND.test(title) && !title.trim().endsWith('?')) {
        warning('L07', where, `title «${title}» звучит как кнопка или призыв`, 'назови, что на экране: «Ввод токена Claude», «Выбор источника ответов», «Сервисы не подключены»');
    } else if (UI_NOUN.test(title)) {
        warning('L07', where, `title «${title}» — имя экрана, а не событие`, 'лучше событие по заголовку экрана из --probe: «Настройки открыты», «Токен не подошёл»');
    }

    if (LEADING_NUMBER.test(String(frame.zone ?? ''))) {
        defect('L13', where, `zone «${frame.zone}» начинается с номера`, 'номер секции карта ставит сама: zone = название секции без номера');
    }

    const caption = String(frame.caption ?? '');

    if (!caption.trim()) {
        warning('L09', where, 'нет caption', 'одна фраза: что существенно изменилось на шаге');
    } else if (sentences(caption) > 1 || caption.length > 160) {
        defect('L09', where, `caption длиннее одной фразы (${caption.length} зн.)`, 'одна фраза до 160 знаков: что изменилось; остальное — в CONTEXT.md');
    }

    [['title', title], ['caption', caption]].forEach(([field, text]) => {
        const hit = text.match(STOP_WORDS);

        if (hit) {
            defect('L08', where, `в ${field} слово «${hit[0]}»`, 'подписи — про продукт, без обращения к зрителю («видишь») и без кухни прототипа (рецепт, seed, px, css)');
        }

        if (TEMPLATE_LEFTOVER.test(text)) {
            defect('L14', where, `в ${field} остался текст заготовки`, 'замени текстом своего продукта');
        }
    });

    (frame.next ?? []).forEach(item => {
        const to = typeof item === 'string' ? item : item.to;
        const label = typeof item === 'string' ? '' : item.label ?? '';

        if (!frameById.has(to) && !decisionById.has(to) && !FRAMES.some(other => other.id === to)) {
            defect('L10', where, `переход в «${to}», которого нет в манифесте`, 'to — id кадра или ромба из spec.ts');
        }

        if (TEMPLATE_LEFTOVER.test(label)) {
            defect('L14', where, `label «${label}» из заготовки`, 'подставь дословный текст кнопки из `--probe`');
        }

        if (label && CHROME_LABELS.has(norm(label))) {
            defect('L20', where, `label «${label}» — кнопка демо-панели прототипа`, 'пункт демо-панели — вход ОТДЕЛЬНОЙ истории (дорожка без from или своя секция), переход кнопкой не рисуется: убери этот next');
        }

        if (label && GENERIC_BUTTON.test(label) && !snapshots[frame.id]) {
            warning('L10', where, `label «${label}» — проверь, что такая кнопка правда есть`, `node src/scripts/spec-snapshots.mjs --base <адрес> --probe '${frame.url}' — label только из её списка`);
        }
    });
});

/* Один заголовок у нескольких кадров — карта и «Сценарий» нечитаемы: у каждого шага своё событие. */
const titleOwners = new Map();

desktopFrames.forEach(frame => {
    const key = norm(frame.title);

    if (key) {
        titleOwners.set(key, [...(titleOwners.get(key) ?? []), frame.id]);
    }
});
titleOwners.forEach((ids, key) => {
    if (ids.length > 1) {
        defect('L07', `кадры ${ids.map(id => `«${id}»`).join(', ')}`, `одинаковый title «${key}»`,
            'у каждого кадра — своё событие: что на этом шаге случилось иначе («Выдача закончилась», «Пустая выдача», «Поиск идёт долго»), а не общий заголовок страницы');
    }
});

/* Рецепты подключены? Кадры с seed есть, а запустить рецепт некому — все их снимки покажут старт. */
if (desktopFrames.some(frame => seedOf(frame.url)) &&
    !sourceTexts.some(text => /<SpecGate[\s>]/.test(text) || /applySpecSeed\s*\(/.test(text))) {
    defect('L17', 'src/', 'рецепты не подключены: нет ни <SpecGate> в src/index.tsx, ни вызова applySpecSeed в модели',
        'шаг 4 — обёртка <SpecGate title="…"> внутри PrototypeProviders (установщик вписывает её сам); вариант А — шапка spec-seeds.ts');
}

/* ---------------- Ромбы ---------------- */

DECISIONS.filter(decision => !RETIRED.has(decision.id)).forEach(decision => {
    const where = `ромб «${decision.id}»`;

    if (!String(decision.question ?? '').trim().endsWith('?')) {
        warning('L11', where, `вопрос «${decision.question}» без «?»`, 'ромб — один вопрос: «Токен подошёл?»');
    }

    if ((decision.branches ?? []).length < 2) {
        defect('L11', where, 'меньше двух веток', 'у развилки минимум два исхода; одна ветка — это не ромб, а обычный переход `next`');
    }

    (decision.branches ?? []).forEach(branch => {
        if (!frameById.has(branch.to) && !decisionById.has(branch.to)) {
            defect('L11', where, `ветка ведёт в «${branch.to}», которого нет`, 'to — id кадра или ромба');
        }

        if (branch.label && YES_NO.test(branch.label.trim())) {
            defect('L11', where, `ветка «${branch.label}»`, 'ветка — значение ответа: система решает → событие строчными («токен не подошёл», kind: \'system\'); человек решает → дословная кнопка («Разрешить»)');
        }
    });

    if (FULL && !onMapIds.has(decision.id)) {
        defect('L12', where, 'не стоит ни в одной дорожке', `поставь ромб в дорожку СРАЗУ за кадром, на котором решают; ветки — дорожками с \`from: '${decision.id}'\``);
    }
});

/* ---------------- Состав ---------------- */

/** Узлы, между которыми на карте будет связь: переходы, соседи дорожек, ветки. */
const linked = new Set();
const link = (a, b) => linked.add(`${a}→${b}`);

FRAMES.forEach(frame => (frame.next ?? []).forEach(item => link(frame.id, typeof item === 'string' ? item : item.to)));
DECISIONS.forEach(decision => (decision.branches ?? []).forEach(branch => link(decision.id, branch.to)));

if (FULL) {
    const seen = new Map();

    MAP_SECTIONS.forEach(section => {
        const where = `секция «${section.title}»`;
        const sectionIds = new Set(section.lanes.flatMap(lane => lane.nodes));

        if (LEADING_NUMBER.test(String(section.title ?? ''))) {
            defect('L13', where, 'название начинается с номера', 'номер «01» карта ставит сама — иначе будет «01 · 01 …»; убери его из title секции и из zone кадров');
        }

        if (!String(section.subtitle ?? '').includes('→')) {
            defect('L13', where, 'subtitle без «→»', 'subtitle — путь словами через «→»: «Настройки → Claude → токен → подписка подключена»');
        }

        const hit = String(section.subtitle ?? '').match(STOP_WORDS);

        if (hit) {
            defect('L08', where, `в subtitle слово «${hit[0]}»`, 'путь — про продукт, без «видишь» и кухни прототипа');
        }

        section.lanes.forEach((lane, laneIndex) => {
            const laneWhere = `${where}, дорожка «${lane.title ?? laneIndex + 1}»`;

            if (!String(lane.title ?? '').trim()) {
                defect('L12', laneWhere, 'у дорожки нет title', `в оглавлении будет «Дорожка ${laneIndex + 1}»: дай заголовок-исход в 1–4 слова (первая — «Основной путь»)`);
            } else if (words(lane.title).length > 4) {
                warning('L12', laneWhere, 'заголовок дорожки длиннее 4 слов', 'событие или исход в 1–4 слова: «Токен не подошёл»');
            }

            if (!lane.note && laneIndex > 0) {
                warning('L12', laneWhere, 'у ветки нет note', 'одна строка «Когда …»: когда человек попадает на эту дорожку');
            }

            if (lane.note && !/^когда/i.test(lane.note.trim())) {
                warning('L12', laneWhere, `note «${lane.note}» не начинается с «Когда»`, 'note — одна строка «Когда …»: «Когда токен не подошёл»');
            }

            if (lane.cases && lane.nodes.length < 2) {
                defect('L12', laneWhere, '`cases: true` при одном экране', 'cases — только для двух и больше взаимоисключающих случаев; один исход — обычная дорожка с `from` без `cases`');
            }

            if (lane.from && !sectionIds.has(lane.from)) {
                defect('L12', laneWhere, `from «${lane.from}» не стоит в этой секции`, 'ветка растёт из узла ЭТОЙ секции; вход из другого сценария показывает ссылка «→ 01.2» — её рисует `next`, дорожка не нужна');
            }

            if (laneIndex === 0 && lane.from) {
                warning('L12', laneWhere, 'первая дорожка с `from`', 'первая дорожка секции — основной путь, без `from`');
            }

            /* Ветка входит в первый узел; гребёнка разбора — в каждый случай. */
            if (lane.from) {
                (lane.cases ? lane.nodes : lane.nodes.slice(0, 1)).forEach(id => link(lane.from, id));
            }

            /* История без from, вход в которую — кнопка демо-панели: у неё свой вход (как рисует карта). */
            const head = frameById.get(lane.nodes[0]);
            const headRecipe = head && seedRecipes?.[seedOf(head.url)];

            if (!lane.from && headRecipe?.clicks?.some(step => step.text && CHROME_LABELS.has(norm(step.text)))) {
                link('entry', lane.nodes[0]);
            }

            lane.nodes.forEach((id, nodeIndex) => {
                if (nodeIndex > 0 && !lane.cases) {
                    link(lane.nodes[nodeIndex - 1], id);
                }

                if (!frameById.has(id) && !decisionById.has(id)) {
                    defect('L12', laneWhere, `узел «${id}» не найден в spec.ts`, 'в дорожках — только id из SPEC_FRAMES / SPEC_DECISIONS (без «@m»)');

                    return;
                }

                if (id.endsWith('@m')) {
                    defect('L12', laneWhere, `в дорожке телефон «${id}»`, 'телефон встаёт рядом с десктопом сам — в дорожках только десктопные id');
                }

                if (seen.has(id)) {
                    defect('L12', laneWhere, `узел «${id}» уже стоит в «${seen.get(id)}»`, 'один экран — одно место на карте. Общий вход стоит в одной секции; другая секция начинается со СЛЕДУЮЩЕГО экрана, а связь покажет ссылка «→ 01.2» из `next`');
                } else {
                    seen.set(id, section.title);
                }

                const frame = frameById.get(id);

                if (frame && frame.zone !== section.title) {
                    warning('L12', `кадр «${id}»`, `zone «${frame.zone}» ≠ секция «${section.title}»`, 'zone кадра = title секции, где он стоит, дословно (по zone кадр попадает в страховочную секцию, если выпал из состава; в Figma по нему строятся главы)');
                }
            });
        });

        /* Секция без связей: кадр, в который ничто не ведёт и из которого ничто не выходит, — это
           столбик отдельных экранов, пройти его нельзя. Голова истории с входом извне — не изолирована. */
        const ids = [...sectionIds].filter(id => frameById.has(id) && !RETIRED.has(id));
        const isolated = ids.filter(id => ![...linked].some(pair => {
            const [a, b] = pair.split('→');

            return a === id || b === id;
        }));

        if (ids.length >= 2 && isolated.length) {
            defect('L19', where, `экраны без единой связи: ${isolated.map(id => `«${id}»`).join(', ')}`, 'шаги одного пути — соседи одной дорожки, у кадра `next: [{ to, label: <кнопка> }]`; отдельная история — только с ДРУГИМ входом, и в неё ведёт `next` из экрана, где этот вход');
        }

        if (ids.length === 1) {
            warning('L19', where, 'секция из одного экрана', 'это не сценарий: поставь экран в соседнюю секцию дорожкой или допиши путь продукта (что человек делает дальше)');
        }
    });

    desktopFrames.forEach(frame => {
        if (!onMapIds.has(frame.id)) {
            defect('L12', `кадр «${frame.id}»`, 'не стоит на карте и не снят', 'поставь в дорожку своей секции или перечисли в MAP_RETIRED с причиной');
        }
    });

    /*
     * Цепочки рецептов: рецепт B = рецепт A (хотя бы с одним кликом) + клики ПРОДУКТА → B — следующий
     * шаг после A. Пустой рецепт старта — не родитель (иначе все истории с разными входами стали бы
     * «цепочкой»), клик по демо-панели открывает новую историю, первый вход — отдельный старт.
     */
    if (seedRecipes) {
        const clicksKey = step => JSON.stringify([step.text ?? '', step.type ?? null, step.scroll ?? null, step.only ?? null]);
        const recipeFrames = desktopFrames.filter(frame => seedOf(frame.url) && onMapIds.has(frame.id));

        recipeFrames.forEach(later => {
            const laterRecipe = seedRecipes[seedOf(later.url)];

            if (!laterRecipe?.clicks?.length || laterRecipe.actions) {
                return;
            }

            const laterKeys = laterRecipe.clicks.map(clicksKey);
            const parents = recipeFrames
                .filter(other => other !== later && baseOf(other.url) === baseOf(later.url))
                .map(other => ({ frame: other, recipe: seedRecipes[seedOf(other.url)] }))
                .filter(({ recipe }) => recipe && !recipe.actions && (recipe.clicks ?? []).length > 0 &&
                    Boolean(recipe.firstVisit) === Boolean(laterRecipe.firstVisit) &&
                    recipe.clicks.length < laterKeys.length &&
                    recipe.clicks.every((step, index) => clicksKey(step) === laterKeys[index]));

            if (!parents.length) {
                return;
            }

            const longest = Math.max(...parents.map(({ recipe }) => recipe.clicks.length));
            const closest = parents.filter(({ recipe }) => recipe.clicks.length === longest);
            const next = laterRecipe.clicks[longest];

            if (next?.text && CHROME_LABELS.has(norm(next.text))) {
                return;
            }

            const connected = closest.some(({ frame }) => linked.has(`${frame.id}→${later.id}`) ||
                DECISIONS.some(decision => linked.has(`${frame.id}→${decision.id}`) && linked.has(`${decision.id}→${later.id}`)));

            if (!connected) {
                const parent = closest[0].frame.id;

                defect('L18', `кадр «${later.id}»`, `его рецепт продолжает рецепт «${parent}», а связи между ними нет`,
                    `поставь «${later.id}» в дорожку сразу за «${parent}» и добавь у «${parent}» next: [{ to: '${later.id}', label: '${next?.text ?? '…'}' }]`);
            }
        });
    } else if (seedsText) {
        warning('L18', 'spec-seeds.ts', 'цепочки рецептов не проверены', 'экспортируй рецепты: `export const SEED_RECIPES = { … }` (как в заготовке)');
    }

    (sections.MAP_RETIRED ?? []).forEach(group => {
        if (!String(group.reason ?? '').trim()) {
            defect('L12', `MAP_RETIRED ${group.ids.join(', ')}`, 'нет причины', 'одна фраза: почему продукт от этого отказался');
        }
    });

    Object.entries(NO_MOBILE).forEach(([id, reason]) => {
        if (String(reason).trim().length < 10) {
            defect('L02', `MAP_NO_MOBILE «${id}»`, 'причина не объяснена', 'одна фраза, почему у экрана нет телефона: «Прототип только десктопный (1440)»; «нет времени» — не причина');
        }
    });

    Object.entries(BOARD_META).forEach(([key, value]) => {
        if (TEMPLATE_LEFTOVER.test(String(value))) {
            defect('L14', `BOARD_META.${key}`, 'не заполнено', 'тикет, ссылка и цель продукта из запроса пользователя');
        }
    });

    const ticket = String(BOARD_META.ticket ?? '');

    if (ticket && (!TICKET.test(ticket) || FAKE_TICKET.test(ticket))) {
        defect('L14', 'BOARD_META.ticket', `«${ticket}» — не настоящий тикет`, 'ключ тикета из запроса пользователя (HRTECHDESIGN-4612); тикета нет — пустая строка и в ticket, и в ticketUrl');
    }

    if (ticket && !String(BOARD_META.ticketUrl ?? '').endsWith(ticket)) {
        defect('L14', 'BOARD_META.ticketUrl', 'ссылка не ведёт на ticket', `https://st.yandex-team.ru/${ticket}`);
    }

    if (/^готов/i.test(String(BOARD_META.status ?? ''))) {
        warning('L14', 'BOARD_META.status', `«${BOARD_META.status}»`, 'статус «Готово» ставит владелец, приняв спеку; до этого — «Черновик»');
    }

    const header = readSrc('spec-sections.ts');
    /* Блок «НЕ ПОКАЗЫВАЕМ»: от метки до конца шапки-комментария; из него — только «цитаты» с причинами. */
    const hiddenStart = header.search(/НЕ ПОКАЗЫВАЕМ/i);
    const hiddenBlock = hiddenStart < 0 ? '' : header.slice(hiddenStart, header.indexOf('*/', hiddenStart) >>> 0);
    const hiddenItems = [...hiddenBlock.matchAll(/«([^»]+)»\s*[—–-]?\s*([^;«\n]*)/g)]
        .map(match => ({ reason: norm(match[2]), text: norm(match[1]) }));
    const frameIds = new Set(FRAMES.map(frame => frame.id));

    if (!explored) {
        defect('L22', 'src/spec-explore.json', 'разведка не сохранена', 'шаг 5: node src/scripts/spec-snapshots.mjs --base <адрес> --explore \'?\' (и для каждого нового экрана --explore \'?seed=<id>\')');
    } else {
        /* Каждая кнопка, которая меняет ВИД, — кадр (клик в рецепте), переход или строка «НЕ ПОКАЗЫВАЕМ». */
        const used = [
            ...Object.values(seedRecipes ?? {})
                .flatMap(recipe => (recipe.clicks ?? []).flatMap(step => [step.text, step.type])),
            ...FRAMES.flatMap(frame => (frame.next ?? []).map(item => (typeof item === 'string' ? '' : item.label))),
        ].map(norm).filter(Boolean);
        const shown = text => used.some(item => item.startsWith(norm(text)) || norm(text).startsWith(item));
        const hiddenOf = text => hiddenItems.find(item => item.text === norm(text) || norm(text).startsWith(item.text));
        /*
         * Окно или меню на ЭТОЙ ЖЕ странице — это кадр, а не «другой раздел». Спрятать его можно, только
         * если он повторяет уже показанный кадр («повторяет «<id>»»), уводит вне прототипа или это ⚙.
         */
        const validHide = (item, entry) => !/^(открылось|появились кнопки)/.test(item.effect) || item.chrome ||
            /вне прототипа/.test(entry.reason) ||
            [...entry.reason.matchAll(/повторяет\s*«?([\w@-]+)/g)].some(match => frameIds.has(match[1]));
        const name = item => `«${item.select ? `${item.select} = ${item.text}` : item.text}»`;

        Object.entries(explored).forEach(([start, { report = [] }]) => report
            .filter(item => item.kind === 'view' && !shown(item.text))
            .forEach(item => {
                const entry = hiddenOf(item.text);

                if (!entry) {
                    defect('L22', `разведка ${start}`, `${name(item)} меняет вид (${item.effect}), но её нет ни в одном рецепте`,
                        'сделай кадр (рецепт с этим кликом) или запиши в шапку spec-sections.ts: «НЕ ПОКАЗЫВАЕМ: «кнопка» — причина»');
                } else if (!validHide(item, entry)) {
                    defect('L22', `разведка ${start}`, `${name(item)} ${item.effect} на этой же странице — это кадр, «${entry.reason || 'без причины'}» не причина`,
                        `рецепт { text: '${item.text}' } и кадр в дорожке за экраном, где кнопка; спрятать можно, только если повторяет существующий кадр («повторяет «<id>»») или уводит вне прототипа`);
                }
            }));

        /* Спека без единого перехода, хотя разведка нашла, что показать. */
        const transitions = FRAMES.some(frame => (frame.next ?? []).length) || DECISIONS.length ||
            MAP_SECTIONS.some(section => section.lanes.some(lane => lane.from || lane.nodes.length > 1));
        const views = Object.values(explored).flatMap(({
            report = [],
        }) => report).filter(item => item.kind === 'view');

        if (!transitions && views.length) {
            defect('L19', 'спека', `ни одного перехода, а разведка нашла ▶ ${views.slice(0, 3).map(name).join(', ')}`,
                'каждое ▶ — кадр в дорожке за экраном, где кнопка, с next и дословной кнопкой');
        }
    }

    /* Обещания описания, которых нет на экранах, не должны утекать в подписи (они — в «НЕ ПОКАЗЫВАЕМ»). */
    const manifestFile = path.join(ROOT, 'manifest.json');
    const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
    /* Обещание прототипа — его title и description (короткие): их слова без экрана — «утечка». */
    const described = `${manifest.title ?? ''} ${manifest.description ?? ''}`.toLowerCase();

    if (ALL_TEXT) {
        const leaked = text => [...new Set((String(text).toLowerCase().match(/\p{L}{5,}/gu) ?? [])
            .filter(word => !EVENT_WORDS.test(word) && described.includes(word.slice(0, 5)) &&
                !ALL_TEXT.includes(word.slice(0, 4))))];

        desktopFrames.filter(frame => onMapIds.has(frame.id)).forEach(frame => {
            const words = leaked(`${frame.title ?? ''} ${frame.caption ?? ''}`);

            if (words.length) {
                defect('L21', `кадр «${frame.id}»`, `в подписи слова из описания прототипа, которых нет ни на одном экране: «${words.join('», «')}»`,
                    'подпись — только про то, что видно; обещание описания без экрана — строка «НЕ ПОКАЗЫВАЕМ: «…» — нет в прототипе»');
            }
        });
        MAP_SECTIONS.forEach(section => {
            const words = leaked(`${section.title} ${section.subtitle}`);

            if (words.length) {
                defect('L21', `секция «${section.title}»`, `в названии или пути слова из описания, которых нет на экранах: «${words.join('», «')}»`,
                    'название и путь — словами экранов; обещание без экрана — в «НЕ ПОКАЗЫВАЕМ»');
            }
        });
    }

    if (/\(заполнить\)|открыл … → нажал …/.test(header)) {
        defect('L14', 'spec-sections.ts', 'в шапке не записан путь словами', 'шаг 5: цепочка «вход → кнопка → экран → …» из разведки и список состояний из CONTEXT.md вместо «(заполнить)»');
    }

    if (seedIds) {
        const used = new Set(desktopFrames.map(frame => seedOf(frame.url)));

        [...seedIds].filter(id => !used.has(id) && !RETIRED.has(id)).forEach(id => {
            warning('L05', `рецепт «${id}»`, 'ни один кадр на карте его не открывает', `удали рецепт или поставь кадр \`url: '…seed=${id}'\``);
        });
    }
}

/* ---------------- Снимки ---------------- */

if (FULL && Object.keys(snapshots).length) {
    const mapFrames = FRAMES.filter(frame =>
        onMapIds.has(desktopIdOf(frame.id)) && !RETIRED.has(desktopIdOf(frame.id)));

    mapFrames.forEach(frame => {
        const entry = snapshots[frame.id];
        const where = `кадр «${frame.id}»`;
        const rerun = 'перезапусти node src/scripts/spec-snapshots.mjs --base <адрес> --prune';

        if (!entry) {
            defect('L16', where, 'нет снимка', `${rerun} (кадр появился после съёмки или не снялся)`);

            return;
        }

        (entry.missing ?? []).forEach(item => {
            defect('L16', where, `на снимке нет кнопки «${item.query}» (переход в «${item.to}»)`, `label — ДОСЛОВНЫЙ текст кнопки: node src/scripts/spec-snapshots.mjs --base <адрес> --probe '${frameById.get(desktopIdOf(frame.id))?.url ?? '?…'}'`);
        });

        Object.entries(entry.anchors ?? {}).filter(([, anchor]) => anchor.weak).forEach(([to, anchor]) => {
            warning('L16', where, `«${anchor.query}» (переход в «${to}») нашёлся текстом, а не кнопкой`, 'label должен быть текстом КНОПКИ, по которой переходят; системный переход — kind: \'system\' без label');
        });

        if (entry.url === undefined) {
            defect('L16', where, 'снимок снят старым генератором', rerun);
        } else if (sceneOf(entry.url) !== sceneOf(frame.url)) {
            defect('L16', where, `снимок снят с другого адреса (${entry.url})`, `${rerun} — снимки старше манифеста`);
        }

        if (entry.seed && !['ready', 'none'].includes(entry.seed)) {
            defect('L16', where, `рецепт не доиграл при съёмке (${entry.seed})`, 'почини рецепт по сообщению генератора и перезапусти съёмку');
        }

        const phone = frame.id.endsWith('@m');

        if (entry.dup?.same && phone && !snapshots[desktopIdOf(frame.id)]?.dup?.same) {
            defect('L16', where, `телефон одинаков с «${entry.dup.id}» при разных десктопах`, `у одного из кадров телефон не нужен: MAP_NO_MOBILE['${desktopIdOf(frame.id)}'] с причиной`);
        } else if (entry.dup?.same && !phone) {
            defect('L16', where, `снимок одинаков с «${entry.dup.id}»`, 'это один экран: убери лишний кадр или допиши рецепт до видимого отличия');
        } else if (entry.dup?.sameView && !phone) {
            defect('L16', where, `тот же вид, что у «${entry.dup.id}»: отличаются только отметки или значения`, 'это ОДИН кадр — убери лишний (caption тут не спасает); отдельный кадр — только если открылось окно, меню или сменился текст');
        } else if (entry.dup && !phone) {
            warning('L16', where, `почти одинаков с «${entry.dup.id}» (${(entry.dup.diff * 100).toFixed(2)} %)`, 'отличие существенное (тумблер, статус, новый текст) — назови его в caption; то же состояние — убери кадр');
        }

        if (entry.tooltip) {
            defect('L16', where, `на снимке висит тултип «${entry.tooltip}»`, 'у последнего шага рецепта поставь blur: true и перезапусти съёмку');
        }

        /* Подписи — словами продукта: понятие, которого нет НИ НА ОДНОМ экране прототипа (обещание
           из описания, название тикета), — выдумано. Обобщающие слова («История», «Ход задачи») есть
           где-то на экранах и проходят. */
        if (!phone && entry.text) {
            const own = frameById.get(frame.id);
            const stems = text => String(text).toLowerCase().match(/\p{L}{5,}/gu) ?? [];
            /* Основа — 4 буквы: «Марсе» находит «Марс», «подошёл» — «подойдёт» не находит, и это нормально. */
            const alien = stems(own?.title ?? '').filter(word => !EVENT_WORDS.test(word) && !ALL_TEXT.includes(word.slice(0, 4)));

            if (alien.length) {
                warning('L21', where, `в title слова, которых нет ни на одном экране: «${alien.join('», «')}»`, 'заголовок — словами продукта со снимков; обещание описания, которого в прототипе нет, — в «НЕ ПОКАЗЫВАЕМ»');
            }

            (String(own?.caption ?? '').match(/«([^»]{2,60})»/g) ?? []).map(item => item.slice(1, -1)).forEach(quote => {
                if (CHROME_LABELS.has(norm(quote))) {
                    defect('L20', where, `в caption «${quote}» — кнопка демо-панели`, 'подписи — про продукт; пункт демо-панели — это вход сценария, а не текст экрана');
                } else if (!entry.text.includes(quote.toLowerCase())) {
                    warning('L21', where, `в caption цитата «${quote}», которой нет на экране`, 'в кавычках — только дословный текст со снимка');
                }
            });
        }

        if (entry.overflowX && !noPhoneAtAll && !NO_MOBILE[desktopIdOf(frame.id)]) {
            defect('L02', where, 'телефон — обрезанный десктоп (страница шире 375)', 'у прототипа нет телефонной вёрстки: убери withPhone и запиши MAP_NO_MOBILE[\'*\'] с причиной');
        }
    });
}

/* ---------------- Движок карты ---------------- */

if (FULL) {
    const engineWarnings = [];
    const originalWarn = console.warn;

    console.warn = (...parts) => {
        const text = parts.join(' ');

        if (text.startsWith('[spec map]')) {
            engineWarnings.push(text.replace('[spec map] ', ''));
        } else {
            originalWarn(...parts);
        }
    };

    try {
        const engine = await importSrc('map-board.ts');

        engine.buildBoard();
    } catch (error) {
        defect('L15', 'map-board.ts', `движок карты упал: ${error instanceof Error ? error.message : error}`, 'почини состав по сообщению; движок не правь');
    } finally {
        console.warn = originalWarn;
    }

    [...new Set(engineWarnings)].forEach(text => defect('L15', 'движок карты', text, 'поправь состав spec-sections.ts по сообщению'));
}

/* ---------------- Итог ---------------- */

const print = (mark, list) => list.forEach(item => {
    console.log(`${mark} ${item.code} ${item.where}: ${item.what}`);
    console.log(`     → ${item.fix}`);
});

console.log(
    `Кадров: ${FRAMES.length} (десктоп ${desktopFrames.length}), ромбов: ${DECISIONS.length}, секций: ${MAP_SECTIONS.length}, ` +
    `рецептов: ${seedIds ? seedIds.size : '—'}${FULL ? '' : ' · проверка только кадров (--stage frames)'}`,
);
console.log('');
print('✗', defects);
print('!', warnings);

if (defects.length) {
    console.log(`\nДефектов: ${defects.length}, предупреждений: ${warnings.length}. Исправь дефекты и запусти снова.`);
    process.exitCode = 1;
} else {
    const done = FULL ? 'Состав чистый.' : 'Кадры чистые.';

    console.log(`${defects.length + warnings.length ? '\n' : ''}${done}${warnings.length ? ` Предупреждений: ${warnings.length} — исправь или объясни в отчёте.` : ''}`);
}
