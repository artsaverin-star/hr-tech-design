/**
 * РЕЦЕПТЫ ШАГОВ СПЕКИ «Я Team & Mars» (`?seed=<id>`). Движок — `spec-seed-runtime.ts`.
 *
 * В текущей редакции (1.0, режимы «Марс» и «Сайт») почти всё живёт в разговоре и открывается
 * только действиями человека, поэтому шаг спеки проигрывает путь пользователя от чистого
 * старта — теми же действиями редьюсера, что шлют кнопки, и кликами по кнопкам. Тексты кнопок
 * в рецептах — дословно из словарей (`texts/*`). Ключ рецепта = id кадра в `spec-live.ts`,
 * мобильный двойник (`<id>@m`) открывается тем же адресом.
 *
 * Подключение в модели — две строки `model.ts`: `applySpecSeed` в `initialWithSetup` (старт с
 * чистого продукта, без настроек браузера) и `hasSpecSeed()` в эффекте записи настроек (шаг
 * спеки не пишет в localStorage — иначе подписка из рецепта «прилипала» к обычному прототипу).
 */

import { DEMO_NOW } from './chat-dates';
import { ACCESS_SERVICE_ID } from './data/access';
import type { assistantReducer, AssistantState } from './model';
import { createSeedApplier, hasSeed, type SeedRecipe } from './spec-seed-runtime';
import { STARTER_GROUPS } from './texts/prompt-starters';

type Reducer = typeof assistantReducer;
type Action = Parameters<Reducer>[1];
type Run = (state: AssistantState, action: Action) => AssistantState;
type Recipe = SeedRecipe<AssistantState, Action>;

const DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Помощники рецептов                                                   */
/* ------------------------------------------------------------------ */

const promptOf = (id: string): string => {
    const task = STARTER_GROUPS.flatMap(group => group.tasks).find(item => item.id === id);

    if (!task) {
        throw new Error(`нет пункта каталога «${id}»`);
    }

    return task.prompt;
};

/** Тикаем прогон до конца (или `limit` раз). */
const ticks = (state: AssistantState, run: Run, limit = 80): AssistantState => {
    let next = state;

    for (let i = 0; i < limit && next.working; i++) {
        next = run(next, { type: 'tick' });
    }

    return next;
};

/** Отправить пункт каталога: подтверждение Eliza (раз в сессию) и, если нужно, до конца ответа. */
const ask = (state: AssistantState, run: Run, id: string, finish = true): AssistantState => {
    const next = run(run(state, { text: promptOf(id), type: 'send' }), { type: 'confirm-subscription-send' });

    return finish ? ticks(next, run) : next;
};

const lastAgentId = (state: AssistantState): string => {
    const chat = state.chats.find(item => item.id === state.activeChatId);
    const message = [...(chat?.messages ?? [])].reverse().find(item => item.role === 'agent');

    return message?.id ?? '';
};

/** Решение по последней карточке разрешения + дотикать ответ. */
const decide = (state: AssistantState, run: Run, decision: 'once' | 'always' | 'never'): AssistantState =>
    ticks(run(state, { decision, messageId: lastAgentId(state), type: 'decide-permission' }), run);

/** Карточка доступа → «Получить доступ»: окно кода Яндекс ID. */
const openYandexId = (state: AssistantState, run: Run): AssistantState =>
    run(state, { decision: 'granted', messageId: lastAgentId(state), type: 'decide-access' });

/** …→ «Продолжить» в окне кода: согласие на права. */
const openConsent = (state: AssistantState, run: Run): AssistantState =>
    run(openYandexId(state, run), { overlay: 'consent', type: 'open-overlay' });

/** …→ «Передать права»: доступ выдан, задача идёт дальше — к разрешению действовать. */
const grantAccess = (state: AssistantState, run: Run): AssistantState =>
    ticks(run(openConsent(state, run), { serviceId: ACCESS_SERVICE_ID, type: 'grant-access' }), run);

/**
 * Несколько разговоров за разные дни — как у человека, который уже пользуется Марсом. Время
 * последней активности — посев истории (как `SEEDS` продукта), а не действие пользователя.
 */
const withHistory = (state: AssistantState, run: Run): AssistantState => {
    let next = ask(state, run, 'demo-result');
    const older = next.activeChatId;

    next = ask(run(next, { type: 'create-chat' }), run, 'demo-event-card');

    const yesterday = next.activeChatId;

    next = ask(run(next, { type: 'create-chat' }), run, 'day-plan');

    return {
        ...next,
        chats: next.chats.map(chat => {
            if (chat.id === older) {
                return { ...chat, updatedAt: DEMO_NOW - 6 * DAY };
            }

            return chat.id === yesterday ? { ...chat, updatedAt: DEMO_NOW - DAY } : chat;
        }),
    };
};

const toSettings = (state: AssistantState, run: Run) => run(state, { screen: 'access', type: 'set-screen' });
const settingsDrawer = (targetId: string) => (state: AssistantState, run: Run) =>
    run(toSettings(state, run), { overlay: 'settings', targetId, type: 'open-overlay' });

/** На 375 история и настройки живут в левой шторке меню (`common.chatMenu`). */
const OPEN_MENU_ON_PHONE = { only: 'mobile', text: 'Открыть меню чатов', wait: 800 } as const;

/* Кнопки окна первого входа (`texts/onboarding.ts`: `start`, `continue`). */
const START = { text: 'Начать', wait: 700 } as const;
const CONTINUE = { text: 'Продолжить', wait: 700 } as const;

/**
 * «Подключаем рабочие сервисы…» живёт 900 мс и сам переходит в чат — кликом его не поймать.
 * Кадр держит тот же показ, что и адресуемая ссылка окна `?state=v3-onboarding-connecting`
 * (`Onboarding.tsx`: код состояния замораживает ожидание на шаге доступов).
 */
const connectingPreview = (state: AssistantState, run: Run): AssistantState => ({
    ...run(run(state, { type: 'start-onboarding' }), { step: 2, type: 'set-onboarding-step' }),
    stateCode: 'v3-onboarding-connecting',
});

/* ------------------------------------------------------------------ */
/* Рецепты                                                              */
/* ------------------------------------------------------------------ */

export const SEED_RECIPES: Record<string, Recipe> = {
    /*
     * 01 · Первый вход. Окно открывает сам продукт — эффект первого входа на обычном адресе, —
     * поэтому шаги идут с `firstVisit` (знакомство не считается пройденным) и дальше только кликами.
     */
    'first-intro': { firstVisit: true },
    'first-source': { clicks: [START], firstVisit: true },
    'first-personal': { clicks: [START, { blur: true, text: 'Личная подписка', wait: 700 }], firstVisit: true },
    'first-access': { clicks: [START, CONTINUE], firstVisit: true },
    'first-yandex-id': {
        clicks: [START, CONTINUE, { blur: true, text: 'Подключить и открыть чат', wait: 900 }],
        firstVisit: true,
    },
    'first-connecting': { actions: connectingPreview, firstVisit: true },

    /* 02 · Старт */
    'mars-home': {},
    'mars-draft': { actions: (s, run) => run(s, { text: promptOf('day-plan'), type: 'save-chat-draft' }) },
    'mars-catalog': { clicks: [{ text: 'Все задачи', wait: 900 }] },
    'mars-confirm': { actions: (s, run) => run(s, { text: promptOf('day-plan'), type: 'send' }) },
    'mars-answer': { actions: (s, run) => ask(s, run, 'day-plan') },
    'mars-sub-level': {
        actions: (s, run) => run(s, { text: promptOf('day-plan'), type: 'send' }),
        clicks: [{ blur: true, text: 'На личную подписку', wait: 800 }],
    },
    'mars-sub-claude': {
        actions: (s, run) => run(s, { text: promptOf('day-plan'), type: 'send' }),
        clicks: [{ text: 'На личную подписку', wait: 700 }, { text: 'Claude', wait: 900 }],
    },
    'mars-sub-done': {
        actions: (s, run) => run(s, { text: promptOf('day-plan'), type: 'send' }),
        clicks: [
            { text: 'На личную подписку', wait: 700 },
            { text: 'Claude', wait: 900 },
            { text: 'sk-ant-oat01', type: 'sk-ant-oat01-demo-token' },
            { blur: true, text: 'Подключить подписку', wait: 1800 },
        ],
    },

    /* 03 · Долгая задача */
    'run-live': { actions: (s, run) => ticks(ask(s, run, 'demo-run', false), run, 1) },
    'run-stopped': { actions: (s, run) => run(ticks(ask(s, run, 'demo-run', false), run, 1), { type: 'stop' }) },
    'run-result': { actions: (s, run) => ask(s, run, 'demo-run') },
    'run-clarify': { actions: (s, run) => ask(s, run, 'demo-clarify') },
    'run-clarify-done': {
        actions: (s, run) => {
            const next = ask(s, run, 'demo-clarify');

            return ticks(run(next, { answer: 'two-weeks', messageId: lastAgentId(next), type: 'answer-clarify' }), run);
        },
    },
    'run-closed': { actions: (s, run) => ask(s, run, 'demo-closed') },
    'run-closed-done': {
        actions: (s, run) => {
            const next = ask(s, run, 'demo-closed');

            return ticks(run(next, { decision: 'skipped', messageId: lastAgentId(next), type: 'decide-access' }), run);
        },
    },

    /* 04 · Действия в сервисах */
    'act-access': { actions: (s, run) => ask(s, run, 'demo-access') },
    'act-yandex-id': { actions: (s, run) => openYandexId(ask(s, run, 'demo-access'), run) },
    'act-consent': { actions: (s, run) => openConsent(ask(s, run, 'demo-access'), run) },
    'act-permission': { actions: (s, run) => grantAccess(ask(s, run, 'demo-access'), run) },
    'act-applied': { actions: (s, run) => decide(grantAccess(ask(s, run, 'demo-access'), run), run, 'once') },
    'act-undone': {
        actions: (s, run) => {
            const next = decide(grantAccess(ask(s, run, 'demo-access'), run), run, 'once');

            return ticks(run(next, { messageId: lastAgentId(next), type: 'undo-applied' }), run);
        },
    },
    /* «Разрешать всегда» сразу даёт тот же экран, что «Один раз»; различие видно в СЛЕДУЮЩИЙ
       раз — его и показывает кадр (демо «Создано по правилу»). */
    'act-applied-rule': { actions: (s, run) => ask(s, run, 'demo-applied-rule') },
    'act-drafts': { actions: (s, run) => decide(grantAccess(ask(s, run, 'demo-access'), run), run, 'never') },
    'act-no-access': {
        actions: (s, run) => {
            const next = ask(s, run, 'demo-access');

            return ticks(run(next, { decision: 'skipped', messageId: lastAgentId(next), type: 'decide-access' }), run);
        },
    },
    'act-delete': { actions: (s, run) => ask(s, run, 'demo-permission-delete') },
    'act-deleted': { actions: (s, run) => decide(ask(s, run, 'demo-permission-delete'), run, 'once') },
    'act-kept': { actions: (s, run) => decide(ask(s, run, 'demo-permission-delete'), run, 'never') },

    /* 05 · Отказы и сбои */
    'fail-start': { actions: (s, run) => ask(s, run, 'demo-failed-rate', false) },
    'fail-rate': { actions: (s, run) => ask(s, run, 'demo-failed-rate') },
    'fail-interrupted': { actions: (s, run) => ask(s, run, 'demo-failed-interrupted') },
    'fail-incomplete': { actions: (s, run) => ask(s, run, 'demo-failed-incomplete') },
    'fail-empty': { actions: (s, run) => ask(s, run, 'demo-failed-empty') },
    'fail-retried': {
        actions: (s, run) => ask(s, run, 'demo-failed-rate'),
        clicks: [{ blur: true, text: 'Повторить', wait: 5000 }],
    },
    'fail-context': { actions: (s, run) => ask(s, run, 'demo-failed-context') },
    'fail-context-new': {
        actions: (s, run) => ask(s, run, 'demo-failed-context'),
        clicks: [{ blur: true, text: 'Новый чат с этим вопросом', wait: 5000 }],
    },
    'fail-no-rights': { actions: (s, run) => ask(s, run, 'demo-blocked-access') },
    'fail-rule': { actions: (s, run) => ask(s, run, 'demo-blocked-rule') },
    'fail-rule-once': {
        actions: (s, run) => ask(s, run, 'demo-blocked-rule'),
        clicks: [{ blur: true, text: 'Разрешить один раз', wait: 5000 }],
    },

    /* 06 · Настройки */
    'set-page': { actions: toSettings },
    'set-source': { actions: settingsDrawer('subscriptions') },
    'set-claude': { actions: settingsDrawer('claude') },
    'set-claude-bad': {
        actions: settingsDrawer('claude'),
        clicks: [
            { text: 'sk-ant-oat01', type: 'не токен' },
            { blur: true, text: 'Подключить подписку', wait: 600 },
        ],
    },
    'set-claude-on': {
        actions: (s, run) => run(toSettings(s, run), {
            token: 'sk-ant-oat01-demo-token',
            type: 'connect-subscription',
            vendorId: 'claude',
        }),
    },
    'set-services': { actions: settingsDrawer('work') },
    'set-services-on': {
        actions: settingsDrawer('work'),
        clicks: [
            { text: 'Подключить через Яндекс ID', wait: 700 },
            { text: 'Экран Яндекс ID', wait: 700 },
            { blur: true, text: 'Экран Яндекс ID', wait: 900 },
        ],
    },

    /* 07 · История. На телефоне история живёт в левой шторке меню — её сначала открываем. */
    'hist-list': { actions: withHistory, clicks: [OPEN_MENU_ON_PHONE] },
    'hist-menu': {
        actions: withHistory,
        clicks: [OPEN_MENU_ON_PHONE, { text: 'Действия с чатом', wait: 700 }],
    },
    'hist-rename': {
        actions: withHistory,
        clicks: [
            OPEN_MENU_ON_PHONE,
            { text: 'Действия с чатом', wait: 600 },
            { caretStart: true, text: 'Переименовать', wait: 800 },
        ],
    },
    'hist-pinned': {
        actions: (s, run) => {
            const next = withHistory(s, run);

            return next.activeChatId ?
                run(next, { chatId: next.activeChatId, isPinned: true, type: 'pin-chat' }) :
                next;
        },
        clicks: [OPEN_MENU_ON_PHONE],
    },
    'hist-delete': {
        actions: withHistory,
        clicks: [OPEN_MENU_ON_PHONE, { text: 'Действия с чатом', wait: 600 }, { text: 'Удалить', wait: 800 }],
    },

    /* 08 · Сайт: помощник рядом с работой */
    'site-home': { actions: (s, run) => run(s, { screen: 'home', type: 'set-screen' }) },
    'site-panel': {
        actions: (s, run) => run(s, { screen: 'home', type: 'set-screen' }),
        clicks: [{ blur: true, text: 'Открыть ИИ-чаты', wait: 900 }],
    },
    'site-panel-answer': {
        actions: (s, run) => run(s, { screen: 'home', type: 'set-screen' }),
        clicks: [
            { text: 'Открыть ИИ-чаты', wait: 800 },
            { text: 'Разобрать пересечения', wait: 800 },
            { blur: true, text: 'Продолжить с Eliza', wait: 6000 },
        ],
    },
    'site-to-mars': {
        actions: (s, run) => run(s, { screen: 'home', type: 'set-screen' }),
        clicks: [
            { text: 'Открыть ИИ-чаты', wait: 800 },
            { text: 'Разобрать пересечения', wait: 800 },
            { text: 'Продолжить с Eliza', wait: 6000 },
            { blur: true, text: 'Открыть этот чат в', wait: 1200 },
        ],
    },
    'site-meeting': { actions: (s, run) => run(s, { screen: 'meeting', type: 'set-screen' }) },
    'site-meeting-panel': {
        actions: (s, run) => run(s, { screen: 'meeting', type: 'set-screen' }),
        clicks: [{ blur: true, text: 'Спросить', wait: 900 }],
    },
};

/** Есть ли в адресе шаг спеки — тогда модель стартует с чистого продукта и не пишет настройки. */
export const hasSpecSeed = hasSeed;

/**
 * Досеять стартовое состояние по `?seed=`. Знакомство при первом входе у шага спеки уже пройдено
 * (сам первый вход — шаги `first-*` с `firstVisit`).
 */
export const applySpecSeed = createSeedApplier<AssistantState, Action>(SEED_RECIPES, state => ({
    ...state,
    onboardingSeen: true,
}));

/** Для проверок: какие рецепты есть. */
export const SEED_IDS = Object.keys(SEED_RECIPES);
