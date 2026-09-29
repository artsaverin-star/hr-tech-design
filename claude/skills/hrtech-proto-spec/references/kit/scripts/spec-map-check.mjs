#!/usr/bin/env node
/* eslint-disable no-console -- консольная утилита, вывод и есть её результат */
/**
 * Приёмка «Карты сценариев»: геометрия каждой секции проверяется в живом браузере.
 *
 * Что считается дефектом (ноль — условие сдачи, hrtech-proto-spec §2):
 *   - линия не ортогональна (есть косой отрезок);
 *   - линия проходит через экран, подпись экрана или ромб, кроме своих концов;
 *   - плашки подписей налезают друг на друга, на экраны, ромбы или заголовки дорожек;
 *   - заголовок дорожки пересекает линию;
 *   - текст плашки обрезан (не влез в отведённое место);
 *   - узлы налезают друг на друга;
 *   - у экрана нет ни входящей линии, ни входной точки, ни ссылки «←» (висит в воздухе);
 *   - дыра в нумерации основного пути («02.1 → ◇ → 02.3»);
 *   - прямая между соседями длиннее двух зазоров с ромбом (пустота посреди ряда);
 *   - заголовок дорожки или ссылка под экраном обрезаны многоточием;
 *   - у перехода, нажатого кнопкой, на снимке не нашлась кнопка (рамки при наведении не будет);
 *   - есть страховочная секция «Не вошло в сценарии»;
 *   - у экрана нет телефона (без причины в `MAP_NO_MOBILE`), нет снимка или снимок мылится
 *     (плотность ниже 2× — на ретине пикселит);
 *   - по `spec-snapshots.json`: рецепт кадра не доиграл или не подключён, два кадра одинаковы,
 *     телефон — обрезанный десктоп, снимок снят с другого адреса или старым генератором
 *     (перезапусти `spec-snapshots.mjs`). Почти одинаковые кадры секции — предупреждение.
 * Карта не открылась (нет `window.__specBoardLayout`) — это не «чисто», а ошибка с кодом 2.
 *
 * Запуск (нужен дев-сервер витрины), из папки прототипа:
 *   node src/scripts/spec-map-check.mjs --base https://prototipnitsa.local.yandex-team.ru:<порт>/prototype-builds/<slug>/
 *   node src/scripts/spec-map-check.mjs --base <адрес> --zone 02             # одна секция
 *   node src/scripts/spec-map-check.mjs --base <адрес> --shots /tmp/spec-shots  # + скриншоты секций и «Сценария»
 *
 * Библиотек нет: прямой CDP через глобальный WebSocket Node ≥ 22 (как spec-snapshots.mjs).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const args = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, token, index, list) => {
        if (token.startsWith('--')) {
            const next = list[index + 1];

            pairs.push([token.slice(2), next && !next.startsWith('--') ? next : true]);
        }

        return pairs;
    }, []),
);
const BASE = String(args.base ?? `https://prototipnitsa.local.yandex-team.ru:3000/prototype-builds/${MANIFEST.slug}/`).replace(/\/?$/, '/');
const CHROME = args.chrome ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Проверка одной секции — выполняется В СТРАНИЦЕ карты. */
const CHECK = `(sectionIndex) => {
    const layout = window.__specBoardLayout;
    const section = layout.sections[sectionIndex];
    const nodes = layout.nodes.filter(n => n.section === sectionIndex);
    const edges = layout.edges.filter(e => e.section === sectionIndex);
    const lanes = layout.lanes.filter(l => l.section === sectionIndex);
    const defects = [];
    const EPS = 2;
    const inter = (a, b, pad = 0) => a.x < b.x + b.width - pad && b.x < a.x + a.width - pad && a.y < b.y + b.height - pad && b.y < a.y + a.height - pad;
    const shrink = (r, k) => ({ x: r.x + k, y: r.y + k, width: r.width - 2 * k, height: r.height - 2 * k });
    /* Узлы: экран(ы) + подпись у кадра; у ромба — вписанный квадрат (ромб по углам пуст). */
    const boxes = nodes.map(n => n.kind === 'decision' ?
        { id: n.id, kind: 'ромб', rect: shrink({ x: n.x, y: n.y, width: n.width, height: n.height }, n.width * 0.2) } :
        { id: n.id, kind: 'экран', rect: { x: n.x, y: n.y, width: n.width, height: n.height } });
    /* Путь SVG → отрезки ломаной (Q-скругления заменяем их углом). */
    const segmentsOf = d => {
        const nums = d.replace(/[MLQ]/g, ' ').trim().split(/\\s+/).map(Number);
        const cmds = d.match(/[MLQ]/g);
        const pts = [];
        let i = 0;
        cmds.forEach(c => {
            if (c === 'Q') { pts.push([nums[i], nums[i + 1]]); i += 4; } else { pts.push([nums[i], nums[i + 1]]); i += 2; }
        });
        const clean = pts.filter((p, k) => k === 0 || Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) > 0.5);
        return clean.slice(1).map((p, k) => [clean[k], p]);
    };
    const segRect = ([a, b]) => ({ x: Math.min(a[0], b[0]) - 1, y: Math.min(a[1], b[1]) - 1, width: Math.abs(a[0] - b[0]) + 2, height: Math.abs(a[1] - b[1]) + 2 });

    const canvas = document.querySelector('[data-focus], [class*="canvas"][style*="transform"]');
    const m = /scale\\(([\\d.]+)\\)/.exec(canvas.style.transform);
    const scale = m ? Number(m[1]) : 1;
    const cr = canvas.getBoundingClientRect();
    const offX = section.x - 48;
    const offY = section.y - 48;
    const toBoard = r => ({ x: (r.left - cr.left) / scale + offX, y: (r.top - cr.top) / scale + offY, width: r.width / scale, height: r.height / scale });
    const labels = [...document.querySelectorAll('[class*="edgeLabel"]')].filter(el => el.style.left).map(el => {
        const text = el.firstElementChild;
        return { text: el.textContent, rect: toBoard(el.getBoundingClientRect()), clipped: text && text.scrollHeight > text.clientHeight + 1 };
    });
    const titles = [...document.querySelectorAll('[class*="laneHead"]')].map(el => ({ text: el.textContent, rect: toBoard(el.getBoundingClientRect()) }));

    edges.forEach(e => {
        const segs = segmentsOf(e.d);
        segs.forEach(([a, b]) => {
            if (Math.abs(a[0] - b[0]) > EPS && Math.abs(a[1] - b[1]) > EPS) {
                defects.push('косой отрезок: ' + e.id);
            }
        });
        segs.forEach(seg => {
            const r = segRect(seg);
            boxes.forEach(b => {
                const own = b.id === e.from || b.id === e.to;
                if (inter(r, shrink(b.rect, own ? 4 : 1))) {
                    defects.push('линия ' + e.id + ' проходит через ' + b.kind + ' ' + b.id);
                }
            });
            titles.forEach(t => {
                if (inter(r, t.rect, 1)) defects.push('линия ' + e.id + ' режет заголовок дорожки «' + t.text + '»');
            });
        });
    });
    labels.forEach((l, i) => {
        if (l.clipped) defects.push('подпись обрезана: «' + l.text + '»');
        labels.slice(i + 1).forEach(o => { if (inter(l.rect, o.rect, 1)) defects.push('подписи налезают: «' + l.text + '» / «' + o.text + '»'); });
        boxes.forEach(b => { if (inter(l.rect, b.rect, 2)) defects.push('подпись «' + l.text + '» лежит на ' + b.kind + ' ' + b.id); });
        titles.forEach(t => { if (inter(l.rect, t.rect, 1)) defects.push('подпись «' + l.text + '» на заголовке «' + t.text + '»'); });
    });
    boxes.forEach((b, i) => boxes.slice(i + 1).forEach(o => { if (inter(b.rect, o.rect, 1)) defects.push('узлы налезают: ' + b.id + ' / ' + o.id); }));
    /* Линии пересекаются: вертикаль одного ребра проходит сквозь горизонталь другого (стволы
       одного источника совпадают намеренно — это веер, не пересечение). */
    const segs = edges.flatMap(e => segmentsOf(e.d).map(sg => ({ e, sg })));
    segs.forEach((p, i) => segs.slice(i + 1).forEach(q => {
        if (p.e.id === q.e.id || p.e.from === q.e.from) return;
        const [a1, a2] = p.sg; const [b1, b2] = q.sg;
        const pv = Math.abs(a1[0] - a2[0]) < EPS; const qv = Math.abs(b1[0] - b2[0]) < EPS;
        if (pv === qv) return;
        const [v, h] = pv ? [p.sg, q.sg] : [q.sg, p.sg];
        const x = v[0][0]; const y = h[0][1];
        const inside = (t, u, w) => t > Math.min(u, w) + 3 && t < Math.max(u, w) - 3;
        if (inside(x, h[0][0], h[1][0]) && inside(y, v[0][1], v[1][1])) defects.push('линии пересекаются: ' + p.e.id + ' × ' + q.e.id);
    }));
    /* Нумерация основного пути — подряд, без дыр. */
    const mainLane = lanes.find(l => l.index === 0);
    if (mainLane) {
        const steps = nodes.filter(n => n.kind === 'frame' && n.row === mainLane.row && n.x >= mainLane.x && n.x <= mainLane.x + mainLane.width)
            .sort((a, b) => a.x - b.x).map(n => Number(n.code.split('.')[1]));
        steps.forEach((step, i) => { if (step !== i + 1) defects.push('дыра в нумерации основного пути: ' + nodes.find(n => Number(n.code.split('.')[1]) === step && n.row === mainLane.row)?.code); });
    }
    /* Пустота посреди ряда. Ромб стоит в своей узкой колонке — зазор до него ровно columnGap (280).
       Между экранами допустимы разница ширины колонки (пара 928 против экрана 720) и пустая
       колонка ромба, которую дорожка проходит насквозь (184 + 280 за каждую). */
    const byId = new Map(nodes.map(n => [n.id, n]));
    edges.filter(e => e.shape === 'straight').forEach(e => {
        const seg = segmentsOf(e.d)[0];
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!seg || !a || !b) return;
        const length = Math.abs(seg[1][0] - seg[0][0]);
        const skipped = Math.max(0, b.col - a.col - 1);
        const allowed = a.kind === 'decision' || b.kind === 'decision' ?
            280 + 208 + 8 :
            280 + 208 + skipped * (184 + 280) + 8;
        if (length > allowed) defects.push('пустота посреди ряда: ' + e.id + ' — ' + Math.round(length) + ' px');
    });
    /* Обрезанный текст: заголовки дорожек и ссылки. */
    [...document.querySelectorAll('[class*="laneTitle"], [class*="chipInk"]')].forEach(el => {
        if (el.scrollWidth > el.clientWidth + 1) defects.push('текст обрезан: «' + el.textContent + '»');
    });
    /* Кнопка перехода на снимке: у пользовательских переходов с подписью, вышедших из кадра. */
    edges.filter(e => e.kind === 'user' && e.label && e.shape !== 'entry' && !e.anchor).forEach(e => {
        defects.push('нет рамки на кнопке: ' + e.id + ' («' + e.label + '»)');
    });
    /* Телефон у каждого экрана и чёткие снимки. */
    nodes.filter(n => n.kind === 'frame').forEach(n => {
        if (!n.hasMobile && !(layout.noMobile || {})[n.id] && !(layout.noMobile || {})['*']) defects.push('нет телефона: ' + n.code + ' ' + n.id);
        const card = document.querySelector('[data-spec-node="' + n.id + '"]');
        const screens = card ? [...card.querySelectorAll('button')].filter(b => b.getAttribute('aria-label')?.includes('открыть в сценарии')) : [];
        screens.forEach(b => {
            const img = b.querySelector('img');
            if (!img) { defects.push('нет снимка: ' + n.code + ' ' + n.id); return; }
            if (img.complete && img.naturalWidth && img.naturalWidth < b.offsetWidth * 2 - 2) {
                defects.push('снимок мылится: ' + n.code + ' ' + n.id + ' — ' + img.naturalWidth + ' px на ' + b.offsetWidth + ' px экрана (нужно 2×)');
            }
        });
    });
    if (section.title === 'Не вошло в сценарии') defects.push('страховочная секция «Не вошло в сценарии»: разложить кадры или снять с карты');
    const incoming = new Set(edges.map(e => e.to));
    const chipIn = new Set(Object.values(layout.chipsOut).flat().map(c => c.to));
    nodes.forEach(n => {
        if (!incoming.has(n.id) && !chipIn.has(n.id)) defects.push('висит в воздухе: ' + n.id);
    });
    return { code: section.code, title: section.title, nodes: nodes.length, edges: edges.length, labels: labels.length, defects };
}`;

async function main() {
    if (!fs.existsSync(CHROME)) {
        throw new Error(`Chrome не найден: ${CHROME} — укажи путь флагом --chrome "<путь>"`);
    }

    const port = 9400 + Math.floor(Math.random() * 400);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-map-check-'));
    const chrome = spawn(CHROME, [
        '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
        '--ignore-certificate-errors', '--hide-scrollbars', '--no-first-run', '--window-size=1600,1000', 'about:blank',
    ], { stdio: 'ignore' });

    /* Упали на полпути — headless Chrome и его профиль не оставляем висеть. */
    process.on('exit', () => {
        chrome.kill();

        try {
            fs.rmSync(profile, { force: true, recursive: true });
        } catch {
            /* временная папка — уберёт система */
        }
    });

    let version = null;

    for (let attempt = 0; attempt < 50 && !version; attempt += 1) {
        await sleep(200);

        try {
            version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        } catch {
            /* Chrome ещё поднимается */
        }
    }

    if (!version) {
        chrome.kill();
        throw new Error('Chrome не поднял remote debugging — проверь путь --chrome');
    }

    const socket = new WebSocket(version.webSocketDebuggerUrl);

    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));

    let nextId = 0;
    const pending = new Map();
    const events = new Set();

    socket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data));

        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        } else {
            events.forEach(listener => listener(message));
        }
    });

    const send = (method, params = {}, sessionId) =>
        new Promise(resolve => {
            const id = ++nextId;

            pending.set(id, resolve);
            socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { flatten: true, targetId });
    const evaluate = async expression => {
        const reply = await send('Runtime.evaluate', { awaitPromise: true, expression, returnByValue: true }, sessionId);

        if (reply.result?.exceptionDetails) {
            throw new Error(reply.result.exceptionDetails.exception?.description ?? 'evaluate failed');
        }

        return reply.result?.result?.value;
    };
    const open = async url => {
        await send('Page.enable', {}, sessionId);
        const loaded = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                events.delete(listener);
                reject(new Error(`страница не загрузилась за 30 с: ${url}`));
            }, 30000);
            const listener = message => {
                if (message.method === 'Page.loadEventFired' && message.sessionId === sessionId) {
                    clearTimeout(timer);
                    events.delete(listener);
                    resolve();
                }
            };

            events.add(listener);
        });

        await send('Page.navigate', { url }, sessionId);
        await loaded;
        await sleep(1500);
    };
    const shot = async file => {
        const reply = await send('Page.captureScreenshot', { format: 'png' }, sessionId);

        fs.writeFileSync(file, Buffer.from(reply.result.data, 'base64'));
    };
    const finish = () => {
        socket.close();
        chrome.kill();
    };

    await send('Emulation.setDeviceMetricsOverride', { deviceScaleFactor: 1, height: 1000, mobile: false, width: 1600 }, sessionId);
    /* Первый заход ловит ERR_CERT_VERIFIER_CHANGED — прогревочный. */
    await open(`${BASE}?spec=map&zone=01`).catch(() => undefined);
    await open(`${BASE}?spec=map&zone=01`);

    /* До минуты: после правок Vite пересобирает зависимости. Карты нет — это ошибка, а не «чисто». */
    let count = 0;

    for (let attempt = 0; attempt < 120 && !count; attempt += 1) {
        count = await evaluate('window.__specBoardLayout ? window.__specBoardLayout.sections.length : 0');

        if (!count) {
            await sleep(500);
        }
    }

    if (!count) {
        const text = await evaluate('(document.body ? document.body.innerText : "").replace(/\\s+/g, " ").slice(0, 300)');

        finish();
        console.error(
            'Карта не открылась: на странице нет window.__specBoardLayout — дев-сервер, порт в --base или ' +
            `подключение вида (шаг 4: SpecGate в src/index.tsx). На странице: «${text || 'пусто'}»`,
        );
        process.exit(2);
    }

    /* Снимки: статус рецептов, дубли, вылет телефона, адрес съёмки — из spec-snapshots.json. */
    const snapshotsFile = path.join(ROOT, 'src', 'spec-snapshots.json');
    const shots = fs.existsSync(snapshotsFile) ? JSON.parse(fs.readFileSync(snapshotsFile, 'utf8')).frames ?? {} : {};
    const boardFrames = JSON.parse(await evaluate('JSON.stringify((window.__specBoard || { frames: [] }).frames)'));
    const noMobile = JSON.parse(await evaluate('JSON.stringify(window.__specBoardLayout.noMobile || {})'));
    const shotProblems = (frame, warnings) => {
        const entry = shots[frame.id];
        const name = `${frame.code} ${frame.id}`;

        if (!entry) {
            return [];
        }

        const problems = [];
        const url = frame.src.replace(/^[^?]*/, '');

        if (entry.url === undefined) {
            problems.push(`снимок снят старым генератором: ${name} — перезапусти spec-snapshots.mjs --prune`);
        } else if (entry.url !== url) {
            problems.push(`снимок снят с другого адреса: ${name} (${entry.url} ≠ ${url}) — перезапусти spec-snapshots.mjs`);
        }

        if (entry.seed && !['ready', 'none'].includes(entry.seed)) {
            problems.push(`рецепт не доиграл (${entry.seed}): ${name} — снимок показывает не тот экран`);
        }

        const phone = frame.id.endsWith('@m');

        if (entry.dup?.same && phone && !shots[frame.id.replace(/@m$/, '')]?.dup?.same) {
            problems.push(`телефоны одинаковы: ${name} = ${entry.dup.id} при разных десктопах — у одного кадра телефон не нужен (MAP_NO_MOBILE[id] с причиной)`);
        } else if (entry.dup?.same && !phone) {
            problems.push(`одинаковые кадры: ${name} = ${entry.dup.id} — это один экран`);
        } else if (entry.dup?.sameView && !frame.id.endsWith('@m')) {
            problems.push(`один вид: ${name} ≈ ${entry.dup.id} — отличаются только отметки или значения, это один кадр`);
        } else if (entry.dup && !frame.id.endsWith('@m')) {
            warnings.push(`почти одинаковые кадры: ${name} ≈ ${entry.dup.id} (${(entry.dup.diff * 100).toFixed(2)} %)`);
        }

        if (entry.tooltip) {
            problems.push(`на снимке тултип «${entry.tooltip}»: ${name} — у последнего шага рецепта blur: true, перезапусти съёмку`);
        }

        if (entry.overflowX && !noMobile['*'] && !noMobile[frame.id.replace(/@m$/, '')]) {
            problems.push(`телефон — обрезанный десктоп: ${name} (страница шире 375) — нет телефонной вёрстки`);
        }

        return problems;
    };

    if (args.shots) {
        fs.mkdirSync(String(args.shots), { recursive: true });
    }

    let total = 0;
    let checked = 0;
    const warnings = [];

    for (let index = 0; index < count; index += 1) {
        const code = String(index + 1).padStart(2, '0');

        if (args.zone && args.zone !== code) {
            continue;
        }

        checked += 1;
        await open(`${BASE}?spec=map&zone=${code}`);
        const report = await evaluate(`(${CHECK})(${index})`);
        const frames = boardFrames.filter(frame => String(frame.code).split('.')[0] === code);
        const unique = [...new Set([...report.defects, ...frames.flatMap(frame => shotProblems(frame, warnings))])];

        total += unique.length;
        console.log(`${report.code} · ${report.title}: экранов и ромбов ${report.nodes}, линий ${report.edges}, подписей ${report.labels} — ${unique.length ? `ДЕФЕКТОВ ${unique.length}` : 'чисто'}`);
        unique.forEach(line => console.log(`   - ${line}`));

        if (args.shots) {
            await shot(path.join(String(args.shots), `map-${code}.png`));
        }
    }

    if (args.shots) {
        const branch = await evaluate(
            'JSON.stringify((window.__specBoardLayout.nodes.find(n => n.kind === "frame" && n.row > 0) || {}).id || "")',
        );

        /* «Сценарий» сначала проигрывает рецепт шага в iframe — снимаем, когда плашка ожидания ушла. */
        const settled = async() => {
            for (let attempt = 0; attempt < 40; attempt += 1) {
                if (!(await evaluate('(document.body ? document.body.innerText : "").includes("Проигрываем путь")'))) {
                    break;
                }

                await sleep(500);
            }

            await sleep(1200);
        };

        await open(`${BASE}?spec=1`);
        await settled();
        await shot(path.join(String(args.shots), 'scenario.png'));

        if (JSON.parse(branch)) {
            await open(`${BASE}?spec=1&step=${encodeURIComponent(JSON.parse(branch))}`);
            await settled();
            await shot(path.join(String(args.shots), 'scenario-branch.png'));
        }

        console.log(`\nСкриншоты: ${args.shots}/map-NN.png, scenario.png${JSON.parse(branch) ? ', scenario-branch.png' : ''} — открой и посмотри.`);
    }

    finish();
    await sleep(300);
    fs.rmSync(profile, { force: true, recursive: true });

    if (!checked) {
        console.error(`\nНи одной секции не проверено: секции ${args.zone} нет (всего ${count}).`);
        process.exit(2);
    }

    [...new Set(warnings)].forEach((line, index) => console.log(`${index ? '' : '\nПредупреждения (сдачу не блокируют, но проверь глазами):\n'}   ! ${line}`));
    console.log(total ? `\nИтого дефектов: ${total}` : '\nКарта чистая.');
    process.exit(total ? 1 : 0);
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
});
