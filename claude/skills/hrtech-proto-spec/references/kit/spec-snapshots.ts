/**
 * Снимки кадров для «Карты» и координаты якорей переходов.
 *
 * Генерирует `scripts/spec-snapshots.mjs` (нужен запущенный дев-сервер витрины):
 * картинки — `assets/spec/<id>.webp` (полный вьюпорт, на карте — вдвое меньше: 720×430 / 188×406,
 * то есть плотность 2× — чётко на ретине), координаты
 * — `spec-snapshots.json`. Карта показывает картинки, а не живые iframe: сотня живых
 * приложений на одном холсте тормозила всё. Живой экран — клик по кадру открывает его в «Прототипе».
 *
 * Якорь — доля ширины/высоты кадра (0…1), поэтому не зависит от масштаба превью.
 */

import manifest from './spec-snapshots.json';

export interface SnapshotAnchor {
    h: number;
    /** Запрос, по которому нашли элемент (`text=…` / `css=…`). */
    query: string;
    w: number;
    x: number;
    y: number;
}

export interface SnapshotEntry {
    anchors: Record<string, SnapshotAnchor>;
    file: string;
    height: number;
    /** Запросы, по которым элемент не нашёлся — у перехода не будет рамки на кнопке. */
    missing: { query: string; to: string }[];
    width: number;
}

export interface SnapshotManifest {
    base: string | null;
    /** Во сколько раз снимок плотнее своего размера на карте (2 — чётко на ретине). */
    density?: number;
    frames: Record<string, SnapshotEntry>;
    generatedAt: string | null;
    scale: number;
}

const MANIFEST = manifest as SnapshotManifest;

/** Vite подхватывает картинки на этапе сборки — без рантайм-запросов к папке. */
const IMAGES = import.meta.glob('../assets/spec/*.{webp,jpg}', { eager: true, import: 'default' }) as Record<
    string,
    string
>;

/** Имя файла снимка: `@` в id мобильного двойника недопустим в путях. */
export const snapshotFileOf = (id: string): string => `${id.replace('@m', '--m')}.webp`;

export interface Snapshot {
    anchors: Record<string, SnapshotAnchor>;
    url: string;
}

export const SNAPSHOTS: Record<string, Snapshot> = Object.fromEntries(
    Object.entries(MANIFEST.frames).flatMap(([id, entry]) => {
        const url = IMAGES[`../assets/spec/${entry.file}`];

        return url ? [[id, { anchors: entry.anchors, url }]] : [];
    }),
);

export const SNAPSHOTS_GENERATED_AT = MANIFEST.generatedAt;
