import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../hooks/queryKeys';
import { useFractalTree } from '../../hooks/useGoalQueries';
import { fractalApi } from '../../utils/api';
import { applyCreatedGoal } from '../../utils/goalTreeCache';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import DropdownMenu, { DropdownMenuItem } from '../atoms/DropdownMenu';
import { GOAL_CHART_IDS, readChartGoalTarget } from './chartGoalTargets';
import styles from './ChartGoalSurface.module.css';

const GoalDetailModal = lazyWithRetry(() => import('../ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

/**
 * Analytics charts as a goal-setting surface. Right-click (or long-press on touch) a point on
 * Metric Trends, Metric Progress, Scatter or Activity Totals for "Set goal here…", which opens the
 * goal modal with a condition read from that point. Existing goals on the activity are passed to
 * the chart as reference lines.
 */
export default function ChartGoalSurface({ Chart, context, rootId }) {
    const queryClient = useQueryClient();
    const visualizationId = context.visualization?.id;
    const supported = GOAL_CHART_IDS.has(visualizationId);
    const activityId = context.effectiveSelectedActivity?.id || null;
    const [menu, setMenu] = useState(null);
    const [draftGoal, setDraftGoal] = useState(null);
    const pressRef = useRef(null);

    const { data: lines = [] } = useQuery({
        queryKey: queryKeys.goalConditionLines(rootId, activityId),
        queryFn: async () => (await fractalApi.getActivityGoalConditions(rootId, activityId)).data?.goals || [],
        enabled: Boolean(rootId && activityId && supported),
        staleTime: 60 * 1000,
    });
    const { data: tree } = useFractalTree(rootId, { enabled: Boolean(draftGoal) });
    const chartContext = useMemo(() => ({ ...context, goalConditionLines: lines }), [context, lines]);
    const initialCompletion = useMemo(() => (draftGoal
        ? { completionCondition: 'activity_threshold', conditionDraft: draftGoal.conditionDraft }
        : null), [draftGoal]);

    const openAt = useCallback((nativeEvent) => {
        const target = readChartGoalTarget({
            visualizationId, chart: context.chartRef?.current, nativeEvent, context,
        });
        if (!target) return false;
        setMenu({ x: nativeEvent.clientX, y: nativeEvent.clientY, target });
        return true;
    }, [context, visualizationId]);

    useEffect(() => {
        if (!menu) return undefined;
        const close = (event) => {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if (event.type === 'pointerdown' && event.target.closest?.('[data-chart-goal-menu]')) return;
            setMenu(null);
        };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', close);
        window.addEventListener('scroll', close, true);
        return () => {
            window.removeEventListener('pointerdown', close);
            window.removeEventListener('keydown', close);
            window.removeEventListener('scroll', close, true);
        };
    }, [menu]);

    const cancelPress = () => {
        clearTimeout(pressRef.current?.timer);
        pressRef.current = null;
    };
    const handlers = supported ? {
        onContextMenu: (event) => {
            if (openAt(event.nativeEvent)) event.preventDefault();
        },
        onPointerDown: (event) => {
            if (event.pointerType !== 'touch') return;
            const native = event.nativeEvent;
            pressRef.current = {
                x: event.clientX,
                y: event.clientY,
                timer: setTimeout(() => {
                    pressRef.current = null;
                    openAt(native);
                }, LONG_PRESS_MS),
            };
        },
        onPointerMove: (event) => {
            const press = pressRef.current;
            if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP) cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
    } : {};

    const parentGoal = context.effectiveSelectedGoal || tree || null;
    const createGoal = async (payload) => {
        try {
            const response = await fractalApi.createGoal(rootId, payload);
            await applyCreatedGoal(queryClient, queryKeys, rootId, response.data);
            await queryClient.invalidateQueries({ queryKey: queryKeys.goalConditionRoot(rootId) });
            setDraftGoal(null);
            return response.data;
        } catch (error) {
            notify.error(`Couldn’t create the goal: ${formatError(error)}`);
            throw error;
        }
    };

    return (
        <div className={styles.surface} {...handlers}>
            {React.createElement(Chart, { context: chartContext })}
            {menu ? (
                <div className={styles.menuAnchor} style={{ left: menu.x, top: menu.y }} data-chart-goal-menu>
                    <DropdownMenu align="left" className={styles.menu} aria-label="Chart goal actions">
                        {menu.target.unsupported ? (
                            <DropdownMenuItem disabled>{menu.target.unsupported}</DropdownMenuItem>
                        ) : (
                            <DropdownMenuItem onClick={() => { setDraftGoal(menu.target); setMenu(null); }}>
                                <span className={styles.itemText}>
                                    <strong>Set goal here…</strong>
                                    <span>{menu.target.summary}</span>
                                </span>
                            </DropdownMenuItem>
                        )}
                    </DropdownMenu>
                </div>
            ) : null}
            {draftGoal && parentGoal ? (
                <Suspense fallback={null}>
                    <GoalDetailModal
                        isOpen
                        mode="create"
                        rootId={rootId}
                        parentGoal={parentGoal}
                        displayMode="modal"
                        initialCompletion={initialCompletion}
                        onCreate={createGoal}
                        onClose={() => setDraftGoal(null)}
                    />
                </Suspense>
            ) : null}
        </div>
    );
}
