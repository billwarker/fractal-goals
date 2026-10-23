import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { CHART_FADE_MS } from '../goalCharts/useExpandedGoalChart';

/**
 * Lets the Progress pane's compact chart expand into the session's place. Null outside Session
 * Detail, where the chart opens Analytics instead.
 */
export const ProgressChartExpansionContext = createContext(null);

export const useProgressChartExpansion = () => useContext(ProgressChartExpansionContext);

/**
 * Session Detail's expanded Progress chart ({ activityId, instanceId }), shown in place of the
 * session content, like the Goals page's expanded goal chart: the content fades out before the
 * chart fades in, and the reverse on collapse. The content stays mounted underneath (hidden and
 * inert), so its state and scroll position survive. Leaving the Progress pane brings it back.
 * On mobile the pane's sheet steps aside while the chart shows and comes back when it closes.
 */
export default function useExpandedProgressChart({ isMobile, sidePaneMode, setIsMobilePaneOpen }) {
    const [chart, setChart] = useState(null);
    const [isFadingOut, setIsFadingOut] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const timerRef = useRef(null);
    const clearTimer = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
    };
    useEffect(() => clearTimer, []);

    const activeChart = chart && sidePaneMode === 'progress' ? chart : null;
    // Another pane mode was chosen: forget the chart, so returning to Progress doesn't reopen it.
    if (chart && !activeChart) setChart(null);
    const isShowing = Boolean(activeChart);

    const expand = useCallback((next) => {
        clearTimer();
        setIsLeaving(false);
        if (isMobile) setIsMobilePaneOpen(false);
        if (isShowing) {
            setChart(next);
            return;
        }
        setIsFadingOut(true);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            setChart(next);
            setIsFadingOut(false);
        }, CHART_FADE_MS);
    }, [isMobile, isShowing, setIsMobilePaneOpen]);

    const collapse = useCallback(() => {
        if (timerRef.current) return;
        setIsLeaving(true);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            setChart(null);
            setIsLeaving(false);
            if (isMobile) setIsMobilePaneOpen(true);
        }, CHART_FADE_MS);
    }, [isMobile, setIsMobilePaneOpen]);

    const context = useMemo(
        () => ({ chart: activeChart, expand, collapse }),
        [activeChart, collapse, expand],
    );
    return {
        activeChart,
        isLeaving,
        // The session content is hidden while it fades out and while the chart holds its place.
        isContentHidden: isFadingOut || isShowing,
        collapse,
        context,
    };
}
