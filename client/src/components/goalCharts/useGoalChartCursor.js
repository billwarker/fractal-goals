import { useCallback, useEffect, useMemo, useState } from 'react';

import { CHART_CHANGE_EVENT, readRememberedChart, rememberChart } from './goalChartItems';

/**
 * Which of a goal's charts is showing. Starts on `initialKey`, else the one last shown for the
 * goal, else the first; falls back to the first when the shown chart is removed.
 */
export default function useGoalChartCursor(goalId, items, initialKey = null) {
    const [selection, setSelection] = useState(() => ({ goalId, key: initialKey || readRememberedChart(goalId) }));
    useEffect(() => {
        const follow = (event) => {
            if (event.detail?.goalId === goalId) setSelection({ goalId, key: event.detail.key });
        };
        window.addEventListener(CHART_CHANGE_EVENT, follow);
        return () => window.removeEventListener(CHART_CHANGE_EVENT, follow);
    }, [goalId]);
    const selectedKey = selection.goalId === goalId ? selection.key : readRememberedChart(goalId);
    const index = useMemo(() => {
        const found = items.findIndex((item) => item.key === selectedKey);
        return found >= 0 ? found : 0;
    }, [items, selectedKey]);

    const select = useCallback((key) => {
        setSelection({ goalId, key });
        if (key) rememberChart(goalId, key);
    }, [goalId]);
    const step = useCallback((delta) => {
        if (items.length < 2) return;
        select(items[(index + delta + items.length) % items.length].key);
    }, [index, items, select]);

    return { index, item: items[index] || null, select, next: () => step(1), previous: () => step(-1) };
}
