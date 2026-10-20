import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Matches the flow tree's own opacity transition (FlowTree.module.css).
export const CHART_FADE_MS = 200;

/**
 * The Goals page's expanded goal chart ({ goalId, chartKey }), shown in place of the flow tree.
 * Expanding fades the tree out before the chart fades in; collapsing fades the chart out before the
 * tree returns (and fades itself in). Closing the goal or selecting another brings the tree back.
 * On mobile the goal details step aside while the chart shows and come back when it closes.
 *
 * `chartExpansion` goes to goal details: which goal's chart is expanded, and expand / collapse.
 */
export default function useExpandedGoalChart({ isMobile, selectedNodeId, isCreatingGoal, setSidebarMode, fadeOutTree }) {
    const [expandedChart, setExpandedChart] = useState(null);
    const [isLeaving, setIsLeaving] = useState(false);
    const timerRef = useRef(null);
    const clearTimer = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
    };
    useEffect(() => clearTimer, []);

    const activeChart = expandedChart && !isCreatingGoal && String(expandedChart.goalId) === String(selectedNodeId)
        ? expandedChart : null;
    const isShowing = Boolean(activeChart);

    const expandChart = useCallback((chart) => {
        clearTimer();
        setIsLeaving(false);
        if (isMobile) setSidebarMode(null);
        if (isShowing) {
            setExpandedChart(chart);
            return;
        }
        fadeOutTree?.();
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            setExpandedChart(chart);
        }, CHART_FADE_MS);
    }, [fadeOutTree, isMobile, isShowing, setSidebarMode]);

    const collapseChart = useCallback(() => {
        if (timerRef.current) return;
        setIsLeaving(true);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            setExpandedChart(null);
            setIsLeaving(false);
            if (isMobile) setSidebarMode('goal-details');
        }, CHART_FADE_MS);
    }, [isMobile, setSidebarMode]);

    const expandedGoalId = activeChart?.goalId ?? null;
    const chartExpansion = useMemo(
        () => ({ goalId: expandedGoalId, expand: expandChart, collapse: collapseChart }),
        [collapseChart, expandChart, expandedGoalId],
    );
    return { activeChart, isLeaving, chartExpansion, collapseChart };
}
