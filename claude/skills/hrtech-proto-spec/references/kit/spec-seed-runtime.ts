/**
 * ДВИЖОК РЕЦЕПТОВ `?seed=<id>` — общий, от продукта не зависит, копируется в другой прототип
 * как есть. Рецепты конкретного продукта — в `spec-seeds.ts`.
 *
 * Зачем. Живой продукт почти всегда адресуем хуже спеки: ответы чата, шторки, меню и окна
 * открываются только действиями человека. Шаг спеки проигрывает этот путь от чистого старта:
 *  - `actions` — те же действия редьюсера, что шлют кнопки (детерминированно и сразу);
 *  - `clicks` — клики, ввод и прокрутка для того, что живёт в состоянии компонентов.
 * Статус пишется на `<html data-spec-seed>`: `running` — рецепт запущен, `ready` — доиграл,
 * `failed` — сломался (нет рецепта, упало действие, не нашлась кнопка). Атрибута нет вовсе —
 * рецепты не подключены (некому вызвать `applySpecSeed`). Сломанный шаг НЕ выглядит как нужный
 * экран: поверх кадра встаёт плашка с причиной, генератор снимков падает.
 *
 * Поиск кнопки — тот же, что у разведки `spec-snapshots.mjs --probe --click` (правьте вместе):
 * только в верхнем открытом окне, если оно есть; по всей странице, а не только в первом экране
 * (перед кликом элемент прокручивается в вид); перекрытые и скрытые элементы не годятся.
 *
 * Без параметра `seed` модуль ничего не делает — продукт не меняется.
 */

/** Шаг рецепта: клик, ввод в поле или прокрутка. */
export interface SeedClick {
    /**
     * Текст кнопки/ссылки или её `aria-label`/`title` (хватает начала строки); для `type` —
     * placeholder или `aria-label` поля; для `scroll` — текст внутри области, которую крутить.
     */
    text?: string;
    /** Только на этой ширине (телефон — уже 640). */
    only?: 'desktop' | 'mobile';
    /** Ввести текст в поле (вместо клика). */
    type?: string;
    /** Прокрутить: к началу, к концу или на N px вниз. С `text` — область с этим текстом, без — страницу. */
    scroll?: 'top' | 'bottom' | number;
    /** Пауза после шага, мс (анимации шторок, ответ модели). */
    wait?: number;
    /** После клика фокус снимается сам (иначе на снимке висит тултип кнопки); `keepFocus` — оставить. */
    keepFocus?: boolean;
    /** Снять фокус после шага принудительно (например, окно открылось с автофокусом на кнопке с тултипом). */
    blur?: boolean;
    /** Курсор поля в начало — иначе длинный текст показан хвостом. */
    caretStart?: boolean;
}

export interface SeedRecipe<S, A> {
    /** Шаг первого входа: разовые окна знакомства не пропускаем. */
    firstVisit?: boolean;
    /** Только для варианта А (модель с редьюсером). */
    actions?: (state: S, run: (state: S, action: A) => S) => S;
    clicks?: SeedClick[];
}

export const SPEC_SEED_PARAM = 'seed';
export const SPEC_SEED_ATTR = 'specSeed';

/**
 * Seed читается ОДИН раз при загрузке модуля: продукт может переписать адрес в своём эффекте
 * (`replaceState` с новыми параметрами) раньше, чем SpecGate запустит рецепт.
 */
const INITIAL_SEED = (() => {
    try {
        return new URLSearchParams(window.location.search).get(SPEC_SEED_PARAM);
    } catch {
        return null;
    }
})();

export const readSeed = (): string | null => INITIAL_SEED;

/** Есть ли в адресе шаг спеки — тогда модель стартует с чистого продукта. */
export const hasSeed = (): boolean => Boolean(readSeed());

/** Рецепт уже запущен (вариантом А из модели или SpecGate) — второй раз не запускаем. */
export const seedStarted = (): boolean => Boolean(document.documentElement.dataset[SPEC_SEED_ATTR]);

const markReady = () => {
    document.documentElement.dataset[SPEC_SEED_ATTR] = 'ready';
};

/** Сломанный шаг: статус + плашка поверх кадра, чтобы не спутать с нужным экраном. */
const markFailed = (reason: string) => {
    document.documentElement.dataset[SPEC_SEED_ATTR] = 'failed';
    /* Причину читает генератор снимков и печатает в консоль — чинить по ней, а не наугад. */
    document.documentElement.dataset.specSeedReason = reason;
    console.warn(`[spec seed] ${reason}`);

    const banner = document.createElement('div');

    banner.setAttribute('role', 'alert');
    banner.textContent = `Шаг спеки не доигран: ${reason}`;
    Object.assign(banner.style, {
        background: '#b3261e',
        color: '#fff',
        font: '500 14px/20px sans-serif',
        left: '0',
        padding: '8px 12px',
        position: 'fixed',
        right: '0',
        top: '0',
        zIndex: '2147483647',
    });
    document.body.append(banner);
};

const norm = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

const CLICKABLE = 'button, a, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="link"], ' +
    '[role="switch"], [role="checkbox"], [role="radio"], label, summary';
const FIELD = 'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), ' +
    'textarea, select, [contenteditable="true"]';
const LAYER = '[role="dialog"], [aria-modal="true"], dialog[open]';

/** Показан ли элемент вообще (где угодно на странице, не только в первом экране). */
const shown = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();

    if (rect.width <= 1 || rect.height <= 1) {
        return false;
    }

    const style = window.getComputedStyle(element);

    return style.visibility !== 'hidden' && Number(style.opacity) >= 0.05 &&
        !element.closest('[aria-hidden="true"], [inert]');
};

const inViewport = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();

    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
};

/** Открыто окно или шторка — искать только в верхнем: иначе кликнется кнопка под скримом. */
const scope = (): ParentNode => {
    const layers = [...document.querySelectorAll(LAYER)].filter(shown);

    return layers.length ? layers[layers.length - 1] : document;
};

/** Подпись поля: `<label for>`, обёртка-label и `aria-labelledby`. */
const labelsOf = (element: HTMLElement): string => {
    const own = 'labels' in element ? [...((element as HTMLInputElement).labels ?? [])].map(label => label.innerText) : [];
    const by = (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
        .map(id => document.getElementById(id)?.innerText ?? '');

    return norm([...own, ...by].join(' '));
};

const scoreOf = (element: HTMLElement, want: string): number => [
    norm(element.textContent),
    /* innerText держит переносы между словами («Claude Подключить»), textContent — нет. */
    norm(element.innerText),
    norm(element.getAttribute('aria-label')),
    norm(element.getAttribute('title')),
    norm(element.getAttribute('placeholder')),
    labelsOf(element),
]
    .map(text => text.toLowerCase())
    .reduce((top, text) => {
        if (!text) {
            return top;
        }

        if (text === want) {
            return Math.max(top, 3);
        }

        if (text.startsWith(want)) {
            return Math.max(top, 2);
        }

        return Math.max(top, text.includes(want) ? 1 : 0);
    }, 0);

/** Перекрыт ли элемент (скрим, другое окно): центр элемента принадлежит чужому узлу. */
const covered = (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

    if (!hit) {
        return false;
    }

    return !element.contains(hit) && !hit.contains(element) &&
        !(element instanceof HTMLLabelElement && element.control === hit);
};

/**
 * Кнопка или поле по тексту: точное совпадение лучше начала строки, начало — лучше вхождения;
 * при равенстве — видимое в первом экране, потом короткое. Кандидат прокручивается в вид и
 * отбрасывается, если перекрыт. Сначала ищем в верхнем окне; нет там — по всей странице
 * (элементы вне окна, но поверх скрима, — например, эмуляция чужого экрана), перекрытые
 * по-прежнему не годятся.
 */
const findTarget = (query: string, field: boolean): HTMLElement | null => {
    const want = norm(query).toLowerCase();
    const pick = (root: ParentNode): HTMLElement | null => {
        const candidates = [...root.querySelectorAll<HTMLElement>(field ? FIELD : CLICKABLE)]
            .filter(shown)
            .map(element => ({ element, score: scoreOf(element, want) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score ||
                Number(inViewport(b.element)) - Number(inViewport(a.element)) ||
                norm(a.element.textContent).length - norm(b.element.textContent).length);

        for (const { element } of candidates) {
            element.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });

            if (!covered(element)) {
                return element;
            }
        }

        return null;
    };
    const layer = scope();

    return pick(layer) ?? (layer === document ? null : pick(document));
};

/** Что можно нажать или заполнить — подсказка в причине сбоя, чтобы не гадать текст. */
const visibleLabels = (field: boolean): string => {
    const labels = new Set<string>();

    scope().querySelectorAll<HTMLElement>(field ? FIELD : CLICKABLE).forEach(element => {
        if (!shown(element)) {
            return;
        }

        const label = norm(element.innerText) || norm(element.getAttribute('aria-label')) ||
            norm(element.getAttribute('placeholder')) || norm(element.getAttribute('title')) || labelsOf(element);

        if (label && label.length <= 60) {
            labels.add(`«${label}»`);
        }
    });

    return labels.size ? [...labels].slice(0, 24).join(', ') : 'ничего';
};

/** Область прокрутки: ближайший прокручиваемый предок элемента, иначе страница или самая большая. */
const scrollerOf = (from: Element | null): Element => {
    const scrollable = (element: Element) => {
        const style = window.getComputedStyle(element);

        return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    };

    for (let element = from?.parentElement ?? null; element; element = element.parentElement) {
        if (scrollable(element)) {
            return element;
        }
    }

    const page = document.scrollingElement ?? document.documentElement;

    if (from || page.scrollHeight > page.clientHeight + 1) {
        return page;
    }

    return [...document.querySelectorAll('body *')]
        .filter(scrollable)
        .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] ?? page;
};

/** Элемент с таким текстом (любой, не только кнопка) — для прокрутки его области. */
const findText = (query: string): Element | null => {
    const want = norm(query).toLowerCase();

    return [...document.querySelectorAll<HTMLElement>('body *')]
        .filter(element => shown(element) && norm(element.textContent).toLowerCase().includes(want))
        .sort((a, b) => norm(a.textContent).length - norm(b.textContent).length)[0] ?? null;
};

const typeInto = (target: HTMLElement, value: string): boolean => {
    target.focus();

    /* Список: вариант по тексту (как его видит человек) или по value. */
    if (target instanceof HTMLSelectElement) {
        const option = [...target.options].find(item => norm(item.textContent) === norm(value) || item.value === value);

        if (!option) {
            return false;
        }

        target.value = option.value;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
    }

    if (target.isContentEditable) {
        document.getSelection()?.selectAllChildren(target);
        document.execCommand('insertText', false, value);

        return !value || norm(target.textContent).length > 0;
    }

    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set;

    if (!setter) {
        return false;
    }

    setter.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));

    return !value || String((target as HTMLInputElement).value ?? '').length > 0;
};

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const runSteps = async(id: string, clicks: SeedClick[]) => {
    const isMobile = window.innerWidth < 640;

    for (const step of clicks) {
        if ((step.only === 'mobile' && !isMobile) || (step.only === 'desktop' && isMobile)) {
            continue;
        }

        if (step.scroll !== undefined) {
            const anchor = step.text ? findText(step.text) : null;

            if (step.text && !anchor) {
                markFailed(`«${id}»: для прокрутки не нашёлся текст «${step.text}»`);

                return;
            }

            const scroller = scrollerOf(anchor);

            if (step.scroll === 'top') {
                scroller.scrollTop = 0;
            } else if (step.scroll === 'bottom') {
                scroller.scrollTop = scroller.scrollHeight;
            } else {
                scroller.scrollTop += step.scroll;
            }

            await sleep(step.wait ?? 500);
            continue;
        }

        if (!step.text) {
            markFailed(`«${id}»: у шага нет text (и это не scroll)`);

            return;
        }

        const field = step.type !== undefined;
        let target: HTMLElement | null = null;

        for (let attempt = 0; attempt < 40 && !target; attempt++) {
            target = findTarget(step.text, field);

            if (!target) {
                await sleep(150);
            }
        }

        if (!target) {
            markFailed(
                `«${id}»: ${field ? 'не нашлось поле' : 'не нашлась кнопка'} «${step.text}»; ` +
                `на экране есть: ${visibleLabels(field)}`,
            );

            return;
        }

        if (field) {
            if (!typeInto(target, step.type ?? '')) {
                markFailed(`«${id}»: в «${step.text}» не удалось ввести текст`);

                return;
            }
        } else {
            target.click();
        }

        await sleep(step.wait ?? 350);

        const active = document.activeElement;

        if (step.caretStart && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
            try {
                active.setSelectionRange(0, 0);
            } catch {
                /* email/number не умеют выделение — курсор не трогаем */
            }

            active.scrollLeft = 0;
        }

        /* Фокус остался на нажатой кнопке — снимаем сам: иначе на снимке висит её тултип и рамка.
           Фокус ушёл внутрь открывшегося меню или окна — не трогаем (оно может закрыться на blur). */
        const stuck = !field && active instanceof HTMLElement && (active === target || target.contains(active));
        /* Автофокус в открывшемся окне на кнопке с тултипом — тоже снять: тултип закроет снимок. */
        const describedTip = active instanceof HTMLElement && (active.getAttribute('aria-describedby') ?? '')
            .split(/\s+/).filter(Boolean).some(id => {
                const tip = document.getElementById(id);

                return Boolean(tip && tip.getAttribute('role') === 'tooltip' && shown(tip));
            });

        if (active instanceof HTMLElement && !step.keepFocus && (stuck || describedTip || step.blur)) {
            active.blur();
        }
    }

    markReady();
};

const runClicks = async(id: string, clicks: SeedClick[]) => {
    try {
        await runSteps(id, clicks);
    } catch (error) {
        markFailed(`«${id}»: шаг упал — ${error instanceof Error ? error.message : String(error)}`);
    }
};

let scheduled = false;

/**
 * Применяльщик рецептов продукта. Вызывается один раз при создании стартового состояния модели
 * (вариант А) или из `SpecGate` после первой отрисовки (вариант Б, `state` = null).
 *
 * @param recipes рецепты продукта по id
 * @param prepare что сделать со стартом перед рецептом (например, считать знакомство пройденным)
 * @returns функция (стартовое состояние, редьюсер) → состояние после действий рецепта; клики
 *   рецепта запускаются после первого кадра
 */
export const createSeedApplier = <S, A>(
    recipes: Record<string, SeedRecipe<S, A>>,
    prepare: (state: S) => S = state => state,
) => (state: S, run: (state: S, action: A) => S): S => {
        const id = readSeed();

        if (!id) {
            return state;
        }

        if (!document.documentElement.dataset[SPEC_SEED_ATTR]) {
            document.documentElement.dataset[SPEC_SEED_ATTR] = 'running';
        }

        const recipe = recipes[id];
        const schedule = (task: () => void) => {
            if (!scheduled) {
                scheduled = true;
                window.setTimeout(task, 400);
            }
        };

        if (!recipe) {
            schedule(() => markFailed(`нет рецепта «${id}» в spec-seeds.ts`));

            return state;
        }

        if (recipe.actions && state === null) {
            schedule(() => markFailed(
                `«${id}»: у рецепта actions — это вариант А, его вызывает модель прототипа (шапка spec-seeds.ts); ` +
                'без редьюсера пиши рецепт одними clicks',
            ));

            return state;
        }

        const start = recipe.firstVisit ? state : prepare(state);

        try {
            const next = recipe.actions ? recipe.actions(start, run) : start;

            schedule(() => (recipe.clicks?.length ? void runClicks(id, recipe.clicks) : markReady()));

            return next;
        } catch (error) {
            schedule(() => markFailed(`«${id}»: ${error instanceof Error ? error.message : String(error)}`));

            return start;
        }
    };
