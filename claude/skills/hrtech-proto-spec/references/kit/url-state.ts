import { useCallback, useEffect, useState } from 'react';

/**
 * Состояние адресной строки без react-router: автономный прототип живёт без роутера,
 * а каждое состояние всё равно должно быть адресуемо ссылкой.
 */
export const useUrlState = () => {
    const [search, setSearch] = useState(() => window.location.search);

    useEffect(() => {
        const onPopState = () => setSearch(window.location.search);

        window.addEventListener('popstate', onPopState);

        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    /** Пишем параметры так же, как это делал роутер в режиме replace: без новой записи в истории. */
    const replaceParams = useCallback((params: URLSearchParams) => {
        const query = params.toString();
        const next = `${window.location.pathname}${query ? `?${query}` : ''}`;

        window.history.replaceState(null, '', next);
        setSearch(query ? `?${query}` : '');
    }, []);

    return {
        pathname: window.location.pathname,
        searchParams: new URLSearchParams(search),
        replaceParams,
    };
};
