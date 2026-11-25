export type DeviceKind = 'mobile' | 'desktop';

export type BarTone = 'indigo' | 'purple' | 'orange' | 'blue' | 'green' | 'neutral';

export interface HotspotRect {
    /** Координаты элемента внутри исходного viewport устройства (375×812 или 1440×900). */
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface HotspotTarget {
    /** CSS-селектор элемента внутри iframe. По умолчанию ищет среди интерактивных контролов. */
    selector?: string;
    /** Подстрока видимого текста элемента (дословно как в интерфейсе). */
    text?: string;
    /** Подстрока атрибута aria-label (удобно для иконочных кнопок и нижнего таб-бара). */
    aria?: string;
    /** Номер совпадения с 0, если на экране несколько элементов с одинаковым текстом. */
    nth?: number;
    /** Ограничение нижней границы подсветки (px), чтобы высокая карточка не залезала на нижний бар. */
    maxBottom?: number;
    /** Резервные координаты на случай кросс-доменного iframe (обычно не нужны — измеряется вживую). */
    fallback?: HotspotRect;
}

export interface ScreenStep {
    /** Нажать элемент по видимому тексту или aria-label (если состояние не открывается через query). */
    click?: string;
    /** Сузить поиск элемента для click. */
    selector?: string;
    /** Ввести текст в поле (target — placeholder или aria-label). */
    fill?: { target: string; value: string };
    /** Прокрутить страницу или прокручиваемый контейнер (в пикселях или 'bottom'). */
    scroll?: number | 'bottom';
    /** Пауза после шага в мс (по умолчанию 120). */
    waitMs?: number;
}

export interface PresentationScreen {
    /** Query-параметры состояния прототипа без ведущего `?`, например `screen=home&stage=3`. */
    query: string;
    /** Форм-фактор экрана. Если не задан — берётся defaultDevice из конфигурации деки. */
    device?: DeviceKind;
    /** Подсветка элемента, по которому кликнули для перехода на следующий экран (только в `flow`). */
    hotspot?: HotspotTarget;
    /** Высота (в координатах исходного viewport) точки входа стрелки в этот экран. */
    targetY?: number;
    /** Короткая подпись под экраном (только для слайдов `compare`, например «Этап 1 · Сервисы»). */
    caption?: string;
    /** Опциональные шаги кликов/ввода внутри iframe, если экран не открывается чистым query. */
    steps?: ScreenStep[];
}

export interface SingleSlide {
    id: string;
    kind: 'single';
    title: string;
    body: string;
    screen: PresentationScreen;
}

export interface FlowSlide {
    id: string;
    kind: 'flow';
    title: string;
    body: string;
    /** 2–3 экрана для mobile, строго 2 экрана для desktop. */
    screens: PresentationScreen[];
}

export interface CompareSlide {
    id: string;
    kind: 'compare';
    title: string;
    body: string;
    /** 2–3 экрана для mobile, строго 2 для desktop или пара desktop + mobile. */
    screens: PresentationScreen[];
    /** Показывать ли прямые стрелки между экранами (по умолчанию true). */
    arrows?: boolean;
}

export interface HeroNumberItem {
    value: string;
    label: string;
}

export interface NumbersSlide {
    id: string;
    kind: 'numbers';
    title: string;
    body: string;
    /** 2–3 крупных числа. */
    items: HeroNumberItem[];
    /** Реальный источник данных (тикет/Вики/исследование) — не выдумывать. */
    source: string;
}

export interface BarItem {
    label: string;
    /** Отображаемое значение справа, например «76,8% · 19,3к». */
    display: string;
    /** Число для длины полосы. */
    value: number;
    /** Максимум шкалы (по умолчанию 100). */
    max?: number;
    tone: BarTone;
}

export interface BarsSlide {
    id: string;
    kind: 'bars';
    title: string;
    body: string;
    /** От 3 до 5 полос. */
    bars: BarItem[];
    /** Реальный источник данных — не выдумывать. */
    source: string;
}

export interface ToggleGroup {
    id: string;
    label: string;
    items: HeroNumberItem[];
}

export interface ToggleNumbersSlide {
    id: string;
    kind: 'toggleNumbers';
    title: string;
    body: string;
    ariaLabel: string;
    groups: ToggleGroup[];
    /** Реальный источник данных — не выдумывать. */
    source: string;
}

export interface ChecklistItem {
    title: string;
    detail?: string;
}

export interface ChecklistSlide {
    id: string;
    kind: 'checklist';
    title: string;
    body: string;
    /** От 3 до 6 пунктов. */
    items: ChecklistItem[];
    /** Кнопки внизу финального слайда. */
    primaryActionLabel?: string;
    secondaryActionLabel?: string;
    primaryQuery?: string;
}

export type PresentationSlide =
    | SingleSlide
    | FlowSlide
    | CompareSlide
    | NumbersSlide
    | BarsSlide
    | ToggleNumbersSlide
    | ChecklistSlide;

export interface PresentationConfig {
    /** Название презентации (для aria-label). */
    title: string;
    /** Форм-фактор по умолчанию для экранов без явного `device`. */
    defaultDevice: DeviceKind;
    /** Слайды по порядку. */
    slides: PresentationSlide[];
}
