/**
 * РЕЦЕПТЫ ШАГОВ СПЕКИ «Я Team & Mars» (`?seed=<id>`). Движок — `spec-seed-runtime.ts`.
 *
 * В текущей редакции (режимы «Марс», «Сайт» и «Апп») почти всё живёт в разговоре и открывается
 * только действиями человека, поэтому шаг спеки проигрывает путь пользователя от чистого
 * старта — теми же действиями редьюсера, что шлют кнопки, и кликами по кнопкам. Тексты кнопок
 * в рецептах — дословно из словарей (`texts/*`). Ключ рецепта = id кадра в `spec-live.ts`,
 * мобильный двойник (`<id>@m`) открывается тем же адресом.
 *
 * Подключение в модели — две строки `model.ts`: `applySpecSeed` в `initialWithSetup` (старт с
 * чистого продукта, без настроек браузера) и `hasSpecSeed()` в эффекте записи настроек (шаг
 * спеки не пишет в localStorage — иначе подписка из рецепта «прилипала» к обычному прототипу).
 */

import { getAssistantWidget } from './assistant-widgets-data';
import { DEMO_NOW } from './chat-dates';
import { ACCESS_SERVICE_ID } from './data/access';
import { getIntranetContext } from './intranet-scenarios';
import type { assistantReducer, AssistantState } from './model';
import { type SetupAction, setupMessage } from './onboarding-chat';
import { parseSkillCommand, resolveSkillCommand } from './skill-catalog';
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

/** Настройка идёт ответами в том же чате, где уже виден исходный запрос. */
const answerSetup = (state: AssistantState, run: Run, action: SetupAction): AssistantState => {
    const messages = state.chats.find(chat => chat.id === state.activeChatId)?.messages ?? [];
    const message = setupMessage(messages);
    if (!message) { throw new Error('в чате нет активного шага настройки MARS') }
    return run(state, { type: 'answer-setup', messageId: message.id, action });
};
const firstIntro = (state: AssistantState, run: Run) => run({
    ...state, hasConsent: false, onboardingSeen: false, onboardingCompleted: false,
}, { type: 'send', text: promptOf('day-plan') });
const firstSource = (state: AssistantState, run: Run) =>
    answerSetup(firstIntro(state, run), run, { type: 'start' });
const firstPersonal = (state: AssistantState, run: Run) =>
    answerSetup(firstSource(state, run), run, { type: 'personal' });
const firstAuthorize = (state: AssistantState, run: Run) =>
    answerSetup(firstPersonal(state, run), run, { type: 'vendor', vendorId: 'codex' });
const firstSaved = (state: AssistantState, run: Run) =>
    firstAuthorize(run(state, { type: 'authorize-codex' }), run);
const sitePanel = (state: AssistantState, run: Run) =>
    run(run(state, { screen: 'home', type: 'set-screen' }), { type: 'open-assistant', view: 'home' });
const siteAnswer = (state: AssistantState, run: Run) => {
    const widget = getAssistantWidget('calendar');
    const sent = run(sitePanel(state, run), { type: 'run-widget', context: widget.context, prompt: widget.prompt });
    return ticks(run(sent, { type: 'confirm-subscription-send' }), run);
};
const appHome = (state: AssistantState, run: Run) => run(state, { screen: 'home', type: 'set-screen' });
/* Скиллы (6.10): панель «Офиса и компании» — у раздела свой скилл «Стафф», подпись ответа с «i». */
const officePanel = (state: AssistantState, run: Run) =>
    run(run(state, { screen: 'office', type: 'set-screen' }), { context: getIntranetContext('office'), type: 'open-panel' });
/** Итог команды `/skill …` — тем же действием редьюсера, что шлёт поле. */
const skillCommand = (text: string) => (state: AssistantState, run: Run) =>
    run(officePanel(state, run), { card: resolveSkillCommand(parseSkillCommand(text)!, []).card, text, type: 'skill-command' });
const officeAnswer = (state: AssistantState, run: Run) =>
    ticks(run(run(officePanel(state, run), { text: 'Покажи маршрут на дизайн-синк в 14:00, переговорка 3.12', type: 'send' }),
        { type: 'confirm-subscription-send' }), run);
const FIELD = 'Спросите или поручите';
/* С 5.10 MARS в приложении — строка вкладки «Сервисы», а не плашка на «Сегодня». */
const APP_OPEN = [{ text: 'Сервисы', wait: 600 }, { text: 'Я Team & MARS', wait: 800 }] as const;
const APP_DRAFT = [...APP_OPEN, { text: 'Собрать мой день', wait: 600 }];
const APP_CONFIRM = [...APP_DRAFT, { text: 'Отправить', wait: 500 }];
const APP_ANSWER = [...APP_CONFIRM,
    { text: 'Продолжить с Eliza', wait: 6000 }];
const firstAccess = (state: AssistantState, run: Run) =>
    answerSetup(firstSource(state, run), run, { type: 'eliza' });
const firstPermission = (state: AssistantState, run: Run) =>
    answerSetup(firstAccess(state, run), run, { type: 'connect' });
const firstReady = (state: AssistantState, run: Run) =>
    answerSetup(firstPermission(state, run), run, { type: 'approve' });
const firstSkipped = (state: AssistantState, run: Run) =>
    answerSetup(firstAccess(state, run), run, { type: 'skip' });

/* ------------------------------------------------------------------ */
/* Рецепты                                                              */
/* ------------------------------------------------------------------ */

export const SEED_RECIPES: Record<string, Recipe> = {
    /*
     * 01 · Первый запрос. Исходный запрос остаётся в ленте, решения настройки добавляют
     * ответы сотрудника и MARS. Завершение продолжает этот запрос ровно один раз.
     */
    'first-intro': { actions: firstIntro, firstVisit: true },
    'first-source': { actions: firstSource, firstVisit: true },
    'first-personal': {
        actions: firstPersonal,
        clicks: [{ scroll: 'bottom', text: 'Выберите личную подписку, которую хотите подключить.' }],
        firstVisit: true,
    },
    'first-authorize': {
        actions: firstAuthorize,
        clicks: [{ text: 'Код устройства', scroll: 'bottom', wait: 300 }],
        firstVisit: true,
    },
    'first-personal-connected': {
        actions: (s, run) => {
            const connected = run(firstAuthorize(s, run), { type: 'authorize-codex' });
            return answerSetup(connected, run, { type: 'connected', vendorId: 'codex' });
        },
        clicks: [{ text: 'Личная подписка подключена', scroll: 'bottom', wait: 300 }],
        firstVisit: true,
    },
    'first-saved': {
        actions: firstSaved,
        clicks: [{ text: 'Эта подписка уже подключена.', scroll: 'bottom', wait: 300 }],
        firstVisit: true,
    },
    'first-reconnect': {
        actions: (s, run) => answerSetup(firstSaved(s, run), run, { type: 'reconnect' }),
        clicks: [{ text: 'Код устройства', scroll: 'bottom', wait: 300 }],
        firstVisit: true,
    },
    'first-access': { actions: firstAccess, firstVisit: true },
    'first-yandex-id': {
        actions: firstPermission,
        clicks: [{ text: 'Рабочие сервисы', scroll: 'bottom', wait: 300 }],
        firstVisit: true,
    },
    // Совместимость старой ссылки: теперь это реальное подтверждение в чате, без ожидания.
    'first-connecting': { actions: firstPermission, firstVisit: true },
    'first-ready': {
        actions: firstReady,
        clicks: [{ text: 'Настройка готова', scroll: 'bottom', wait: 300 }],
        firstVisit: true,
    },
    'first-skipped': {
        actions: firstSkipped,
        clicks: [{ text: 'Настройка готова', scroll: 'bottom', wait: 300 }],
        firstVisit: true,
    },
    'first-answer': {
        actions: (s, run) => ticks(answerSetup(firstReady(s, run), run, { type: 'finish' }), run),
        firstVisit: true,
    },
    'first-answer-skipped': {
        actions: (s, run) => ticks(answerSetup(firstSkipped(s, run), run, { type: 'finish' }), run),
        firstVisit: true,
    },

    /* 02 · Старт */
    'mars-home': {},
    'mars-draft': {
        actions: (s, run) => run(s, { text: promptOf('day-plan'), starterId: 'day-plan', type: 'select-chat-starter' }),
    },
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
            { text: 'Токен Claude', type: 'sk-ant-oat01-demo-token' },
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
            { text: 'Токен Claude', type: 'не токен' },
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
    /* «Настройки» → «Подключённые скиллы» открывает каталог «Скиллы» (7.10). */
    'set-skills': { actions: toSettings, clicks: [{ text: 'Подключённые скиллы', wait: 900 }] },
    'set-skills-add': {
        actions: toSettings,
        clicks: [
            { text: 'Подключённые скиллы', wait: 900 },
            /* Разделы — оглавлением на десктопе; на 375 каталог — одна лента, её докручиваем. */
            { only: 'desktop', text: 'Документы', wait: 600 },
            { only: 'mobile', scroll: 'bottom', text: 'Мои встречи', wait: 500 },
        ],
    },
    'set-skills-on': {
        actions: toSettings,
        clicks: [
            { text: 'Подключённые скиллы', wait: 900 },
            { only: 'desktop', text: 'Документы', wait: 600 },
            { only: 'mobile', scroll: 'bottom', text: 'Мои встречи', wait: 500 },
            { text: 'Подключить «Презентации»', wait: 1200 },
        ],
    },
    'set-services-on': {
        actions: settingsDrawer('work'),
        clicks: [
            { text: 'Подключить через Яндекс ID', wait: 700 },
            { text: 'Продолжить на экране Яндекс ID', wait: 700 },
            { blur: true, text: 'Продолжить на экране Яндекс ID', wait: 900 },
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
    'site-panel': { actions: sitePanel },
    'site-panel-answer': { actions: siteAnswer },
    'site-to-mars': {
        actions: (s, run) => run(siteAnswer(s, run), { type: 'set-screen', screen: 'chat' }),
    },
    'site-meeting': { actions: (s, run) => run(s, { screen: 'meeting', type: 'set-screen' }) },

    /* 10 · Скиллы */
    'skill-add-search': {
        actions: officePanel,
        clicks: [
            { text: 'Добавить', wait: 700 },
            { text: 'Подключить скилл', wait: 900 },
            { text: 'Название или ссылка на скилл', type: 'достиж', wait: 600 },
        ],
    },
    'skill-add-done': {
        actions: officePanel,
        clicks: [
            { text: 'Добавить', wait: 700 },
            { text: 'Подключить скилл', wait: 900 },
            { text: 'Название или ссылка на скилл', type: 'достиж', wait: 600 },
            { text: 'Подключить «Журнал достижений»', wait: 1200 },
        ],
    },
    'skill-slash': { actions: officePanel, clicks: [{ keepFocus: true, text: FIELD, type: '/', wait: 600 }] },
    'skill-slash-skills': {
        actions: officePanel,
        clicks: [{ keepFocus: true, text: FIELD, type: '/skill install презентац', wait: 600 }],
    },
    'skill-cmd-installed': { actions: skillCommand('/skill install presentation-maker') },
    'skill-cmd-not-found': { actions: skillCommand('/skill install кофемашина') },
    'skill-cmd-list': { actions: skillCommand('/skills') },
    'skill-info': { actions: officeAnswer, clicks: [{ text: 'О скилле', wait: 800 }] },
    'skill-info-connect': {
        actions: officeAnswer,
        clicks: [{ text: 'О скилле', wait: 800 }, { text: 'Подключить в другом чате', wait: 800 }],
    },
    'site-meeting-panel': {
        actions: (s, run) => run(s, { screen: 'meeting', type: 'set-screen' }),
        clicks: [{ blur: true, text: 'Открыть ИИ-чаты', wait: 900 }],
    },
    /* Старый адрес раскрытия: возможности теперь сразу видны в ServiceSkillCard. */
    'site-meeting-skills': {
        actions: (s, run) => run(s, { screen: 'meeting', type: 'set-screen' }),
        clicks: [{ blur: true, text: 'Открыть ИИ-чаты', wait: 900 }],
    },
    'site-meeting-to-mars': {
        actions: (s, run) => run(s, { screen: 'meeting', type: 'set-screen' }),
        clicks: [
            { blur: true, text: 'Открыть ИИ-чаты', wait: 900 },
            { blur: true, text: 'Продолжить в MARS — тот же чат и история', wait: 600 },
        ],
    },

    /* 09 · Нативное приложение: локальный «Назад» требует пройти вход через UI. */
    'app-home': { actions: appHome },
    'app-mars': { actions: appHome, clicks: [...APP_OPEN] },
    'app-draft': { actions: appHome, clicks: APP_DRAFT },
    'app-confirm': { actions: appHome, clicks: APP_CONFIRM },
    'app-answer': { actions: appHome, clicks: APP_ANSWER },
    'app-meeting': { actions: (s, run) => run(s, { screen: 'meeting', type: 'set-screen' }) },
    'app-meeting-chat': {
        actions: (s, run) => run(s, { screen: 'meeting', type: 'set-screen' }),
        clicks: [{ text: 'Открыть ИИ-чаты', wait: 900 }],
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
    onboardingCompleted: true,
    onboardingVersion: 2,
}));

/** Для проверок: какие рецепты есть. */
export const SEED_IDS = Object.keys(SEED_RECIPES);
