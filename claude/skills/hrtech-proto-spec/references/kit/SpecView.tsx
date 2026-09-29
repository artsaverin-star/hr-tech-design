import { MapBoard } from './MapBoard';
import { ScenarioView } from './ScenarioView';

/**
 * Спек-режим прототипа: `?spec=1` — «Сценарий» (один крупный живой кадр, ScenarioView),
 * `?spec=map` — «Карта» (борд из снимков и связей по манифесту, MapBoard).
 * Панель режима принадлежит `PrototypeDraft`; клик по кадру на карте записывает id
 * кадра в URL и переключает вид на «Сценарий».
 */

export type SpecMode = 'scenario' | 'map';

type SpecViewProps = {
    /** Заголовок борда — название прототипа из manifest.json. */
    title: string;
    /** Текущий вид борда; владелец режима — ДС-панель в `PrototypeDraft`. */
    mode: SpecMode;
    /** Смена вида изнутри борда (клик по кадру «Карты» ведёт в «Сценарий»). */
    onModeChange: (mode: SpecMode) => void;
};

export const SpecView = ({ mode, title, onModeChange }: SpecViewProps) => {
    if (mode === 'scenario') {
        return <ScenarioView onOpenMap={() => onModeChange('map')} />;
    }

    return (
        <MapBoard
            title={title}
            onOpenScenario={id => {
                const params = new URLSearchParams(window.location.search);

                params.set('step', id);
                window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
                onModeChange('scenario');
            }}
        />
    );
};
