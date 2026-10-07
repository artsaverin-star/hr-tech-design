import { MapBoard } from './MapBoard';
import { SPEC_FRAMES } from './spec';

/**
 * Спек-режим прототипа — только «Карта» (`?spec=map`: борд из снимков и связей по манифесту, MapBoard).
 * Вида «Сценарий» (`?spec=1`) нет и не будет: владелец 6.10.2026 — «удали вкладку «Сценарий» и больше
 * его никогда не делай». Клик по кадру карты открывает ЖИВОЕ состояние этого кадра в прототипе: адрес
 * кадра (`?seed=<id>` и т. п.) без `spec`. Страница перезагружается — рецепт читается при загрузке.
 */
type SpecViewProps = {
    /** Заголовок борда — название прототипа из manifest.json. */
    title: string;
};

export const openFrameInPrototype = (id: string) => {
    const frame = SPEC_FRAMES.find(item => item.id === id);
    if (!frame) {
        return;
    }
    const params = new URLSearchParams(frame.url.replace(/^\?/, ''));

    if (frame.platform === 'mobile') {
        params.set('viewport', 'mobile');
    }
    window.location.assign(`${window.location.pathname}?${params}`);
};

export const SpecView = ({ title }: SpecViewProps) => (
    <MapBoard title={title} onOpenFrame={openFrameInPrototype} />
);
