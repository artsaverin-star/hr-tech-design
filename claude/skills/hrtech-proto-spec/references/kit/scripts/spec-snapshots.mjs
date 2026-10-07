#!/usr/bin/env node
/* eslint-disable no-console -- консольная утилита, вывод и есть её результат */
/**
 * Снимки кадров для «Карты сценариев» + координаты якорей переходов + разведка экранов.
 *
 * Снимки: открывает в headless Chrome каждый кадр манифеста (адреса берёт у самого прототипа —
 * `window.__specBoard` на странице `?spec=map`), меряет, где на экране стоит элемент, по
 * которому нажимают в переходе, и сохраняет:
 *   - `assets/spec/<id>.webp` — снимок в ПОЛНОМ разрешении вьюпорта (1440×860 / 375×812): на карте
 *     он стоит в половину (720×430 / 188×406), то есть с плотностью 2× — чётко на ретине;
 *   - `src/spec-snapshots.json` — файлы, якоря, статус рецепта, дубли, вылет телефона.
 * Прогон падает (код 1), если рецепт сломан или не подключён, кадр не снялся, два кадра
 * одинаковы или телефон — обрезанный десктоп. Лист-сетка подписывает всё это красным.
 *
 * Запуск (нужен дев-сервер витрины), из папки прототипа:
 *   node src/scripts/spec-snapshots.mjs --base <адрес>                    # все кадры
 *   node src/scripts/spec-snapshots.mjs --base <адрес> --prune --sheet /tmp/spec-sheet.png
 *   node src/scripts/spec-snapshots.mjs --base <адрес> --only home,home@m
 *   node src/scripts/spec-snapshots.mjs --base <адрес> --sheet /tmp/sheet.png --sheet-only
 *
 * Разведка (кадры манифеста не нужны — работает с первого шага):
 *   --probe '?'                                  ДОСЛОВНЫЕ кнопки, поля и заголовки на 1440 и 375 + снимки
 *   --probe '?seed=<id>'                         то же после рецепта — проверка шага
 *   --probe '?' --click 'Меню' --fill 'Почта=a@b.c' --scroll bottom
 *                                                пройти путь и получить «Готовый рецепт»
 *   --explore '?'                                нажать по очереди каждую кнопку экрана и сказать, что меняет
 *   --explore '?' --explore-limit 120            то же с другим лимитом нажатий (по умолчанию 60)
 *   --wiring                                     подключены ли вид спеки и рецепты (шаг 4 регламента)
 *   --controls <id>,<id>                         кнопки кадра манифеста — подобрать `anchor`
 *
 * Библиотек нет намеренно: прямой CDP через глобальный WebSocket Node ≥ 22.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'assets', 'spec');
const OUT_JSON = path.join(ROOT, 'src', 'spec-snapshots.json');
const VIEWPORT = { desktop: { height: 860, width: 1440 }, mobile: { height: 812, width: 375 } };
/**
 * Масштаб МЕСТА снимка на карте (720×430 при 1440×860) и плотность картинки. Снимок пишется в
 * полном разрешении вьюпорта — вдвое плотнее своего места: «1:1 с картой» на ретине пикселило
 * (владелец, 29.09). WebP держит вес: кадр интерфейса — десятки килобайт.
 */
const SCALE = 0.5;
const DENSITY = 2;
const FORMAT = 'webp';
const QUALITY = 82;
const SETTLE_MS = 1400;
/** Доля отличающихся пикселей: меньше SAME — один и тот же экран, меньше NEAR (в одной секции) — почти дубль. */
const SAME = 0.0001;
const NEAR = 0.005;

const args = parseArgs(process.argv.slice(2));
const BASE = (args.base ?? `https://prototipnitsa.local.yandex-team.ru:3000/prototype-builds/${MANIFEST.slug}/`).replace(/\/?$/, '/');
const CHROME = args.chrome ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ONLY = args.only ? new Set(String(args.only).split(',').map(item => item.trim())) : null;
/** `--controls id,id` — не снимать, а перечислить видимые кнопки/поля кадра (подбор `anchor`). */
const CONTROLS = args.controls ? new Set(String(args.controls).split(',').map(item => item.trim())) : null;
/**
 * Шаги разведки по порядку: `--click '<текст>'`, `--fill '<placeholder>=<значение>'`,
 * `--scroll bottom|top|<px>[:<текст области>]` — сколько угодно раз. Это черновик рецепта:
 * прошёл путь в `--probe` — перенеси «Готовый рецепт» в `clicks` один в один.
 */
const PROBE_STEPS = process.argv.slice(2).flatMap((token, index, list) => {
    const value = list[index + 1];

    if (token === '--click' && value) {
        return [{ text: value }];
    }

    if (token === '--fill' && value && value.includes('=')) {
        return [{ text: value.slice(0, value.indexOf('=')), type: value.slice(value.indexOf('=') + 1) }];
    }

    if (token === '--scroll' && value) {
        const [amount, ...area] = value.split(':');
        const scroll = amount === 'top' || amount === 'bottom' ? amount : Number(amount);

        if (scroll === 'top' || scroll === 'bottom' || Number.isFinite(scroll)) {
            return [area.length ? { scroll, text: area.join(':') } : { scroll }];
        }
    }

    return [];
});

function parseArgs(argv) {
    const result = {};

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (!token.startsWith('--')) {
            continue;
        }

        const next = argv[index + 1];

        if (!next || next.startsWith('--')) {
            result[token.slice(2)] = true;
        } else {
            result[token.slice(2)] = next;
            index += 1;
        }
    }

    return result;
}

const fileOf = id => `${id.replace('@m', '--m')}.${FORMAT}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sectionOf = code => String(code ?? '').split('.')[0];

/**
 * Кадр с рецептом (`?seed=`, spec-seeds.ts) проигрывает путь пользователя после загрузки —
 * ждём `data-spec-seed="ready"`, иначе снимок поймает середину пути. Атрибута нет вовсе через
 * 5 с — рецепты не подключены (некому вызвать `applySpecSeed`): это `absent`, а не «долго».
 */
async function waitSeed(page, url) {
    if (!new URL(url).searchParams.has('seed')) {
        return 'none';
    }

    for (let attempt = 0; attempt < 100; attempt += 1) {
        const state = await page.evaluate('document.documentElement.dataset.specSeed || ""');

        if (state === 'ready' || state === 'failed') {
            return state;
        }

        if (!state && attempt >= 25) {
            return 'absent';
        }

        await sleep(200);
    }

    return 'timeout';
}

const SEED_ABSENT = 'рецепты не подключены: в адресе seed, а applySpecSeed никто не вызвал — ' +
    'подключи SpecGate (шаг 4) или вариант А в модели (шапка src/spec-seeds.ts)';

/** Человеческая причина сбоя рецепта для печати. */
async function seedProblem(page, state) {
    if (state === 'failed') {
        return `рецепт сломан — ${await page.evaluate('document.documentElement.dataset.specSeedReason || ""')}`;
    }

    if (state === 'absent') {
        return SEED_ABSENT;
    }

    if (state === 'timeout') {
        return 'рецепт не доиграл за 20 с (запущен, но не закончил: увеличь wait или проверь шаги)';
    }

    return '';
}

/* ---------------- CDP ---------------- */

class Cdp {
    constructor(socket) {
        this.socket = socket;
        this.nextId = 0;
        this.pending = new Map();
        this.listeners = new Set();
        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data));

            if (message.id && this.pending.has(message.id)) {
                const { reject, resolve } = this.pending.get(message.id);

                this.pending.delete(message.id);

                if (message.error) {
                    reject(new Error(`${message.error.message} (${message.error.code})`));
                } else {
                    resolve(message.result);
                }
            } else if (message.method) {
                this.listeners.forEach(listener => listener(message));
            }
        });
    }

    send(method, params = {}, sessionId) {
        return new Promise((resolve, reject) => {
            const id = ++this.nextId;

            this.pending.set(id, { reject, resolve });
            this.socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
    }

    waitFor(method, sessionId, timeout = 20000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.listeners.delete(listener);
                reject(new Error(`страница не загрузилась за ${Math.round(timeout / 1000)} с (${method})`));
            }, timeout);
            const listener = message => {
                if (message.method === method && (!sessionId || message.sessionId === sessionId)) {
                    clearTimeout(timer);
                    this.listeners.delete(listener);
                    resolve(message.params);
                }
            };

            this.listeners.add(listener);
        });
    }
}

async function launchChrome() {
    if (!fs.existsSync(CHROME)) {
        throw new Error(`Chrome не найден: ${CHROME} — укажи путь флагом --chrome "<путь>"`);
    }

    const port = 9300 + Math.floor(Math.random() * 500);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-snapshots-'));
    const child = spawn(
        CHROME,
        [
            '--headless=new',
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${profile}`,
            '--ignore-certificate-errors',
            '--hide-scrollbars',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            /* Chrome 154+: без этого свежий профиль на старте качает корневые сертификаты (см. `openClean`). */
            '--disable-component-update',
            '--window-size=1440,860',
            'about:blank',
        ],
        { stdio: 'ignore' },
    );

    let version = null;

    for (let attempt = 0; attempt < 50 && !version; attempt += 1) {
        await sleep(200);

        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`);

            version = await response.json();
        } catch {
            /* Chrome ещё поднимается */
        }
    }

    if (!version) {
        child.kill();
        throw new Error('Chrome не поднял remote debugging — проверьте путь --chrome');
    }

    const socket = new WebSocket(version.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });

    return {
        cdp: new Cdp(socket),
        close: async() => {
            socket.close();
            child.kill();
            /* Chrome отпускает профиль не мгновенно — иначе rm падает на ENOTEMPTY. */
            await sleep(500);

            try {
                fs.rmSync(profile, { force: true, recursive: true });
            } catch {
                /* временная папка — уберёт система */
            }
        },
    };
}

async function openPage(cdp, viewport) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { flatten: true, targetId });

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { deviceScaleFactor: 1, height: viewport.height, mobile: viewport.width < 640, width: viewport.width },
        sessionId,
    );

    return {
        sessionId,
        async close() {
            await cdp.send('Target.closeTarget', { targetId });
        },
        async evaluate(expression) {
            const { exceptionDetails, result } = await cdp.send(
                'Runtime.evaluate',
                { awaitPromise: true, expression, returnByValue: true },
                sessionId,
            );

            if (exceptionDetails) {
                throw new Error(exceptionDetails.exception?.description ?? 'evaluate failed');
            }

            return result.value;
        },
        async navigate(url) {
            const loaded = cdp.waitFor('Page.loadEventFired', sessionId, 30000);

            await cdp.send('Page.navigate', { url }, sessionId);
            await loaded;
        },
        async screenshot(width, height, format = FORMAT, scale = SCALE * DENSITY) {
            /* clip — в координатах документа: прокрученную страницу снимаем с её места, иначе кадр пустой. */
            const { x, y } = await this.evaluate('({ x: window.scrollX, y: window.scrollY })');
            const { data } = await cdp.send(
                'Page.captureScreenshot',
                {
                    captureBeyondViewport: false,
                    clip: { height, scale, width, x, y },
                    format,
                    ...(format === 'png' ? {} : { quality: QUALITY }),
                },
                sessionId,
            );

            return Buffer.from(data, 'base64');
        },
    };
}

/**
 * Каждый кадр — с чистого старта: localStorage/sessionStorage, которые прототип записал на
 * прошлом кадре (клики рецепта, пройденное знакомство), иначе протекают в следующий, и снимок
 * показывает не то. Чистим в странице перед закрытием и после прогревочного захода.
 * (`Storage.clearDataForOrigin` в CDP отвечает Internal error — поэтому так.)
 */
async function clearStorage(page) {
    await page.evaluate('try { localStorage.clear(); sessionStorage.clear(); } catch {} true').catch(() => undefined);
}

/**
 * Первый заход сессии ждёт дольше: Chrome 154+ в первые секунды свежего профиля подменяет проверку
 * сертификатов и рвёт уже начатые загрузки (ERR_CERT_VERIFIER_CHANGED) — модули не грузятся, кадр белый.
 */
let warmedUp = false;

/** Прогрев (сертификат локального HTTPS), чистое хранилище, настоящий заход, шрифты. */
async function openClean(page, url) {
    await page.navigate(url).catch(() => undefined);
    await sleep(warmedUp ? 300 : 4000);
    warmedUp = true;
    await clearStorage(page);
    await page.navigate(url);
    await page.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
}

/** Адрес голой сцены — как у кадров карты: без панели режимов и без анимаций. */
const sceneUrl = (query, extra = {}) => {
    const params = new URLSearchParams(String(query).replace(/^[^?]*\?/, ''));

    params.set('viewport', 'frame');
    params.set('motion', 'off');
    Object.entries(extra).forEach(([key, value]) => params.set(key, value));

    return `${BASE}?${params}`;
};

/* ---------------- В странице ---------------- */

/**
 * Общие помощники, выполняются В СТРАНИЦЕ. Поиск кнопки — копия `findTarget` из
 * spec-seed-runtime.ts (правьте вместе): верхнее окно, вся страница, перекрытые не годятся.
 */
const LIB = `
    const norm = s => (s || '').replace(/\\s+/g, ' ').trim();
    const CLICKABLE = 'button, a, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="link"], ' +
        '[role="switch"], [role="checkbox"], [role="radio"], label, summary';
    const FIELD = 'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), ' +
        'textarea, select, [contenteditable="true"]';
    const labelsOf = el => norm([...(el.labels || [])].map(label => label.innerText).concat(
        (el.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean)
            .map(id => (document.getElementById(id) || {}).innerText || '')).join(' '));
    const shown = el => {
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && Number(cs.opacity) >= 0.05 && !el.closest('[aria-hidden="true"], [inert]');
    };
    const inViewport = el => {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    };
    const layers = () => [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')].filter(shown);
    const scope = () => { const l = layers(); return l.length ? l[l.length - 1] : document; };
    const scoreOf = (el, want) => [el.textContent, el.innerText, el.getAttribute('aria-label'), el.getAttribute('title'),
        el.getAttribute('placeholder'), labelsOf(el)].map(t => norm(t).toLowerCase()).reduce((top, t) => {
        if (!t) return top;
        if (t === want) return Math.max(top, 3);
        return Math.max(top, t.startsWith(want) ? 2 : t.includes(want) ? 1 : 0);
    }, 0);
    /* Недоступна сейчас (disabled, fieldset[disabled], aria-disabled): клик ничего не сделает — ждать. */
    const unavailable = el => el.matches(':disabled') || Boolean(el.closest('[aria-disabled="true"]'));
    const covered = el => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit) return false;
        return !el.contains(hit) && !hit.contains(el) && !(el instanceof HTMLLabelElement && el.control === hit);
    };
    const findTarget = (query, field) => {
        const want = norm(query).toLowerCase();
        const pick = root => {
            const list = [...root.querySelectorAll(field ? FIELD : CLICKABLE)].filter(shown)
                .map(element => ({ element, score: scoreOf(element, want) })).filter(item => item.score > 0)
                .sort((a, b) => b.score - a.score || Number(inViewport(b.element)) - Number(inViewport(a.element)) ||
                    norm(a.element.textContent).length - norm(b.element.textContent).length);
            for (const { element } of list) {
                element.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
                if (!covered(element)) return element;
            }
            return null;
        };
        const layer = scope();
        return pick(layer) || (layer === document ? null : pick(document));
    };
    const scrollerOf = from => {
        const scrollable = el => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1;
        for (let el = from ? from.parentElement : null; el; el = el.parentElement) if (scrollable(el)) return el;
        const page = document.scrollingElement || document.documentElement;
        if (from || page.scrollHeight > page.clientHeight + 1) return page;
        return [...document.querySelectorAll('body *')].filter(scrollable)
            .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] || page;
    };
    const findText = query => {
        const want = norm(query).toLowerCase();
        return [...document.querySelectorAll('body *')].filter(el => shown(el) && norm(el.textContent).toLowerCase().includes(want))
            .sort((a, b) => norm(a.textContent).length - norm(b.textContent).length)[0] || null;
    };
    const typeInto = (target, value) => {
        target.focus();
        if (target.tagName === 'SELECT') {
            const option = [...target.options].find(item => norm(item.textContent) === norm(value) || item.value === value);
            if (!option) return false;
            target.value = option.value;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        if (target.isContentEditable) {
            document.getSelection().selectAllChildren(target);
            document.execCommand('insertText', false, value);
            return !value || norm(target.textContent).length > 0;
        }
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set;
        if (!setter) return false;
        setter.call(target, value);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return !value || String(target.value || '').length > 0;
    };
    const signature = () => location.href + '|' + layers().length + '|' + (document.body ? document.body.innerText : '') + '|' +
        [...document.querySelectorAll('input, [aria-checked], [aria-expanded], [aria-selected]')].map(el =>
            (el.checked ? 1 : 0) + (el.getAttribute('aria-checked') || '') + (el.getAttribute('aria-expanded') || '') +
            (el.getAttribute('aria-selected') || '') + (el.value || '')).join(',');
    /* Открытые слои для разведки: окна, меню, списки, поповеры. */
    const openLayers = () => [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open], ' +
        '[role="menu"], [role="listbox"], [popover]')].filter(el => shown(el) && !el.closest('[data-spec-chrome]'));
    const tooltipText = () => [...document.querySelectorAll('[role="tooltip"]')].filter(shown)
        .map(el => norm(el.innerText)).filter(Boolean)[0] || '';
    /* Текст продукта в окне (без демо-панели): для подписей и сравнения «вид тот же?». */
    const productText = () => {
        const root = scope() === document ? document.body : scope();
        let text = root ? root.innerText : '';
        [...document.querySelectorAll('[data-spec-chrome]')].forEach(el => { text = text.split(el.innerText).join(' '); });
        return norm(text);
    };
    /* Ширина страницы без демо-панели: её ряд кнопок может не влезать в 375, а продукт — влезать. */
    const widthWithoutChrome = async () => {
        const boxes = [...document.querySelectorAll('[data-spec-chrome]')];
        const saved = boxes.map(el => el.style.display);
        boxes.forEach(el => { el.style.display = 'none'; });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const width = Math.max(innerWidth, document.documentElement.scrollWidth);
        boxes.forEach((el, index) => { el.style.display = saved[index]; });
        return width;
    };
    /* Фокус на кнопке, чей тултип виден (в т. ч. автофокус в открывшемся окне), — снять. */
    const dropTooltipFocus = () => {
        const active = document.activeElement;
        if (!active || active === document.body) return;
        const ids = (active.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (ids.some(id => { const tip = document.getElementById(id); return tip && shown(tip); }) ||
            [...document.querySelectorAll('[role="tooltip"]')].some(tip => shown(tip))) active.blur();
    };
    /* Вид экрана: слои + текст продукта, БЕЗ отметок и значений полей — совпал вид, значит кадр тот же. */
    const viewSig = () => openLayers().length + '|' + productText();
    /* Демо-панель прототипа без пометки: aria-label/класс, как у панелей сценариев витрины. */
    const DEMO_LABEL = /(сценари[а-я]* прототип|вариант[а-я]* прототип|управление прототип|выбор сценари|другие состояни|чаты прототип)/i;
    const DEMO_CLASS = /(prototypeVariant|scenarioSwitcher|scenarioBar|scenarioPanel|demoPanel)/;
    /* strongOnly — только по aria-label («Сценарии прототипа»…); класс — лишь подсказка: так же
       называют и экраны продукта. */
    const demoCandidates = (strongOnly = true) => {
        const found = [...document.querySelectorAll('[aria-label], [class]')].filter(el =>
            !el.closest('[data-spec-chrome]') && shown(el) &&
            (DEMO_LABEL.test(el.getAttribute('aria-label') || '') || (!strongOnly && DEMO_CLASS.test(String(el.className || '')))) &&
            el.querySelectorAll(CLICKABLE + ', select').length >= 2);
        return found.filter(el => !found.some(other => other !== el && other.contains(el)))
            .map(el => '<' + el.tagName.toLowerCase() + (el.getAttribute('aria-label') ? ' aria-label="' + el.getAttribute('aria-label') + '"' : '') + '>');
    };
`;

/**
 * Поиск элемента по запросу перехода (якорь на снимке). `css=<selector>` — первый видимый;
 * `text=<строка>` (или без префикса) — кнопка, чей текст / aria-label / title совпадает. Якорь
 * меряется на снимке — элемент должен быть в первом экране. Нашёлся не кнопкой, а просто
 * текстом — `weak`: подпись перехода не совпала ни с одной кнопкой.
 */
const RESOLVER = `(queries) => {
    ${LIB}
    const INTERACTIVE = CLICKABLE + ', input, textarea, select, [tabindex]:not([tabindex="-1"])';
    const area = scope();
    const find = query => {
        if (query.startsWith('css=')) {
            return { el: [...area.querySelectorAll(query.slice(4))].find(el => shown(el) && inViewport(el)) || null };
        }
        const want = norm(query.replace(/^text=/, '')).toLowerCase();
        const best = [...area.querySelectorAll(INTERACTIVE)].filter(el => shown(el) && inViewport(el) && !el.closest('[data-spec-chrome]'))
            .map(el => ({ el, score: scoreOf(el, want) })).filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || norm(a.el.textContent).length - norm(b.el.textContent).length)[0];
        if (best) return { el: best.el };
        const text = [...document.body.querySelectorAll('*')].find(el =>
            el.children.length === 0 && shown(el) && inViewport(el) && norm(el.textContent).toLowerCase() === want);
        return { el: text || null, weak: Boolean(text) };
    };
    return queries.map(q => {
        const { el, weak } = find(q.query);
        if (!el) return { to: q.to, query: q.query, found: false };
        const r = el.getBoundingClientRect();
        return {
            to: q.to, query: q.query, found: true, weak: Boolean(weak),
            x: +((r.left + r.width / 2) / innerWidth).toFixed(4),
            y: +((r.top + r.height / 2) / innerHeight).toFixed(4),
            w: +(r.width / innerWidth).toFixed(4),
            h: +(r.height / innerHeight).toFixed(4),
        };
    });
}`;

/** Список видимых интерактивных элементов — выполняется В СТРАНИЦЕ (режим `--controls`). */
const LIST_CONTROLS = `() => {
    ${LIB}
    return [...scope().querySelectorAll(CLICKABLE + ', ' + FIELD)].filter(shown).map(el => {
        const r = el.getBoundingClientRect();
        const attrs = ['aria-label', 'title', 'placeholder'].map(name => {
            const value = norm(el.getAttribute(name));
            return value ? name + '=' + value : '';
        }).filter(Boolean).join(' ');
        return el.tagName.toLowerCase() + ' @' + Math.round(r.left) + ',' + Math.round(r.top) + ' «' + norm(el.innerText).slice(0, 50) + '»' + (attrs ? ' ' + attrs : '');
    }).slice(0, 150);
}`;

/**
 * Что на экране — выполняется В СТРАНИЦЕ (режим `--probe`). Тексты ровно те, по которым
 * рецепт (`clicks`) и якорь перехода (`label`) ищут элемент. Смотрим всю страницу, а не только
 * первый экран (↓ — ниже, рецепт докрутит сам); открыто окно — только его содержимое.
 */
const PROBE = `async (vw) => {
    ${LIB}
    const area = scope();
    const inArea = el => area === document || area.contains(el);
    const uniq = list => [...new Set(list.filter(Boolean))];
    const mark = el => (inViewport(el) ? '' : '  ↓ ниже первого экрана') + (el.closest('[data-spec-chrome]') ? '  ⚙ панель прототипа' : '');
    /* Первая строка текста; «…» — ВНЕ кавычек: в clicks переносится только то, что в кавычках. */
    const firstLine = text => {
        const lines = String(text || '').split('\\n').map(norm).filter(Boolean);
        if (!lines.length) return { cut: false, text: '' };
        return { cut: lines.length > 1 || lines[0].length > 60, text: lines[0].slice(0, 60) };
    };
    const quoted = line => (line.text ? '«' + line.text + '»' + (line.cut ? ' …' : '') : '');
    const labelOf = el => {
        const line = firstLine(el.innerText);
        const text = line.text || norm(el.textContent);
        const aria = norm(el.getAttribute('aria-label'));
        if (text) return quoted(line.text ? line : { cut: false, text }) + (aria && aria !== text ? '  (aria-label «' + aria + '»)' : '');
        if (aria) return '«' + aria + '»  (aria-label)';
        const title = norm(el.getAttribute('title'));
        return title ? '«' + title + '»  (title)' : '';
    };
    const fieldOf = el => {
        const kind = el.getAttribute('type') || el.tagName.toLowerCase();
        const ph = norm(el.getAttribute('placeholder'));
        const aria = norm(el.getAttribute('aria-label'));
        const label = labelsOf(el) ? firstLine(labelsOf(el)) : { cut: false, text: '' };
        const name = ph ? 'placeholder «' + ph + '»' : aria ? 'aria-label «' + aria + '»' : label.text ? 'подпись ' + quoted(label) : 'без подписи';
        const state = kind === 'checkbox' || kind === 'radio' ? (el.checked ? ' — отмечен' : ' — не отмечен') : '';
        const options = el.tagName === 'SELECT' ? ' варианты: ' + [...el.options].map(o => '«' + norm(o.textContent) + '»').join(', ') : '';
        return name + '  [' + kind + ']' + state + options + mark(el);
    };
    /* Заголовки в ДС часто не h1–h3, а крупный текст: берём теги и всё от 18 px с собственным текстом,
       кроме текста внутри кнопок, ссылок и демо-панели. */
    const ownText = el => norm([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' '));
    const big = [...(area === document ? document.body : area).querySelectorAll('*')].filter(el =>
        shown(el) && ownText(el) && parseFloat(getComputedStyle(el).fontSize) >= 18);
    const headings = uniq([...document.querySelectorAll('h1, h2, h3, h4, [role="heading"]')].filter(el => shown(el) && inArea(el))
        .concat(big).filter(el => !el.closest(CLICKABLE) && !el.closest('[data-spec-chrome]'))
        .map(el => norm(el.textContent)).filter(t => t.length <= 80)).slice(0, 20);
    const dialogs = layers();
    const top = dialogs[dialogs.length - 1];
    const dialogTitle = dlg => {
        const by = dlg.getAttribute('aria-labelledby');
        const labelled = by && document.getElementById(by);
        return norm(dlg.getAttribute('aria-label')) || norm(labelled && labelled.textContent) || headings[0] ||
            firstLine(dlg.innerText).text || 'без заголовка';
    };
    /* Шире экрана: при мобильной эмуляции Chrome растягивает окно под широкий контент (innerWidth
       становится 1440), поэтому сравниваем с шириной устройства vw. Карусели и выезжающие шторки
       внутри обрезающих контейнеров документ не расширяют и сюда не попадают. */
    const rightEdge = await widthWithoutChrome();
    return {
        dialog: top ? dialogTitle(top) : '',
        headings,
        buttons: uniq([...area.querySelectorAll(CLICKABLE)].filter(shown).map(el => {
            const label = labelOf(el);
            return label ? label + mark(el) : '';
        })),
        fields: uniq([...area.querySelectorAll(FIELD)].filter(el => shown(el) || (el.labels && el.labels[0] && shown(el.labels[0]))).map(fieldOf)),
        chrome: document.querySelectorAll('[data-spec-chrome]').length,
        demo: demoCandidates(true),
        demoWeak: demoCandidates(false).filter(tag => !demoCandidates(true).includes(tag)),
        tooltip: tooltipText(),
        overflow: Math.round(rightEdge - vw),
        seed: document.documentElement.dataset.specSeed || '',
        reason: document.documentElement.dataset.specSeedReason || '',
    };
}`;

/** Шаг разведки В СТРАНИЦЕ: клик, ввод или прокрутка — тем же поиском, что у рецепта. */
const PROBE_STEP = `async (step) => {
    ${LIB}
    if (step.scroll !== undefined) {
        const anchor = step.text ? findText(step.text) : null;
        if (step.text && !anchor) return false;
        const box = scrollerOf(anchor);
        if (step.scroll === 'top') box.scrollTop = 0;
        else if (step.scroll === 'bottom') box.scrollTop = box.scrollHeight;
        else box.scrollTop += step.scroll;
        return true;
    }
    const field = step.type !== undefined;
    let target = null;
    let blocked = null;
    /* Как рецепт: нашлась, но недоступна — ждём, а не нажимаем соседнюю похожую. */
    for (let attempt = 0; attempt < 20; attempt++) {
        const found = findTarget(step.text, field);
        if (found && !unavailable(found)) { target = found; break; }
        blocked = found;
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!target) return blocked ? 'disabled' : false;
    if (field) return typeInto(target, step.type);
    target.click();
    /* Как рецепт: фокус остался на нажатой кнопке — снять (иначе на снимке её тултип). */
    await new Promise(resolve => setTimeout(resolve, 50));
    const active = document.activeElement;
    if (active && (active === target || target.contains(active))) active.blur();
    dropTooltipFocus();
    return true;
}`;

/** Состояние экрана для `--explore` — выполняется В СТРАНИЦЕ. */
const EXPLORE_STATE = `(() => {
    ${LIB}
    const root = scope() === document ? document.body : scope();
    const chromeLines = new Set([...document.querySelectorAll('[data-spec-chrome], [role="tooltip"]')]
        .flatMap(el => String(el.innerText || '').split('\\n').map(norm)));
    const lines = [...new Set(String(root ? root.innerText : '').split('\\n').map(norm).filter(line => line && !chromeLines.has(line)))];
    const label = el => String(el.innerText || '').split('\\n').map(norm).filter(Boolean)[0] ||
        norm(el.getAttribute('aria-label')) || norm(el.getAttribute('title'));
    return {
        href: location.href,
        layers: openLayers().map(el => norm(el.getAttribute('aria-label')) ||
            String(el.innerText || '').split('\\n').map(norm).filter(Boolean)[0] || el.getAttribute('role') || 'окно'),
        buttons: [...new Set([...document.querySelectorAll(CLICKABLE)].filter(el => shown(el) && !el.closest('[data-spec-chrome]')).map(label).filter(Boolean))],
        lines,
        values: [...document.querySelectorAll('input, select, textarea, [aria-checked], [aria-selected], [aria-pressed]')].map(el =>
            (el.checked ? 1 : 0) + (el.getAttribute('aria-checked') || '') + (el.getAttribute('aria-selected') || '') +
            (el.getAttribute('aria-pressed') || '') + (el.value || '')).join(','),
        tooltip: tooltipText(),
        scroll: Math.round((document.scrollingElement || document.documentElement).scrollTop),
    };
})()`;

const SIGNATURE = `(() => { ${LIB} return signature(); })()`;

/**
 * Отпечаток вида экрана (слои + текст продукта, без отметок) — один и тот же у снимка кадра и у
 * старта разведки: по нему spec-lint понимает, какие кадры показывают экран, с которого начата
 * разведка, даже если кадр открыт рецептом с `actions`, а разведка — голым адресом.
 */
const VIEW_HASH = `sig => {
    let hash = 5381;
    for (let i = 0; i < sig.length; i++) hash = ((hash << 5) + hash + sig.charCodeAt(i)) | 0;
    return (hash >>> 0) + ':' + sig.length;
}`;
const VIEW_ID = `(() => { ${LIB} return (${VIEW_HASH})(viewSig()); })()`;

/** «Готовый рецепт» — одинарные кавычки, как требует eslint прототипа. */
const quote = value => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const recipeOf = steps => steps.map(step => {
    if (step.scroll !== undefined) {
        const amount = typeof step.scroll === 'number' ? step.scroll : quote(step.scroll);

        return step.text ? `{ scroll: ${amount}, text: ${quote(step.text)} }` : `{ scroll: ${amount} }`;
    }

    return step.type === undefined ?
        `{ text: ${quote(step.text)}, wait: 900 }` :
        `{ text: ${quote(step.text)}, type: ${quote(step.type)} }`;
}).join(', ');
const stepLabel = step => {
    if (step.scroll !== undefined) {
        return `прокрутка ${step.scroll}${step.text ? ` в «${step.text}»` : ''}`;
    }

    return step.type === undefined ? `«${step.text}»` : `«${step.text}» ← ${step.type}`;
};

/**
 * Пройти шаги в открытой странице. Возвращает число пройденных, шаги, которые ничего не изменили,
 * и `blocked` — шаг остановился на недоступной (disabled) кнопке, а не потому, что её нет.
 */
async function runSteps(page, steps) {
    let passed = 0;
    let blocked = false;
    const idle = [];

    for (const step of steps) {
        const before = step.scroll === undefined ? await page.evaluate(SIGNATURE) : '';
        const done = await page.evaluate(`(${PROBE_STEP})(${JSON.stringify(step)})`);

        if (done !== true) {
            blocked = done === 'disabled';
            break;
        }

        passed += 1;
        await sleep(900);

        if (step.scroll === undefined && before === (await page.evaluate(SIGNATURE))) {
            idle.push(step);
        }
    }

    return { blocked, idle, passed };
}

/* ---------------- Режимы разведки ---------------- */

async function probe(cdp, query) {
    /* specprobe=1 — SpecGate не прячет панель прототипа ([data-spec-chrome]): её кнопки нужны рецептам. */
    const url = sceneUrl(query, { specprobe: '1' });

    console.log(`Адрес: ${url}`);

    for (const platform of ['desktop', 'mobile']) {
        const viewport = VIEWPORT[platform];
        const page = await openPage(cdp, viewport);

        try {
            await openClean(page, url);

            const seedState = await waitSeed(page, url);

            await sleep(SETTLE_MS);

            const { blocked, idle, passed } = await runSteps(page, PROBE_STEPS);

            await sleep(PROBE_STEPS.length ? 500 : 0);

            const seen = await page.evaluate(`(${PROBE})(${viewport.width})`);
            const shot = path.join(os.tmpdir(), `spec-probe-${viewport.width}.png`);

            fs.writeFileSync(shot, await page.screenshot(viewport.width, viewport.height, 'png', 1));
            console.log(`\n=== ${viewport.width} px${seedState === 'none' ? '' : ` · рецепт: ${seedState}`}`);

            const problem = await seedProblem(page, seedState);

            if (problem) {
                console.log(`  ! ${problem}`);
            }

            if (PROBE_STEPS.length) {
                console.log(`  Пройдено: ${PROBE_STEPS.slice(0, passed).map(stepLabel).join(' → ') || '—'}`);

                idle.forEach(step => console.log(
                    `  ! ${stepLabel(step)} ничего не изменил на экране — это не переход (или нужен больший wait)`,
                ));

                if (passed < PROBE_STEPS.length && blocked) {
                    console.log(
                        `  ! ${stepLabel(PROBE_STEPS[passed])} есть, но недоступна (disabled) и за 3 с не ожила — ` +
                        'ниже экран, на котором путь остановился: что должно случиться раньше, чтобы она ожила?',
                    );
                } else if (passed < PROBE_STEPS.length) {
                    console.log(
                        `  ! не нашлось ${stepLabel(PROBE_STEPS[passed])} — ниже экран, на котором путь остановился; ` +
                        'бери текст отсюда',
                    );
                } else {
                    console.log(`  Готовый рецепт: { clicks: [${recipeOf(PROBE_STEPS)}] }`);
                }
            }

            if (seen.tooltip) {
                console.log(`  ! на экране висит тултип «${seen.tooltip}» — на снимке он закроет интерфейс; уведи курсор/фокус (рецепт снимает фокус сам)`);
            }

            if (!seen.chrome && seen.demo.length) {
                console.log(`  ! похоже на демо-панель прототипа без data-spec-chrome: ${seen.demo.join(', ')} — пометь её (шаг 4)`);
            }

            if (!seen.chrome && seen.demoWeak.length) {
                console.log(`  ? проверь глазами: ${seen.demoWeak.join(', ')} — переключатели сценариев над продуктом или экран продукта?`);
            }

            if (platform === 'mobile' && seen.overflow > 8) {
                console.log(
                    `  ! на 375 страница шире экрана на ${seen.overflow} px — телефонной вёрстки нет: телефоны не ` +
                    'добавляй (без withPhone), в MAP_NO_MOBILE[\'*\'] причина «Прототип только десктопный»',
                );
            }

            if (seen.dialog) {
                console.log(`  Поверх открыто окно/шторка «${seen.dialog}» — ниже только его содержимое.`);
            }

            console.log(`  Заголовки: ${seen.headings.map(text => `«${text}»`).join(', ') || '—'}`);
            console.log('  Кнопки и ссылки — ДОСЛОВНО; в `label` и `clicks` — только текст В КАВЫЧКАХ');
            console.log('  (хватает начала строки; «…» после кавычек — у кнопки есть вторая строка;');
            console.log('   ↓ — ниже первого экрана: кликнуть рецепт докрутит сам, но на СНИМКЕ этого не будет — важное внизу');
            console.log('   = кадр с { scroll: \'bottom\' } или строка «НЕ ПОКАЗЫВАЕМ»; ⚙ — панель прототипа: только для рецептов, не для label):');
            (seen.buttons.length ? seen.buttons : ['—']).forEach(line => console.log(`    ${line}`));
            console.log('  Поля — для `clicks: [{ text: <подпись, placeholder или aria-label>, type: \'…\' }]`:');
            (seen.fields.length ? seen.fields : ['—']).forEach(line => console.log(`    ${line}`));
            console.log(`  Снимок: ${shot} — открой и посмотри глазами.`);
        } finally {
            await clearStorage(page);
            await page.close();
        }
    }
}

/** Что изменилось на экране после нажатия: «вид» (кадр), «значение», «якорь» и т. д. */
const classify = (before, after, passed, blocked) => {
    if (!passed && blocked) {
        return { effect: 'недоступна (disabled) на этом экране — не кадр', kind: 'disabled' };
    }

    if (!passed) {
        return { effect: 'не нажалась: на чистом старте этой кнопки не нашлось', kind: 'error' };
    }

    const bare = href => href.replace(/#.*$/, '');

    if (bare(after.href) !== bare(before.href) && !bare(after.href).startsWith(BASE.replace(/\/$/, ''))) {
        return { effect: `ушёл со страницы: ${after.href}`, kind: 'navigate' };
    }

    const freshLayers = after.layers.filter(item => !before.layers.includes(item));

    if (freshLayers.length) {
        return { effect: `открылось «${freshLayers[0]}» (окно, меню или список)`, kind: 'view' };
    }

    const freshButtons = after.buttons.filter(item => !before.buttons.includes(item));

    if (freshButtons.length) {
        return { effect: `появились кнопки: ${freshButtons.slice(0, 4).map(item => `«${item}»`).join(', ')}`, kind: 'view' };
    }

    const freshLines = after.lines.filter(item => !before.lines.includes(item));

    if (freshLines.length) {
        return { effect: `новый текст: «${freshLines[0].slice(0, 80)}»`, kind: 'view' };
    }

    if (bare(after.href) !== bare(before.href)) {
        return { effect: `сменился адрес: ${after.href.replace(BASE, '')}`, kind: 'view' };
    }

    if (after.href !== before.href) {
        return { effect: `якорь ${after.href.replace(/^[^#]*/, '')} (прокрутка к месту) — не кадр`, kind: 'anchor' };
    }

    if (after.values !== before.values) {
        return { effect: 'отметка или значение — тот же вид, не кадр', kind: 'value' };
    }

    if (after.tooltip && after.tooltip !== before.tooltip) {
        return { effect: `только тултип «${after.tooltip}» — не кадр`, kind: 'tooltip' };
    }

    if (after.scroll !== before.scroll) {
        return { effect: 'прокрутка — не кадр', kind: 'scroll' };
    }

    return { effect: 'ничего', kind: 'none' };
};

/**
 * `--explore '<адрес>'` — нажать по очереди КАЖДУЮ кнопку экрана и каждый вариант каждого
 * списка `<select>` (каждый — с чистого старта) и сказать, что меняется. Итог пишется в
 * `src/spec-explore.json` — по нему spec-lint проверяет, что каждое изменение вида стало кадром,
 * входом в сценарий или строкой «НЕ ПОКАЗЫВАЕМ».
 */
async function explore(cdp, query) {
    const url = sceneUrl(query, { specprobe: '1' });
    const listPage = await openPage(cdp, VIEWPORT.desktop);
    let items = [];
    let view = '';

    try {
        await openClean(listPage, url);
        await waitSeed(listPage, url);
        await sleep(SETTLE_MS);
        view = await listPage.evaluate(VIEW_ID);
        items = await listPage.evaluate(`(() => { ${LIB}
            const demo = el => Boolean(el.closest('[data-spec-chrome]')) ||
                [...document.querySelectorAll('[aria-label], [class]')].some(box => box.contains(el) &&
                    (DEMO_LABEL.test(box.getAttribute('aria-label') || '') || DEMO_CLASS.test(String(box.className || ''))));
            const label = el => String(el.innerText || '').split('\\n').map(norm).filter(Boolean)[0] ||
                norm(el.getAttribute('aria-label')) || norm(el.getAttribute('title'));
            const buttons = [...scope().querySelectorAll(CLICKABLE)].filter(shown).map(el => ({
                chrome: demo(el),
                nav: Boolean(el.closest('nav, header, aside, [role="navigation"], [role="banner"]')),
                text: (label(el) || '').slice(0, 60),
            })).filter(item => item.text);
            const selects = [...scope().querySelectorAll('select')].filter(shown).flatMap(el => {
                const name = labelsOf(el) || norm(el.getAttribute('aria-label')) || norm(el.getAttribute('name'));
                /* Все варианты: лишние упираются в общий лимит и печатаются как «не нажаты». */
                return name ? [...el.options].map(option => ({
                    chrome: demo(el), nav: false, select: name, text: norm(option.textContent),
                })) : [];
            });
            const seen = new Set();
            return [...buttons, ...selects].filter(item => {
                const key = (item.select || '') + '|' + item.text;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        })()`);
    } finally {
        await clearStorage(listPage);
        await listPage.close();
    }

    /* Демо-панель и основная область — первыми: навигация оболочки (левое меню, шапка) редко меняет вид. */
    const LIMIT = Number(args['explore-limit']) > 0 ? Number(args['explore-limit']) : 60;
    const ordered = [...items].sort((a, b) => Number(b.chrome) - Number(a.chrome) || Number(a.nav) - Number(b.nav));
    const taken = ordered.slice(0, LIMIT);
    const skipped = ordered.slice(LIMIT);

    console.log(`Адрес: ${url}\nКнопок и вариантов: ${items.length} — нажимаю каждое с чистого старта (1440 px)…\n`);

    const report = [];
    const key = String(query).replace(/^[^?]*/, '') || '?';
    const nameOf = item => (item.select ? `«${item.select}» = «${item.text}»` : `«${item.text}»`);

    for (const item of taken) {
        const step = item.select ? { text: item.select, type: item.text } : { text: item.text };
        let page = null;

        /* Сбой одного нажатия (упал Chrome, страница не открылась) не обрывает разведку: причина —
           в отчёт и на экран, остальные нажатия сохраняются, итог — с ошибкой. */
        try {
            page = await openPage(cdp, VIEWPORT.desktop);
            await openClean(page, url);
            await waitSeed(page, url);
            await sleep(900);

            const before = await page.evaluate(EXPLORE_STATE);
            const { blocked, passed } = await runSteps(page, [step]);
            const after = await page.evaluate(EXPLORE_STATE);
            const { effect, kind } = classify(before, after, passed, blocked);

            report.push({ chrome: item.chrome, effect, kind, select: item.select, text: item.text });
            console.log(`  ${{ error: '✗', view: '▶' }[kind] ?? ' '} ${item.chrome ? '⚙ ' : ''}${nameOf(item)} → ${effect}`);
        } catch (error) {
            const effect = `ошибка: ${error instanceof Error ? error.message : error}`;

            report.push({ chrome: item.chrome, effect, kind: 'error', select: item.select, text: item.text });
            console.log(`  ✗ ${item.chrome ? '⚙ ' : ''}${nameOf(item)} → ${effect}`);
        } finally {
            if (page) {
                try {
                    await clearStorage(page);
                    await page.close();
                } catch {
                    /* вкладка уже недоступна — сбой записан выше */
                }
            }
        }
    }

    if (skipped.length) {
        console.log(
            `\nНе нажаты (лимит ${LIMIT}): ${skipped.map(nameOf).join(', ')} — повтори с --explore-limit ` +
            `${ordered.length} или разведай их экран отдельно; spec-lint напомнит о них предупреждением.`,
        );
    }

    const out = path.join(ROOT, 'src', 'spec-explore.json');
    const saved = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
    const failed = report.filter(item => item.kind === 'error');

    saved[key] = {
        report,
        view,
        skipped: skipped.map(item => (item.select ? { select: item.select, text: item.text } : { text: item.text })),
    };
    fs.writeFileSync(out, `${JSON.stringify(saved, null, 2)}\n`);

    if (failed.length) {
        /* Сорванная разведка — не «чисто»: spec-lint не пропустит эти записи, пока прогон не пройдёт. */
        console.log(
            `\n✗ Разведка ${key} сорвалась на ${failed.length} из ${report.length}: ` +
            `${failed.map(item => `${nameOf(item)} — ${item.effect}`).join('; ')}. ` +
            `Почини (дев-сервер, адрес) и повтори --explore '${key}'.`,
        );
        process.exitCode = 1;
    }

    console.log(
        '\n▶ — меняет ВИД экрана: это кадр, вход в сценарий или строка шапки spec-sections.ts ' +
        '«НЕ ПОКАЗЫВАЕМ: «кнопка» — причина» (spec-lint сверит, L22). ⚙ — панель прототипа: её пункты — ' +
        'отдельные сценарии. Отметки, якоря, тултипы и прокрутка — не кадры. ' +
        `Сохранено: ${path.relative(ROOT, out)}; новые экраны разведывай так же: --explore '?seed=<id>'.`,
    );
}

/** Прочитать манифест карты со страницы `?spec=map` (до минуты — Vite после правок пересобирается). */
async function readBoard(cdp) {
    const page = await openPage(cdp, VIEWPORT.desktop);

    try {
        await page.navigate(`${BASE}?spec=map`).catch(() => undefined);
        await sleep(500);
        await page.navigate(`${BASE}?spec=map`);

        for (let attempt = 0; attempt < 120; attempt += 1) {
            const exported = await page.evaluate(
                'window.__specBoard ? JSON.stringify({ board: window.__specBoard, noMobile: ' +
                '(window.__specBoardLayout || {}).noMobile || {} }) : null',
            );

            if (exported) {
                return { ...JSON.parse(exported), text: '' };
            }

            await sleep(500);
        }

        const text = await page.evaluate('(document.body ? document.body.innerText : "").replace(/\\s+/g, " ").slice(0, 300)');

        return { board: null, noMobile: {}, text };
    } finally {
        await page.close();
    }
}

const boardMissing = text => new Error(
    'Страница карты не отдала window.__specBoard — прототип не собрался, адрес не тот или ?spec ' +
    `не подключён (шаг 4: SpecGate в src/index.tsx). На странице: «${text || 'пусто'}»`,
);

/** `--wiring` — шаг 4 регламента: открывается ли карта и запускаются ли рецепты. */
async function wiring(cdp) {
    let ok = true;
    const { board, text } = await readBoard(cdp);

    if (board) {
        console.log(`✓ вид спеки подключён: ${BASE}?spec=map отдаёт карту (${board.frames.length} кадров)`);
    } else {
        ok = false;
        console.log(`✗ ${boardMissing(text).message}`);
    }

    const seeded = (board?.frames ?? []).find(frame => new URLSearchParams(frame.src.split('?')[1] ?? '').has('seed'));
    const target = seeded ? new URL(seeded.src, new URL(BASE).origin).href : sceneUrl('?seed=spec-wiring-check');
    const page = await openPage(cdp, VIEWPORT.desktop);

    try {
        await openClean(page, target);

        const state = await waitSeed(page, target);

        if (state === 'absent') {
            ok = false;
            console.log(`✗ ${SEED_ABSENT}`);
        } else if (seeded) {
            console.log(`✓ рецепты подключены (${seeded.id}: ${state})`);
        } else {
            console.log('✓ рецепты подключены (движок ответил на пробный seed; кадров с seed на карте пока нет)');
        }

        await page.navigate(sceneUrl('?', { specprobe: '1' }));
        await sleep(SETTLE_MS);

        const demo = await page.evaluate(`(() => { ${LIB} return { chrome: document.querySelectorAll('[data-spec-chrome]').length, demo: demoCandidates(true), weak: demoCandidates(false).filter(tag => !demoCandidates(true).includes(tag)) }; })()`);

        if (demo.chrome) {
            console.log(`✓ демо-панель прототипа помечена (data-spec-chrome: ${demo.chrome})`);
        } else if (demo.demo.length) {
            ok = false;
            console.log(`✗ похоже на демо-панель без data-spec-chrome: ${demo.demo.join(', ')} — поставь атрибут на её контейнер`);
        } else {
            console.log('✓ демо-панели не видно (если над продуктом есть переключатели сценариев — пометь их контейнер data-spec-chrome)');
        }

        if (!demo.chrome && demo.weak.length) {
            console.log(`? проверь глазами: ${demo.weak.join(', ')} — если это переключатели сценариев НАД продуктом, а не экран продукта, поставь data-spec-chrome`);
        }
    } finally {
        await clearStorage(page);
        await page.close();
    }

    if (!ok) {
        process.exitCode = 1;
    }
}

/* ---------------- Дубли ---------------- */

/**
 * Сравнить снимки попарно (в уменьшении, порог 24/255 на канал): одинаковые → `same`,
 * почти одинаковые в одной секции → `near`. Считает тот же headless Chrome.
 */
async function findDuplicates(cdp, entries) {
    const page = await openPage(cdp, { height: 600, width: 800 });

    try {
        const items = entries.map(entry => ({
            id: entry.id,
            platform: entry.platform,
            section: entry.section,
            view: entry.view ?? null,
            src: `data:image/${FORMAT};base64,${fs.readFileSync(path.join(OUT_DIR, entry.file)).toString('base64')}`,
        }));

        return await page.evaluate(`(async (items) => {
            const load = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
            const pixels = {};
            for (const item of items) {
                const img = await load(item.src);
                const w = item.platform === 'mobile' ? 188 : 480;
                const h = Math.round(w * img.height / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                pixels[item.id] = ctx.getImageData(0, 0, w, h).data;
            }
            const diff = (a, b) => {
                if (a.length !== b.length) return 1;
                let n = 0;
                for (let i = 0; i < a.length; i += 4) {
                    if (Math.abs(a[i] - b[i]) > 24 || Math.abs(a[i + 1] - b[i + 1]) > 24 || Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
                }
                return n / (a.length / 4);
            };
            const result = {};
            for (const item of items) {
                let same = null; let near = null;
                for (const other of items) {
                    if (other.id === item.id || other.platform !== item.platform) continue;
                    const d = diff(pixels[item.id], pixels[other.id]);
                    if (d < ${SAME} && (!same || d < same.diff)) same = { id: other.id, diff: d };
                    if (other.section === item.section && d < ${NEAR} && (!near || d < near.diff)) near = { id: other.id, diff: d };
                }
                /* Почти одинаковые И вид тот же (те же слои и текст продукта) — отличаются только отметки. */
                const sameView = Boolean(near && item.view && item.view === (items.find(other => other.id === near.id) || {}).view);
                result[item.id] = same ? { ...same, same: true } : near ? { ...near, same: false, sameView } : null;
            }
            return result;
        })(${JSON.stringify(items)})`);
    } finally {
        await page.close();
    }
}

/* ---------------- Лист-сетка ---------------- */

/**
 * ЛИСТ-СЕТКА: все экраны карты одной картинкой — пары «десктоп + телефон» с кодом и заголовком.
 * Нужен, чтобы проверить снимки глазами за один взгляд. Всё, что скрипт считает дефектом
 * (нет телефона, нет снимка, рецепт не доиграл, дубль, телефон = обрезанный десктоп), подписано
 * красным; почти дубль — жёлтым.
 */
async function renderSheet(cdp, frames, manifest, out, noMobile = {}) {
    const dataUri = file => {
        const full = path.join(OUT_DIR, file);

        if (!fs.existsSync(full)) {
            return null;
        }

        const ext = path.extname(file).slice(1);

        return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${fs.readFileSync(full).toString('base64')}`;
    };
    const escape = text => String(text ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    const byId = new Map(frames.map(frame => [frame.id, frame]));
    const codeOf = id => byId.get(id.replace(/@m$/, ''))?.code ?? id;
    const problemsOf = (id, label) => {
        const shot = manifest.frames[id];

        if (!shot) {
            return [];
        }

        return [
            shot.seed && !['ready', 'none'].includes(shot.seed) ? `${label}рецепт: ${shot.seed}` : '',
            shot.dup?.same ? `${label}= ${codeOf(shot.dup.id)} (дубль)` : '',
            shot.dup?.sameView ? `${label}= ${codeOf(shot.dup.id)}: тот же вид, другие отметки` : '',
            shot.tooltip ? `${label}тултип «${shot.tooltip}»` : '',
            shot.overflowX ? 'телефон = обрезанный десктоп' : '',
        ].filter(Boolean);
    };
    const cards = frames
        .filter(frame => frame.platform === 'desktop')
        .map(frame => {
            const desktop = manifest.frames[frame.id] && dataUri(manifest.frames[frame.id].file);
            const mobileFrame = byId.get(`${frame.id}@m`);
            const mobileShot = mobileFrame && manifest.frames[mobileFrame.id];
            const mobile = mobileShot && dataUri(mobileShot.file);
            let phoneWarn = '';

            if (!mobileFrame && !noMobile[frame.id] && !noMobile['*']) {
                phoneWarn = 'нет телефона';
            } else if (mobileFrame && !mobile) {
                phoneWarn = 'нет снимка телефона';
            }

            const warn = [
                desktop ? '' : 'нет снимка',
                phoneWarn,
                ...problemsOf(frame.id, ''),
                ...(mobileFrame ? problemsOf(mobileFrame.id, 'телефон: ') : []),
            ].filter(Boolean).join(' · ');
            const near = manifest.frames[frame.id]?.dup;
            const nearWarn = near && !near.same && !near.sameView ?
                `≈ ${codeOf(near.id)}: отличие ${(near.diff * 100).toFixed(2)} %` :
                '';
            const desktopCell = desktop ? `<img class="d" src="${desktop}">` : '<div class="d miss"></div>';
            const mobileCell = mobile ? `<img class="m" src="${mobile}">` : '<div class="m miss"></div>';

            return `<figure>
                <div class="pair">${desktopCell}${mobileCell}</div>
                <figcaption><b>${escape(frame.code)}</b> ${escape(frame.title)}<br><span>${escape(frame.id)}</span>` +
                `${warn ? ` <em>${escape(warn)}</em>` : ''}${nearWarn ? ` <i>${escape(nearWarn)}</i>` : ''}</figcaption>
            </figure>`;
        })
        .join('');
    const html = `<!doctype html><meta charset="utf-8"><style>
        body{margin:0;padding:24px;background:#1b1b1b;color:#eee;font:14px/1.35 -apple-system,sans-serif}
        main{display:grid;grid-template-columns:repeat(4,468px);gap:28px 20px}
        figure{margin:0}.pair{display:flex;gap:8px;align-items:flex-start}
        .d{width:360px;height:215px;border-radius:6px;background:#fff;object-fit:cover}
        .m{width:94px;height:203px;border-radius:10px;background:#fff;object-fit:cover}
        .miss{background:repeating-linear-gradient(45deg,#3a1d1d,#3a1d1d 8px,#2a1414 8px,#2a1414 16px)}
        figcaption{margin-top:6px}span{color:#999;font-size:12px}em{color:#ff6b6b;font-style:normal;font-weight:600}
        i{color:#f5c542;font-style:normal;font-weight:600}
    </style><main>${cards}</main>`;
    const page = await openPage(cdp, { height: 1000, width: 2000 });

    try {
        await page.evaluate(`document.open(); document.write(${JSON.stringify(html)}); document.close(); true`);
        await sleep(800);
        const height = await page.evaluate('Math.ceil(document.documentElement.scrollHeight)');
        const { data } = await cdp.send('Page.captureScreenshot', {
            captureBeyondViewport: true,
            clip: { height, scale: 1, width: 2000, x: 0, y: 0 },
            format: 'png',
        }, page.sessionId);

        fs.writeFileSync(out, Buffer.from(data, 'base64'));
        console.log(`\nЛист-сетка: ${out} — открой и посмотри глазами (красное = дефект, жёлтое = проверь).`);
    } finally {
        await page.close();
    }
}

/* ---------------- Снимки ---------------- */

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const previous = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) : { frames: {} };
    const { cdp, close } = await launchChrome();

    try {
        if (args.probe) {
            await probe(cdp, args.probe === true ? '?' : args.probe);

            return;
        }

        if (args.explore) {
            await explore(cdp, args.explore === true ? '?' : args.explore);

            return;
        }

        if (args.wiring) {
            await wiring(cdp);

            return;
        }

        console.log(`Читаем манифест борда: ${BASE}?spec=map`);

        const { board, noMobile, text } = await readBoard(cdp);

        if (!board) {
            throw boardMissing(text);
        }

        const allFrames = board.frames;
        const frames = allFrames.filter(frame =>
            CONTROLS ? CONTROLS.has(frame.id) : !ONLY || ONLY.has(frame.id),
        );
        const origin = new URL(BASE).origin;

        if (args['sheet-only']) {
            await renderSheet(cdp, allFrames, JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')), String(args.sheet), noMobile);

            return;
        }

        if (CONTROLS) {
            for (const frame of frames) {
                const page = await openPage(cdp, VIEWPORT[frame.platform]);
                const url = new URL(frame.src, origin).href;

                try {
                    await openClean(page, url);

                    const problem = await seedProblem(page, await waitSeed(page, url));

                    await sleep(SETTLE_MS);

                    const controls = await page.evaluate(`(${LIST_CONTROLS})()`);

                    console.log(`\n=== ${frame.id} · ${controls.length} элементов${problem ? `\n  ! ${problem}` : ''}`);
                    controls.forEach(line => console.log(`  ${line}`));
                } finally {
                    await clearStorage(page);
                    await page.close();
                }
            }

            return;
        }

        const result = {
            ...previous,
            base: BASE,
            density: DENSITY,
            frames: { ...previous.frames },
            generatedAt: new Date().toISOString(),
            scale: SCALE,
        };
        const missing = [];
        const weak = [];
        const seedFailures = [];
        const frameErrors = [];
        const overflow = [];
        const tooltips = [];
        const chromeLabels = new Set();

        console.log(`Кадров: ${frames.length}`);

        for (const [index, frame] of frames.entries()) {
            const viewport = VIEWPORT[frame.platform];
            const page = await openPage(cdp, viewport);
            const url = new URL(frame.src, origin).href;

            try {
                if (index === 0) {
                    await openClean(page, url);
                } else {
                    await page.navigate(url);
                    await page.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
                }

                const seedState = await waitSeed(page, url);
                const problem = await seedProblem(page, seedState);
                /* Отпечаток рецепта, с которым снят кадр: spec-lint сверит его с текущим рецептом. */
                const recipe = await page.evaluate('document.documentElement.dataset.specSeedRecipe || ""');

                if (problem) {
                    seedFailures.push(`${frame.id}: ${problem}`);
                }

                await sleep(SETTLE_MS);

                const anchors = {};
                const lost = [];

                if (frame.queries.length) {
                    const measured = await page.evaluate(`(${RESOLVER})(${JSON.stringify(frame.queries)})`);

                    measured.forEach(item => {
                        if (item.found) {
                            anchors[item.to] = { h: item.h, query: item.query, w: item.w, x: item.x, y: item.y };

                            if (item.weak) {
                                anchors[item.to].weak = true;
                                weak.push(`${frame.id} → ${item.to}: «${item.query}»`);
                            }
                        } else {
                            lost.push({ query: item.query, to: item.to });
                            missing.push(`${frame.id} → ${item.to}: «${item.query}»`);
                        }
                    });
                }

                /* Что видно на кадре: вид (для дублей), текст продукта (для подписей), тултип, вылет вправо. */
                const seen = await page.evaluate(`(async () => { ${LIB}
                    const right = await widthWithoutChrome();
                    return {
                        chrome: [...document.querySelectorAll('[data-spec-chrome]')].flatMap(box =>
                            [...box.querySelectorAll(CLICKABLE + ', option')].map(el =>
                                String(el.innerText || el.textContent || '').split('\\n').map(norm).filter(Boolean)[0] || '')).filter(Boolean),
                        overflow: Math.round(right - ${viewport.width}),
                        text: productText().toLowerCase().slice(0, 4000),
                        tooltip: tooltipText(),
                        view: (${VIEW_HASH})(viewSig()),
                    };
                })()`);
                const overflowX = frame.platform === 'mobile' && seen.overflow > 8;

                seen.chrome.forEach(label => chromeLabels.add(label));

                if (overflowX && !noMobile['*'] && !noMobile[frame.id.replace(/@m$/, '')]) {
                    overflow.push(frame.id);
                }

                if (seen.tooltip) {
                    tooltips.push(`${frame.id}: «${seen.tooltip}»`);
                }

                const image = await page.screenshot(viewport.width, viewport.height);
                const file = fileOf(frame.id);

                fs.writeFileSync(path.join(OUT_DIR, file), image);
                result.frames[frame.id] = {
                    anchors,
                    file,
                    height: Math.round(viewport.height * SCALE),
                    missing: lost,
                    overflowX: Boolean(overflowX),
                    recipe: recipe || undefined,
                    seed: seedState,
                    text: seen.text,
                    tooltip: seen.tooltip || undefined,
                    url: frame.src.replace(/^[^?]*/, ''),
                    view: seen.view,
                    width: Math.round(viewport.width * SCALE),
                };
                console.log(
                    `${String(index + 1).padStart(3)}/${frames.length} ${frame.id} · ${Math.round(image.length / 1024)} КБ` +
                    ` · якорей ${Object.keys(anchors).length}/${frame.queries.length}${problem ? ' · ! рецепт' : ''}`,
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                frameErrors.push(`${frame.id}: ${message}`);
                /* Старый снимок упавшего кадра не оставляем: на карте он выглядел бы как свежий. */
                delete result.frames[frame.id];
                console.error(`  !! ${frame.id}: ${message}`);
            } finally {
                await clearStorage(page);
                await page.close();
            }
        }

        /* `--prune`: снимки кадров, которых на борде больше нет (сняты с карты), удаляются вместе
           с записями — иначе мёртвые картинки едут в сборку. Только при полном прогоне. */
        if (args.prune && !ONLY) {
            const onBoard = new Set(frames.map(frame => frame.id));

            Object.keys(result.frames).forEach(id => {
                if (!onBoard.has(id)) {
                    const file = path.join(OUT_DIR, result.frames[id].file);

                    if (fs.existsSync(file)) {
                        fs.rmSync(file);
                    }

                    delete result.frames[id];
                }
            });
            fs.readdirSync(OUT_DIR).forEach(file => {
                if (!Object.values(result.frames).some(entry => entry.file === file)) {
                    fs.rmSync(path.join(OUT_DIR, file));
                }
            });
        }

        /* Дубли — по всем снимкам карты, не только по снятым сейчас. */
        const byId = new Map(allFrames.map(frame => [frame.id, frame]));
        const entries = Object.entries(result.frames)
            .filter(([id, entry]) => byId.has(id) && fs.existsSync(path.join(OUT_DIR, entry.file)))
            .map(([id, entry]) => ({
                file: entry.file,
                id,
                platform: byId.get(id).platform,
                section: sectionOf(byId.get(id).code),
                view: entry.view,
            }));
        const dups = await findDuplicates(cdp, entries);
        const same = [];
        const sameView = [];
        const near = [];

        Object.keys(result.frames).forEach(id => {
            delete result.frames[id].dup;

            if (!dups[id]) {
                return;
            }

            const { diff, id: other, same: identical, sameView: oneView } = dups[id];
            const desktopSame = id.endsWith('@m') && dups[id.replace(/@m$/, '')]?.same;
            const line = `${id} ≈ ${other}: отличие ${(diff * 100).toFixed(2)} %`;

            result.frames[id].dup = {
                diff: Number(diff.toFixed(5)),
                id: other,
                same: identical,
                sameView: Boolean(oneView),
            };

            if (identical && id.endsWith('@m') && !desktopSame) {
                same.push(`${line} — телефоны одинаковы при разных десктопах: у этого кадра телефон не нужен (MAP_NO_MOBILE['${id.replace(/@m$/, '')}'] с причиной)`);
            } else if (identical && !id.endsWith('@m')) {
                same.push(line);
            } else if (oneView && !id.endsWith('@m')) {
                sameView.push(`${line} — вид тот же, отличаются только отметки или значения полей`);
            } else if (!id.endsWith('@m')) {
                near.push(line);
            }
        });

        result.chrome = [...chromeLabels];

        fs.writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);

        if (args.sheet) {
            await renderSheet(cdp, allFrames, result, String(args.sheet), noMobile);
        }

        console.log(`\nЗаписано: ${path.relative(ROOT, OUT_JSON)}, картинки в ${path.relative(ROOT, OUT_DIR)}/`);

        const report = (title, lines, stream = console.error) => {
            if (lines.length) {
                stream(`\n${title} (${lines.length}):`);
                lines.forEach(line => stream(`  - ${line}`));
            }
        };

        report('Рецепты шагов не доиграли — их снимки показывают не тот экран', seedFailures);
        report('Кадры не снялись — их снимков нет', frameErrors);
        report('Одинаковые кадры — это один экран: убери лишний кадр или допиши рецепт до видимого отличия', same);
        report(
            'Один вид — отличаются только отметки или значения: это ОДИН кадр (caption не спасает) — убери лишний',
            sameView,
        );
        report('На снимке висит тултип — он закрывает интерфейс: у последнего шага рецепта поставь blur: true', tooltips);
        report(
            'Телефон — обрезанный десктоп (страница шире 375): у прототипа нет телефонной вёрстки — ' +
            'убери телефоны и запиши причину в MAP_NO_MOBILE[\'*\']',
            overflow,
        );
        report(
            'Почти одинаковые кадры одной секции — если отличие существенное (тумблер, статус), назови его в ' +
            'caption; если это то же состояние — убери кадр',
            near,
            console.log,
        );
        report('Якоря не нашлись — label перехода не совпал с кнопкой на экране (текст бери из --probe)', missing, console.log);
        report('Якорь нашёлся текстом, а не кнопкой — label должен быть текстом КНОПКИ', weak, console.log);

        const blocking = [seedFailures, frameErrors, same, sameView, overflow, tooltips];

        if (blocking.some(list => list.length)) {
            process.exitCode = 1;
        }
    } finally {
        await close();
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
