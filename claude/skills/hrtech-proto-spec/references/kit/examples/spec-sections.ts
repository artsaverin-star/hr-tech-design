/**
 * СОСТАВ «Карты сценариев» — что показываем и в каком порядке. Геометрия — в `map-board.ts`,
 * кадры и переходы — в `spec.ts` / `spec-live.ts`; здесь только композиция поверх их id.
 * ЧТО ОБЕЩАНО: настройка сообщениями, скилл сервиса и тот же чат в MARS, полноэкранный MARS в приложении.
 * ПУТЬ СЛОВАМИ: запрос → настройка → ответ; страница → чат → ответ → возврат к странице.
 * НЕ ПОКАЗЫВАЕМ: старые редакции и искусственное ожидание подключения; внешние экраны авторизации.
 * Этот файл — единственное, что пишется под продукт: движок карты общий.
 */

import { SPEC_DECISIONS, SPEC_FRAMES } from './spec';
import { LIVE_DECISION_IDS, LIVE_FRAME_IDS } from './spec-live';

/** Дорожка: ряд узлов слева направо. */
export interface MapLaneDef {
    /** Заголовок над первым экраном дорожки: событие или исход, 1–4 слова. */
    title?: string;
    /** Одна короткая строка под заголовком — когда так бывает. */
    note?: string;
    /** Узел, из которого дорожка растёт (кадр или ромб). Нет — главная дорожка или отдельный вход. */
    from?: string;
    /**
     * Разбор: взаимоисключающие случаи одного исхода. Рисуются гребёнкой из источника,
     * между случаями стрелок нет — это не шаги, а варианты.
     */
    cases?: boolean;
    nodes: string[];
}

export interface MapSectionDef {
    title: string;
    /** Путь секции словами: «Старт → каталог → черновик → ответ». */
    subtitle: string;
    lanes: MapLaneDef[];
}

/**
 * Сценарии живого продукта — путь сотрудника словами (сначала словами, потом форма):
 * «отправил первый запрос → MARS предложил настройку в переписке → личная подписка или Eliza →
 * провайдер, подключение и подтверждение → рабочие сервисы → разрешение в чате → ответ на запрос;
 * выбрал задачу карточкой или в каталоге → черновик в поле → отправил → ответ (Eliza может
 * потребовать подтверждение на новую сессию); долгая задача идёт по шагам, может уточнить
 * или упереться в закрытые встречи → итог; чтобы изменить что-то в сервисе, Марс просит доступ
 * и разрешение; если не вышло — называет причину и даёт одно действие; настройки — чем
 * отвечает Марс и что ему доступно; история — действия с разговорами; на сайте тот же Марс —
 * панелью поверх страницы; в приложении — отдельным экраном с возвратом к месту входа».
 */
export const MAP_SECTIONS: MapSectionDef[] = [
    {
        lanes: [
            {
                nodes: ['first-intro', 'first-source', 'first-access', 'first-yandex-id', 'first-ready', 'first-answer'],
                title: 'Основной путь',
            },
            { from: 'first-access', nodes: ['first-skipped', 'first-answer-skipped'], note: 'Когда сервисы подключат позже', title: 'Пропустить подключения' },
            { from: 'first-source', nodes: ['first-personal', 'first-authorize', 'first-personal-connected'], note: 'Когда у сотрудника своя подписка', title: 'Личная подписка' },
            { from: 'first-personal', nodes: ['first-saved', 'first-reconnect'], note: 'Когда подписка сохранена с прошлого входа', title: 'Сохранённая подписка' },
        ],
        subtitle: 'Первый запрос → настройка в чате → источник ответов → рабочие сервисы или пропуск → ответ на запрос',
        title: 'Первый вход',
    },
    {
        lanes: [
            { nodes: ['mars-home', 'mars-draft', 'mars-answer'], title: 'Основной путь' },
            { from: 'mars-home', nodes: ['mars-catalog'], note: 'Когда нужной задачи нет на старте', title: 'Все задачи' },
            {
                from: 'mars-draft',
                nodes: ['mars-confirm', 'q-source'],
                note: 'Когда Eliza ещё не подтверждена в этой сессии',
                title: 'Ответить через Eliza?',
            },
            {
                from: 'q-source',
                nodes: ['mars-sub-level', 'mars-sub-claude', 'mars-sub-done'],
                note: 'Когда у сотрудника своя подписка',
                title: 'Личная подписка',
            },
        ],
        subtitle: 'Старт → задача карточкой или из каталога → черновик → «Отправить» → ответ',
        title: 'Старт: задача за пару кликов',
    },
    {
        lanes: [
            { nodes: ['run-live', 'run-result'], title: 'Основной путь' },
            { from: 'run-live', nodes: ['run-stopped'], note: 'Когда сотрудник прервал работу', title: 'Остановка' },
            {
                nodes: ['run-clarify', 'run-clarify-done'],
                note: 'Когда в запросе не хватает периода',
                title: 'Уточнение по ходу',
            },
            {
                nodes: ['run-closed', 'run-closed-done'],
                note: 'Когда часть встреч закрыта организатором',
                title: 'Закрытые встречи',
            },
        ],
        subtitle: 'Поручил сбор итогов → MARS идёт по шагам, можно остановить → итог с решениями',
        title: 'Долгая задача',
    },
    {
        lanes: [
            {
                nodes: [
                    'act-access',
                    'q-access',
                    'act-yandex-id',
                    'act-consent',
                    'act-permission',
                    'q-permission',
                    'act-applied',
                    'act-undone',
                ],
                title: 'Основной путь',
            },
            { from: 'q-access', nodes: ['act-no-access'], note: 'Когда доступ давать не хочется', title: 'Без доступа' },
            { from: 'q-permission', nodes: ['act-applied-rule'], note: 'Когда разрешили всегда', title: 'Разрешать всегда' },
            { from: 'q-permission', nodes: ['act-drafts'], note: 'Когда действовать не разрешили', title: 'Не разрешать' },
            {
                nodes: ['act-delete', 'q-delete', 'act-deleted'],
                note: 'Когда действие нельзя отменить',
                title: 'Необратимое действие',
            },
            { from: 'q-delete', nodes: ['act-kept'], note: 'Когда закрытие отменили', title: 'Не закрывать' },
        ],
        subtitle: 'Попросил завести задачи → доступ через Яндекс ID → разрешение действовать → задачи созданы, можно отменить',
        title: 'Действия в сервисах',
    },
    {
        lanes: [
            { nodes: ['fail-start', 'q-why', 'fail-rate', 'fail-retried'], title: 'Основной путь' },
            {
                cases: true,
                from: 'q-why',
                nodes: ['fail-interrupted', 'fail-incomplete', 'fail-empty'],
                note: 'Когда сбой другой — та же карточка с «Повторить»',
                title: 'Другие сбои',
            },
            {
                from: 'q-why',
                nodes: ['fail-context', 'fail-context-new'],
                note: 'Когда разговор стал слишком длинным',
                title: 'Контекст переполнен',
            },
            { from: 'q-why', nodes: ['fail-no-rights'], note: 'Когда прав не хватает самому сотруднику', title: 'Нет прав' },
            {
                from: 'q-why',
                nodes: ['fail-rule', 'fail-rule-once'],
                note: 'Когда действие запрещено правилом',
                title: 'Запрещено правилом',
            },
        ],
        subtitle: 'MARS не справился → карточка называет причину и даёт одно действие',
        title: 'Отказы и сбои',
    },
    {
        lanes: [
            { nodes: ['set-page', 'set-source'], title: 'Основной путь' },
            {
                from: 'set-page',
                nodes: ['set-claude', 'q-token', 'set-claude-on'],
                note: 'Когда подключают свою подписку',
                title: 'Личная подписка',
            },
            /* Ветка ромба — раньше длинной дорожки «Доступы»: иначе её ствол перечёркивал «Доступы». */
            { from: 'q-token', nodes: ['set-claude-bad'], note: 'Когда токен не подошёл', title: 'Токен не подошёл' },
            { from: 'set-page', nodes: ['set-services', 'set-services-on'], note: 'Когда подключают сервисы', title: 'Доступы' },
            {
                from: 'set-page',
                nodes: ['set-skills', 'set-skills-add', 'set-skills-on'],
                note: 'Когда смотрят или подключают скиллы',
                title: 'Скиллы',
            },
        ],
        subtitle: 'Настройки → чем отвечает MARS → личная подписка по токену → доступы через Яндекс ID → скиллы',
        title: 'Настройки',
    },
    {
        lanes: [
            { nodes: ['hist-list', 'hist-menu', 'hist-rename'], title: 'Основной путь' },
            { from: 'hist-menu', nodes: ['hist-pinned'], note: 'Когда чат закрепили', title: 'Закрепить' },
            { from: 'hist-menu', nodes: ['hist-delete'], note: 'Когда чат удаляют', title: 'Удаление' },
        ],
        subtitle: 'История → действия с чатом → переименовать, закрепить или удалить',
        title: 'История чатов',
    },
    {
        lanes: [
            { nodes: ['site-home', 'site-panel', 'site-panel-answer', 'site-to-mars'], title: 'Основной путь' },
            {
                nodes: ['site-meeting', 'site-meeting-panel', 'site-meeting-to-mars'],
                note: 'Когда помощника открывают со страницы встречи',
                title: 'Со страницы встречи',
            },
        ],
        subtitle: 'Страница → панель с готовыми запросами → ответ или пояснение скилла → тот же чат в MARS',
        title: 'Сайт: помощник рядом с работой',
    },
    {
        lanes: [
            { nodes: ['skill-add-search', 'skill-add-done'], title: 'Основной путь' },
            /* Раньше команд: иначе ствол «Других исходов» перечёркивал бы эту дорожку. */
            { nodes: ['skill-info', 'skill-info-connect'], note: 'Когда смотрят, каким скиллом ответ', title: 'Где ещё работает' },
            {
                nodes: ['skill-slash', 'skill-slash-skills', 'skill-cmd-installed'],
                note: 'Когда знают команду MARS',
                title: 'Командой /skill',
            },
            {
                cases: true,
                from: 'skill-slash',
                nodes: ['skill-cmd-not-found', 'skill-cmd-list'],
                note: 'Когда название неизвестно или нужен список',
                title: 'Другие исходы',
            },
        ],
        subtitle: '«+» у поля → каталог → подключить; или командой /skill в поле; «i» у ответа — где ещё работает',
        title: 'Скиллы',
    },
    {
        lanes: [
            { nodes: ['app-home', 'app-mars', 'app-draft', 'app-confirm', 'app-answer'], title: 'Основной путь' },
            { nodes: ['app-meeting', 'app-meeting-chat'], note: 'Когда MARS открывают из встречи', title: 'Контекст встречи' },
        ],
        subtitle: 'Главная или встреча → полноэкранный MARS → запрос → ответ → возврат к месту входа',
        title: 'Приложение: MARS на весь экран',
    },

];

/**
 * Коды первого входа (`?state=`): старые адреса теперь открывают шаги настройки в переписке.
 * На карте этот путь показывают живые шаги секции «Первый вход» (`first-*`).
 */
const FIRST_ENTRY_CODES = new Set([
    'o1-intro',
    'v3-onboarding-subscription',
    'v3-onboarding-access',
    'v3-onboarding-yandex-id',
    'v3-onboarding-connecting',
    'v3-onboarding-error',
    'v3-onboarding-ready',
]);
const isFirstEntryCode = (id: string) => FIRST_ENTRY_CODES.has(id.replace(/@m$/, ''));
const SKILL_RETIRED_IDS = new Set(['site-meeting-skills', 'site-meeting-skills@m']);
const RETIRED_FRAMES = SPEC_FRAMES.filter(frame => !LIVE_FRAME_IDS.has(frame.id)).map(frame => frame.id);

/**
 * Снято с карты. Редакция 2.0 убрана из навигации (CONTEXT.md, 29.09): её кадры и шесть ромбов
 * остаются в манифесте алиасами старых ссылок, но сценарием продукта не являются. Коды первого
 * входа — отдельной группой: сам первый вход в продукте есть, на карте он живыми шагами.
 */
export const MAP_RETIRED: { ids: string[]; reason: string }[] = [
    {
        ids: RETIRED_FRAMES.filter(isFirstEntryCode),
        reason: 'Первый вход на карте — живые шаги секции «Первый вход»; старые коды `?state=` ведут к настройке в чате',
    },
    {
        ids: [...SKILL_RETIRED_IDS],
        reason: 'Возможности скилла сразу показаны в карточке; отдельного раскрытия больше нет',
    },
    {
        ids: [
            ...RETIRED_FRAMES.filter(id => !isFirstEntryCode(id) && !SKILL_RETIRED_IDS.has(id)),
            ...SPEC_DECISIONS.filter(decision => !LIVE_DECISION_IDS.has(decision.id)).map(decision => decision.id),
        ],
        reason: 'Редакция 2.0 убрана из навигации — кадры остаются алиасами старых ссылок',
    },
];

/**
 * Экраны без телефона — только с причиной (приёмка считает отсутствие телефона дефектом).
 * Сейчас пусто: у каждого экрана есть вид на 375.
 */
export const MAP_NO_MOBILE: Record<string, string> = {};

/** Вводный блок «00 · Как читать». */
export const BOARD_META = {
    goal:
        'Понятный сотрудникам чат «Я Team & MARS» на возможностях MARS: сервис «MARS» и тот же ' +
        'помощник панелью на страницах интранета и отдельным экраном в приложении Я Team.',
    status: 'Черновик',
    ticket: 'HRTECHDESIGN-4612',
    ticketUrl: 'https://st.yandex-team.ru/HRTECHDESIGN-4612',
} as const;
