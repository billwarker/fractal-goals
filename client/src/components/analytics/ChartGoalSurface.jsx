import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../hooks/queryKeys';
import { useFractalTree } from '../../hooks/useGoalQueries';
import { fractalApi } from '../../utils/api';
import { applyCreatedGoal, refreshGoalReadModels } from '../../utils/goalTreeCache';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import DropdownMenu, { DropdownMenuItem } from '../atoms/DropdownMenu';
import AnnotationCrosshair from './annotate/AnnotationCrosshair';
import AnnotationPopover from './annotate/AnnotationPopover';
import { GOAL_CHART_IDS, readChartGoalTarget } from './chartGoalTargets';
import styles from './ChartGoalSurface.module.css';

const GoalDetailModal = lazyWithRetry(() => import('../ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

/**
 * Analytics charts as a goal-setting surface.
 *
 * Annotate mode (the panel's "Set goal" toggle, or "A" while the chart is focused): a crosshair follows the pointer,
 * snapped to what the metric can hold, with the values on each axis and the goal the point would
 * set; a click pins it, and the pin offers "Create goal…" (the goal modal, seeded) or updating a
 * goal that already has a threshold on this activity, after a live preview. Right-click (or
 * long-press on touch) stays as the quick "Set goal here…". Existing goals on the activity are
 * passed to the chart as reference lines.
 */
export default function ChartGoalSurface({ Chart, context, rootId, annotating = false, onAnnotatingChange = () => {} }) {
    const queryClient = useQueryClient();
    const visualizationId = context.visualization?.id;
    const supported = GOAL_CHART_IDS.has(visualizationId);
    const activityId = context.effectiveSelectedActivity?.id || null;
    const [menu, setMenu] = useState(null);
    const [draftGoal, setDraftGoal] = useState(null);
    const [hover, setHover] = useState(null);
    const [pin, setPin] = useState(null);
    const pressRef = useRef(null);
    const surfaceRef = useRef(null);

    const { data: lines = [] } = useQuery({
        queryKey: queryKeys.goalConditionLines(rootId, activityId),
        queryFn: async () => (await fractalApi.getActivityGoalConditions(rootId, activityId)).data?.goals || [],
        enabled: Boolean(rootId && activityId && supported),
        staleTime: 60 * 1000,
    });
    const { data: tree } = useFractalTree(rootId, { enabled: Boolean(draftGoal) });
    const chartContext = useMemo(() => ({ ...context, goalConditionLines: lines }), [context, lines]);
    const initialCompletion = useMemo(() => (draftGoal
        ? {
            completionCondition: 'activity_threshold',
            conditionDraft: draftGoal.conditionDraft,
            deadline: draftGoal.deadline || '',
        }
        : null), [draftGoal]);

    const read = useCallback((nativeEvent) => readChartGoalTarget({
        visualizationId, chart: context.chartRef?.current, nativeEvent, context,
    }), [context, visualizationId]);

    const openAt = useCallback((nativeEvent) => {
        const target = read(nativeEvent);
        if (!target) return false;
        setMenu({ x: nativeEvent.clientX, y: nativeEvent.clientY, target });
        return true;
    }, [read]);

    const { chartRef } = context;
    /** Where the canvas and its plot area sit inside the surface, for the crosshair. */
    const placement = useCallback(() => {
        const chart = chartRef?.current;
        const surface = surfaceRef.current;
        if (!chart?.canvas || !surface) return null;
        const canvasRect = chart.canvas.getBoundingClientRect();
        const surfaceRect = surface.getBoundingClientRect();
        return { canvasRect, offset: { left: canvasRect.left - surfaceRect.left, top: canvasRect.top - surfaceRect.top }, area: chart.chartArea };
    }, [chartRef]);

    const stopAnnotating = useCallback(() => {
        onAnnotatingChange(false);
        setHover(null);
        setPin(null);
    }, [onAnnotatingChange]);
    // Leaving annotate mode (from the toolbar too) clears the crosshair and any pin.
    const [wasAnnotating, setWasAnnotating] = useState(annotating);
    if (wasAnnotating !== annotating) {
        setWasAnnotating(annotating);
        if (!annotating) {
            setHover(null);
            setPin(null);
        }
    }

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
    const annotateHandlers = {
        onPointerMove: (event) => {
            if (pin) return;
            const target = read(event.nativeEvent);
            const where = target ? placement() : null;
            setHover(target && where && where.area ? {
                target,
                offset: where.offset,
                area: where.area,
                pointer: { x: event.clientX - where.canvasRect.left, y: event.clientY - where.canvasRect.top },
            } : null);
        },
        onPointerLeave: () => {
            if (!pin) setHover(null);
        },
        onClick: (event) => {
            if (pin || event.target.closest?.('[data-chart-goal-menu]')) return;
            if (!hover?.target?.conditionDraft) return;
            const { offset, area, pointer } = hover;
            setPin({
                target: hover.target,
                left: offset.left + Math.min(pointer.x + 12, area.right - 260),
                top: offset.top + Math.max(area.top, pointer.y - 20),
            });
        },
    };
    const menuHandlers = {
        onContextMenu: (event) => {
            if (openAt(event.nativeEvent)) event.preventDefault();
        },
        onPointerDown: (event) => {
            if (event.pointerType !== 'touch' || annotating) return;
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
            if (annotating) annotateHandlers.onPointerMove(event);
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onKeyDown: (event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'a' || event.key === 'A') onAnnotatingChange(!annotating);
            if (event.key === 'Escape') stopAnnotating();
        },
    };
    const handlers = supported ? {
        ...menuHandlers,
        ...(annotating ? { onPointerLeave: annotateHandlers.onPointerLeave, onClick: annotateHandlers.onClick } : {}),
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
    const updateGoal = async (goalId, condition) => {
        try {
            await fractalApi.setGoalCondition(rootId, goalId, { completion_condition: 'activity_threshold', condition });
            await Promise.all([
                refreshGoalReadModels(queryClient, queryKeys, rootId),
                queryClient.invalidateQueries({ queryKey: queryKeys.goalConditionRoot(rootId) }),
            ]);
            notify.success('Goal updated');
            stopAnnotating();
        } catch (error) {
            notify.error(`Couldn’t update the goal: ${formatError(error)}`);
        }
    };

    return (
        <div
            ref={surfaceRef}
            className={styles.surface}
            style={annotating ? { cursor: 'crosshair', touchAction: 'none' } : undefined}
            tabIndex={supported ? 0 : undefined}
            aria-label={supported ? 'Chart. Press A to set a goal from a point on it.' : undefined}
            {...handlers}
        >
            {React.createElement(Chart, { context: chartContext })}
            {annotating && !pin ? <AnnotationCrosshair hover={hover} /> : null}
            {pin ? (
                <AnnotationPopover
                    rootId={rootId}
                    pin={pin}
                    goals={lines}
                    onCreate={() => {
                        setDraftGoal(pin.target);
                        setPin(null);
                    }}
                    onUpdate={updateGoal}
                    onClose={() => setPin(null)}
                />
            ) : null}
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
