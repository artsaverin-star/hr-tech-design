import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { RadioButton } from '@yandex-int/hr-components/RadioButton';

import { PresentationDeck } from './PresentationDeck';
import { type PresentationConfig } from './presentationTypes';

import styles from './PresentationGate.module.css';

type GateMode = 'presentation' | 'prototype';

function readUrlState(): { isFrame: boolean; mode: GateMode; slideIndex: number } {
    const params = new URLSearchParams(window.location.search);
    const isFrame = params.get('viewport') === 'frame';
    const view = params.get('view');
    const mode: GateMode = !isFrame && view === 'presentation' ? 'presentation' : 'prototype';
    const rawSlide = Number.parseInt(params.get('slide') ?? '1', 10);
    const slideIndex = Number.isFinite(rawSlide) && rawSlide >= 1 ? rawSlide - 1 : 0;
    return { isFrame, mode, slideIndex };
}

const MODE_OPTIONS: { value: GateMode; children: string }[] = [
    { value: 'presentation', children: 'Презентация' },
    { value: 'prototype', children: 'Прототип' },
];

/*
 * Простая обёртка над корнем прототипа:
 * - при `?viewport=frame` рендерит сам прототип без шапки (для живых iframe внутри слайдов);
 * - при `?view=presentation` показывает интерактивную презентацию;
 * - иначе показывает тонкий переключатель «Презентация | Прототип» над прототипом.
 */
export function PresentationGate({
    config,
    children,
    onOpenSecondary,
}: {
    config: PresentationConfig;
    children: ReactNode;
    onOpenSecondary?: () => void;
}) {
    const [state, setState] = useState(readUrlState);

    useEffect(() => {
        if (state.isFrame) {
            document.documentElement.dataset.presentationFrame = '1';
        } else {
            delete document.documentElement.dataset.presentationFrame;
        }
        return () => {
            delete document.documentElement.dataset.presentationFrame;
        };
    }, [state.isFrame]);

    useEffect(() => {
        const onPopState = () => setState(readUrlState());
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    const updateUrl = useCallback((nextMode: GateMode, nextSlideIndex: number, targetSearch?: string) => {
        const params = targetSearch !== undefined ?
            new URLSearchParams(targetSearch.startsWith('?') ? targetSearch.slice(1) : targetSearch) :
            new URLSearchParams(window.location.search);

        params.delete('viewport');
        if (nextMode === 'presentation') {
            params.set('view', 'presentation');
            params.set('slide', String(nextSlideIndex + 1));
        } else {
            params.delete('view');
            params.delete('slide');
        }
        const qs = params.toString();
        const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
        window.history.pushState(null, '', nextUrl);
        window.dispatchEvent(new PopStateEvent('popstate'));
        setState({ isFrame: false, mode: nextMode, slideIndex: nextSlideIndex });
    }, []);

    if (state.isFrame) {
        return <>{children}</>;
    }

    return (
        <div className={styles.gateRoot}>
            <header className={styles.topBar} data-presentation-chrome="1">
                <RadioButton
                    aria-label="Режим просмотра"
                    name="presentation-gate-mode"
                    options={MODE_OPTIONS}
                    size="s"
                    value={state.mode}
                    onChange={e => updateUrl(e.currentTarget.value as GateMode, state.slideIndex)}
                />
            </header>

            {state.mode === 'presentation' ? (
                <PresentationDeck
                    config={config}
                    slideIndex={state.slideIndex}
                    onChangeSlide={idx => updateUrl('presentation', idx)}
                    onOpenPrototype={targetSearch => updateUrl('prototype', state.slideIndex, targetSearch)}
                    onOpenSecondary={onOpenSecondary}
                />
            ) : (
                <div className={styles.content}>{children}</div>
            )}
        </div>
    );
}
