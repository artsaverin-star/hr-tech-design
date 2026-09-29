/**
 * КАДРЫ ЖИВОГО ПРОДУКТА (29.09.2026) — текущая редакция: сервис «Марс» и «Сайт» с панелью.
 *
 * Раньше спека стояла на убранной редакции 2.0 (`?state=<код>&edition=2.0` у всех 197 кадров):
 * карта показывала регулярные задачи, ИИ-профиль и свои скиллы, которых в продукте уже нет.
 * Здесь — только то, что человек реально проходит сейчас. Каждый кадр открывается адресом
 * `?seed=<id>` (рецепт в `spec-seeds.ts` проигрывает путь пользователя от чистого старта),
 * поэтому и снимок на «Карте», и живой экран в «Сценарии» — один и тот же продукт.
 *
 * ПРАВИЛА. `title` — событие или результат (2–4 слова), `caption` — одна фраза о том, что
 * существенно меняется. Подпись перехода (`label`) — ДОСЛОВНО кнопка из словаря продукта
 * (`texts/*`): по ней же генератор снимков находит, откуда нажали. Своих продуктовых строк нет.
 * `zone` — название секции карты (`spec-sections.ts`). Статус ставится, только если он
 * различает: `question` — у кадров, чьи строки помечены в словаре `[?]` (ждут редактора).
 * Ветка ромба, исход которой выбирает система, а не человек, — `kind: 'system'` (пунктир).
 */

import type { SpecDecision, SpecFrame, SpecStatus, SpecTransition } from './spec';

export const LIVE_ZONES = {
    access: 'Действия в сервисах',
    failures: 'Отказы и сбои',
    first: 'Первый вход',
    history: 'История разговоров',
    run: 'Долгая задача',
    settings: 'Настройки',
    site: 'Сайт: помощник рядом с работой',
    start: 'Старт: задача за пару кликов',
} as const;

type Zone = (typeof LIVE_ZONES)[keyof typeof LIVE_ZONES];

interface LiveDef {
    caption: string;
    /** Подпись телефона, если на 375 экран устроен иначе. */
    mobileCaption?: string;
    /** Дополнительные параметры адреса (заморозка прогона и т.п.). */
    extra?: string;
    /**
     * Телефон (375) с тем же адресом есть у КАЖДОГО экрана (владелец, 29.09: «не во всех экранах
     * есть рядом мобильная версия»). `false` — только с причиной в `noMobile`.
     */
    mobile?: false;
    noMobile?: string;
    next?: SpecTransition[];
    status?: SpecStatus;
    title: string;
    zone: Zone;
}

const Z = LIVE_ZONES;

const LIVE: Record<string, LiveDef> = {
    /*
     * ---------------- 01 · Первый вход ----------------
     * Одно окно из трёх шагов (владелец, 29.09.2026): знакомство → «Ответы Марса» → доступы одной
     * кнопкой через Яндекс ID. Открывается само при первом входе в Марс (рецепты с `firstVisit`).
     */
    'first-intro': {
        caption: 'При первом входе в Марс окно открывается само: знак, «Марс» и одно описание.',
        next: [{ label: 'Начать', to: 'first-source' }],
        title: 'Знакомство',
        zone: Z.first,
    },
    'first-source': {
        caption: 'Eliza или личная подписка — те же радиокнопки, что в настройках; Eliza больше не спросят перед ответом.',
        next: [
            { label: 'Продолжить', to: 'first-access' },
            { label: 'Личная подписка', to: 'first-personal' },
        ],
        title: 'Ответы Марса',
        zone: Z.first,
    },
    'first-personal': {
        caption: 'Под группой — формы подключения; «Продолжить» ждёт подключённой подписки.',
        title: 'Выбор подписки при входе',
        zone: Z.first,
    },
    'first-access': {
        caption: 'Все рабочие доступы одной кнопкой; можно начать и без них.',
        next: [
            { label: 'Подключить и открыть чат', to: 'first-yandex-id' },
            { label: 'Пока без подключений', to: 'mars-home' },
        ],
        title: 'Рабочие сервисы',
        zone: Z.first,
    },
    'first-yandex-id': {
        caption: 'Те же два экрана Яндекс ID, что в настройках, поверх окна; нажатие ведёт дальше.',
        next: ['first-connecting'],
        title: 'Вход через Яндекс ID',
        zone: Z.first,
    },
    'first-connecting': {
        caption: 'Все восемь доступов подключаются разом, потом открывается чат.',
        next: [{ kind: 'system', label: 'подключено', to: 'mars-home' }],
        title: 'Подключаем сервисы',
        zone: Z.first,
    },

    /* ---------------- 02 · Старт ---------------- */
    'mars-home': {
        caption: 'Знак, вопрос и три задачи карточками; остальное — в «Все задачи».',
        next: [
            { label: 'Собрать мой день', to: 'mars-draft' },
            { label: 'Все задачи', to: 'mars-catalog' },
        ],
        title: 'Старт Марса',
        zone: Z.start,
    },
    'mars-catalog': {
        caption: 'Шторка «Что поручить Марсу»: поиск, рубрики, и выбор кладёт запрос в поле.',
        next: [{ label: 'Собрать мой день', to: 'mars-draft' }],
        title: 'Что поручить Марсу',
        zone: Z.start,
    },
    'mars-draft': {
        caption: 'Запрос стоит в поле — его можно поправить перед отправкой.',
        next: [
            { label: 'Отправить', to: 'mars-answer' },
            { label: 'Отправить', to: 'mars-confirm' },
        ],
        title: 'Черновик в поле',
        zone: Z.start,
    },
    'mars-confirm': {
        caption: 'Источник не выбран в окне первого входа — Марс спрашивает один раз за сессию, запрос ждёт.',
        next: [{ label: 'Изменить запрос', to: 'mars-draft' }],
        title: 'Ответить через Eliza?',
        zone: Z.start,
    },
    'mars-answer': {
        caption: 'Ответ приходит в ленту; ниже — источники и «Продолжить».',
        title: 'Ответ',
        zone: Z.start,
    },
    'mars-sub-level': {
        caption: 'Меню открывается сразу на выборе подписки: корпоративная или своя.',
        next: [{ label: 'Claude', to: 'mars-sub-claude' }],
        title: 'Выбор подписки',
        zone: Z.start,
    },
    'mars-sub-claude': {
        caption: 'Токен вставляется здесь же; стрелка назад возвращает к выбору подписки.',
        next: [{ label: 'Подключить подписку', to: 'mars-sub-done' }],
        title: 'Токен Claude',
        zone: Z.start,
    },
    'mars-sub-done': {
        caption: 'Подписка подключена, запрос на месте — отправка уже через личную подписку.',
        title: 'Отвечает своя подписка',
        zone: Z.start,
    },

    /* ---------------- 03 · Долгая задача ---------------- */
    'run-live': {
        caption: 'Марс идёт по шагам на виду; работу можно остановить.',
        extra: 'tick=1',
        next: [
            { kind: 'system', label: 'шаги пройдены', to: 'run-result' },
            { label: 'Остановить', to: 'run-stopped' },
        ],
        title: 'Ход задачи',
        zone: Z.run,
    },
    'run-stopped': {
        caption: 'Карточка помнит шаг, на котором остановились.',
        next: [{ label: 'Продолжить', to: 'run-result' }],
        title: 'Остановлено',
        zone: Z.run,
    },
    'run-result': {
        caption: 'Итог: что решили — карточкой со ссылками на сводки и источниками.',
        title: 'Итог с решениями',
        zone: Z.run,
    },
    'run-clarify': {
        caption: 'Одно уточнение по ходу: варианты строками и свой ответ.',
        next: [{ label: 'Две недели', to: 'run-clarify-done' }],
        title: 'Уточняющий вопрос',
        zone: Z.run,
    },
    'run-clarify-done': {
        caption: 'Вопрос свернулся в строку с ответом, ниже — итог.',
        title: 'Ответили — итог',
        zone: Z.run,
    },
    'run-closed': {
        caption: 'Часть встреч закрыта от ИИ-агентов: открыть их или продолжить без них.',
        next: [{ label: 'Продолжить без них', to: 'run-closed-done' }],
        title: 'Встречи закрыты',
        zone: Z.run,
    },
    'run-closed-done': {
        caption: 'Итог собран по открытым встречам; решение видно свёрнутой строкой.',
        title: 'Итог без закрытых',
        zone: Z.run,
    },

    /* ---------------- 04 · Действия в сервисах ---------------- */
    'act-access': {
        caption: 'Чтобы завести задачи, Марсу нужен доступ к Трекеру от вашего имени.',
        title: 'Нужен доступ',
        zone: Z.access,
    },
    'act-yandex-id': {
        caption: 'Одноразовый код из приложения Яндекс ID подтверждает передачу прав.',
        next: [{ label: 'Продолжить', to: 'act-consent' }],
        title: 'Код Яндекс ID',
        zone: Z.access,
    },
    'act-consent': {
        caption: 'Какие права получит помощник — списком, до выдачи.',
        next: [{ label: 'Передать права', to: 'act-permission' }],
        title: 'Согласие на права',
        zone: Z.access,
    },
    'act-permission': {
        caption: 'Доступ выдан; перед изменением Марс спрашивает: что сделает и чего не тронет.',
        title: 'Разрешение действовать',
        zone: Z.access,
    },
    'act-applied': {
        caption: 'Задачи созданы — ссылками; отменить можно в течение 10 секунд.',
        next: [{ label: 'Отменить', to: 'act-undone' }],
        title: 'Задачи созданы',
        zone: Z.access,
    },
    'act-undone': {
        caption: 'Созданное отменено, в ленте остаётся след решения.',
        title: 'Отменено',
        zone: Z.access,
    },
    'act-applied-rule': {
        caption: 'Следующие такие задачи Марс делает сам и называет правило, по которому действовал.',
        title: 'Дальше — без вопроса',
        zone: Z.access,
    },
    'act-drafts': {
        caption: 'Без разрешения Марс ничего не меняет и отдаёт черновики задач.',
        status: 'question',
        title: 'Не разрешили — черновики',
        zone: Z.access,
    },
    'act-no-access': {
        caption: 'Без доступа Марс собирает черновики, их можно завести вручную.',
        status: 'question',
        title: 'Без доступа — черновики',
        zone: Z.access,
    },
    'act-delete': {
        caption: 'Необратимое действие — своя карточка и отдельное разрешение.',
        title: 'Необратимое действие',
        zone: Z.access,
    },
    'act-deleted': {
        caption: 'Задача закрыта как отменённая; окна отмены нет.',
        title: 'Задача закрыта',
        zone: Z.access,
    },
    'act-kept': {
        caption: 'Задача осталась открытой — Марс так и говорит.',
        title: 'Задача не тронута',
        zone: Z.access,
    },

    /* ---------------- 05 · Отказы и сбои ---------------- */
    'fail-start': {
        caption: 'Запрос ушёл, Марс готовит ответ — дальше придёт итог или карточка с причиной.',
        extra: 'tick=1',
        title: 'Запрос отправлен',
        zone: Z.failures,
    },
    'fail-rate': {
        caption: 'Причина названа; повтор — сам через 20 секунд или кнопкой.',
        next: [{ label: 'Повторить', to: 'fail-retried' }],
        title: 'Сервис перегружен',
        zone: Z.failures,
    },
    'fail-retried': {
        caption: 'Повтор дошёл до итога; сработавшая кнопка карточки гаснет.',
        title: 'Повтор — итог',
        zone: Z.failures,
    },
    'fail-interrupted': {
        caption: 'Связь с сервисом оборвалась посреди ответа — «Повторить» отправит запрос заново.',
        title: 'Ответ прервался',
        zone: Z.failures,
    },
    'fail-incomplete': {
        caption: 'Ответ собран не до конца — «Повторить» соберёт его заново с начала.',
        title: 'Не удалось завершить',
        zone: Z.failures,
    },
    'fail-empty': {
        caption: 'Сервис вернул пустой ответ — «Повторить» отправит тот же запрос.',
        title: 'Пустой ответ',
        zone: Z.failures,
    },
    'fail-context': {
        caption: 'Слишком большой объём: сократить запрос или начать новый чат.',
        next: [{ label: 'Новый чат с этим вопросом', to: 'fail-context-new' }],
        title: 'Контекст переполнен',
        zone: Z.failures,
    },
    'fail-context-new': {
        caption: 'Вопрос переехал в новый чат и дошёл до итога.',
        title: 'Новый чат — итог',
        zone: Z.failures,
    },
    'fail-no-rights': {
        caption: 'Прав нет у сотрудника: задача остановлена, доступ выдаёт руководитель.',
        title: 'Нет прав',
        zone: Z.failures,
    },
    'fail-rule': {
        caption: 'Правило запрещает менять Календарь: шаги вручную или разрешить один раз.',
        next: [
            { label: 'Разрешить один раз', to: 'fail-rule-once' },
            { label: 'Открыть Доступы', to: 'set-page' },
        ],
        title: 'Запрещено правилом',
        zone: Z.failures,
    },
    'fail-rule-once': {
        caption: 'Встреча поставлена — ниже её карточка.',
        status: 'question',
        title: 'Разрешили один раз',
        zone: Z.failures,
    },

    /* ---------------- 06 · Настройки ---------------- */
    'set-page': {
        caption: 'Три карточки: чем отвечает Марс, личные подписки и доступы к сервисам.',
        next: [
            { label: 'Eliza', to: 'set-source' },
            { label: 'Claude', to: 'set-claude' },
            { label: 'Сервисы', to: 'set-services' },
        ],
        title: 'Настройки',
        zone: Z.settings,
    },
    'set-source': {
        caption: 'Eliza или подключённая личная подписка; выбор — для следующих ответов.',
        title: 'Выбор источника ответов',
        zone: Z.settings,
    },
    'set-claude': {
        caption: 'Команда для терминала и поле токена; подключение — после ввода.',
        mobileCaption: 'Токен вставляется здесь, создаётся он на компьютере.',
        next: [{ label: 'Подключить подписку', to: 'set-claude-on' }],
        title: 'Подписка Claude',
        zone: Z.settings,
    },
    'set-claude-on': {
        caption: 'Подписка подключена — строка показывает маску токена.',
        title: 'Подписка подключена',
        zone: Z.settings,
    },
    'set-claude-bad': {
        caption: 'Токен не подошёл — ошибка у поля, значение остаётся.',
        title: 'Токен не подошёл',
        zone: Z.settings,
    },
    'set-services': {
        caption: 'Сервисы, которые Марс видит от вашего имени, — тумблерами.',
        next: [{ label: 'Подключить через Яндекс ID', to: 'set-services-on' }],
        title: 'Доступы к сервисам',
        zone: Z.settings,
    },
    'set-services-on': {
        caption: 'Один вход через Яндекс ID включает все сервисы.',
        title: 'Сервисы подключены',
        zone: Z.settings,
    },

    /* ---------------- 07 · История ---------------- */
    'hist-list': {
        caption: 'Разговоры по дням в колонке слева; у строки — меню действий.',
        next: [{ label: 'Действия с чатом', to: 'hist-menu' }],
        title: 'История',
        zone: Z.history,
    },
    'hist-menu': {
        caption: 'Закрепить, переименовать, удалить — удаление единственное красное.',
        next: [
            { label: 'Переименовать', to: 'hist-rename' },
            { label: 'Закрепить', to: 'hist-pinned' },
            { label: 'Удалить', to: 'hist-delete' },
        ],
        title: 'Действия с чатом',
        zone: Z.history,
    },
    'hist-rename': {
        caption: 'Окно с текущим названием чата.',
        title: 'Новое имя чата',
        zone: Z.history,
    },
    'hist-pinned': {
        caption: 'Закреплённый чат стоит первым, в своей группе.',
        title: 'Закреплён',
        zone: Z.history,
    },
    'hist-delete': {
        caption: 'Удаление спрашивает подтверждение: восстановить будет нельзя.',
        title: 'Удалить чат?',
        zone: Z.history,
    },

    /* ---------------- 08 · Сайт ---------------- */
    'site-home': {
        caption: 'Главная интранета; помощник — планетой справа от колокольчика.',
        next: [{ label: 'Открыть ИИ-чаты', to: 'site-panel' }],
        title: 'Помощник на главной',
        zone: Z.site,
    },
    'site-panel': {
        caption: 'Панель поверх страницы: подсказки по её содержимому и поле с контекстом.',
        mobileCaption: 'На телефоне панель — шторка на весь экран, с тем же контекстом страницы.',
        next: [{ label: 'Разобрать пересечения', to: 'site-panel-answer' }],
        title: 'Помощник открыт',
        zone: Z.site,
    },
    'site-panel-answer': {
        caption: 'Ответ приходит прямо в панели; страница остаётся на месте.',
        next: [{ label: 'Открыть этот чат в Я Team & Mars', to: 'site-to-mars' }],
        title: 'Встречи пересекаются',
        zone: Z.site,
    },
    'site-to-mars': {
        caption: 'Тот же разговор открыт в Марсе; в первый раз поверх встанет окно — уже без вопроса про Eliza.',
        next: [{ kind: 'system', label: 'первый раз в Марсе', to: 'first-intro' }],
        title: 'Чат в Марсе',
        zone: Z.site,
    },
    'site-meeting': {
        caption: 'Страница встречи с врезкой помощника и скиллами для неё.',
        next: [{ label: 'Спросить', to: 'site-meeting-panel' }],
        title: 'Встреча открыта',
        zone: Z.site,
    },
    'site-meeting-panel': {
        caption: 'Панель с контекстом встречи и скиллами именно для неё.',
        title: 'Помощник у встречи',
        zone: Z.site,
    },
};

const urlOf = (id: string, def: LiveDef) => `?seed=${id}${def.extra ? `&${def.extra}` : ''}`;

export const LIVE_FRAMES: SpecFrame[] = Object.entries(LIVE).flatMap(([id, def]) => {
    const desktop: SpecFrame = {
        caption: def.caption,
        id,
        next: def.next,
        platform: 'desktop',
        /* Статус — только если он что-то различает: «В работе» на каждом кадре было шумом (ревью 29.09). */
        status: def.status,
        title: def.title,
        url: urlOf(id, def),
        zone: def.zone,
    };

    return def.mobile !== false ?
        [desktop, {
            ...desktop,
            caption: def.mobileCaption ?? def.caption,
            id: `${id}@m`,
            next: undefined,
            platform: 'mobile' as const,
        }] :
        [desktop];
});

/**
 * Развилки живого продукта. Ветки — значения ответа, подпись — дословно кнопка, если исход
 * выбирает человек, или короткое событие, если его выбирает ход задачи.
 */
export const LIVE_DECISIONS: SpecDecision[] = [
    {
        branches: [
            { label: 'Продолжить с Eliza', to: 'mars-answer', tone: 'yes' },
            { label: 'На личную подписку', to: 'mars-sub-level' },
        ],
        id: 'q-source',
        question: 'Через что отвечать?',
    },
    {
        branches: [
            { label: 'Получить доступ', to: 'act-yandex-id', tone: 'yes' },
            { label: 'Работать без доступа', to: 'act-no-access', tone: 'no' },
        ],
        id: 'q-access',
        question: 'Дать доступ к Трекеру?',
    },
    {
        branches: [
            { label: 'Разрешить', to: 'act-applied', tone: 'yes' },
            { label: 'Разрешать всегда', to: 'act-applied-rule' },
            { label: 'Не разрешать', to: 'act-drafts', tone: 'no' },
        ],
        id: 'q-permission',
        question: 'Разрешить действовать?',
    },
    {
        branches: [
            { label: 'Закрыть задачу', to: 'act-deleted', tone: 'yes' },
            { label: 'Не закрывать', to: 'act-kept', tone: 'no' },
        ],
        id: 'q-delete',
        question: 'Закрыть задачу?',
    },
    {
        branches: [
            { kind: 'system', label: 'сервис перегружен', to: 'fail-rate' },
            { kind: 'system', label: 'другой сбой', to: 'fail-interrupted' },
            { kind: 'system', label: 'слишком большой объём', to: 'fail-context' },
            { kind: 'system', label: 'нет прав', to: 'fail-no-rights' },
            { kind: 'system', label: 'запрещено правилом', to: 'fail-rule' },
        ],
        id: 'q-why',
        question: 'Почему не вышло?',
    },
    {
        branches: [
            { kind: 'system', label: 'подошёл', to: 'set-claude-on', tone: 'yes' },
            { kind: 'system', label: 'не подошёл', to: 'set-claude-bad', tone: 'no' },
        ],
        id: 'q-token',
        question: 'Токен подошёл?',
    },
];

export const LIVE_FRAME_IDS = new Set(LIVE_FRAMES.map(frame => frame.id));
export const LIVE_DECISION_IDS = new Set(LIVE_DECISIONS.map(decision => decision.id));
