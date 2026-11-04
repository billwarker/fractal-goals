import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../hooks/queryKeys';
import { useFractalTree } from '../../hooks/useGoalQueries';
import { fractalApi } from '../../utils/api';
import { findGoalNodeById } from '../../utils/goalNodeModel';
import { applyCreatedGoal, refreshGoalReadModels } from '../../utils/goalTreeCache';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import DropdownMenu, { DropdownMenuItem } from '../atoms/DropdownMenu';
import AnnotationCrosshair from './annotate/AnnotationCrosshair';
import AnnotationPopover from './annotate/AnnotationPopover';
import AxisExtendButtons from './annotate/AxisExtendButtons';
import useAxisExtension from './annotate/useAxisExtension';
import { GOAL_CHART_IDS, readChartGoalTarget } from './chartGoalTargets';
import styles from './ChartGoalSurface.module.css';

const GoalDetailModal = lazyWithRetry(() => import('../ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;
const POPOVER_WIDTH = 260;
const POPOVER_HEIGHT = 200;
const POPOVER_MARGIN = 4;
const GHOST_CLICK_MS = 400;

/** The click a browser sends after a touch ends would land on whatever just appeared under the finger. */
function swallowNextClick() {
    const swallow = (event) => {
        event.stopPropagation();
        event.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), GHOST_CLICK_MS);
}

/**
 * Analytics charts as a goal-setting surface.
 *
 * Annotate mode (the panel's "Set goal" toggle, or "A" while the chart is focused): a crosshair follows the pointer,
 * snapped to what the metric can hold, with the values on each axis and the goal the point would
 * set; a click pins it (on touch, the point where the finger lifts), and the pin offers "Create goal…" (the goal modal, seeded) or updating a
 * goal that already has a threshold on this activity, after a live preview. Right-click (or
 * long-press on touch) stays as the quick "Set goal here…". Existing goals on the activity are
 * passed to the chart, which marks them at their thresholds; clicking one opens it here.
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
    const [openGoalId, setOpenGoalId] = useState(null);
    const pressRef = useRef(null);
    const annotatePressRef = useRef(false);
    const surfaceRef = useRef(null);

    const { data: lines = [] } = useQuery({
        queryKey: queryKeys.goalConditionLines(rootId, activityId),
        queryFn: async () => (await fractalApi.getActivityGoalConditions(rootId, activityId)).data?.goals || [],
        enabled: Boolean(rootId && activityId && supported),
        staleTime: 60 * 1000,
    });
    const { data: tree } = useFractalTree(rootId, { enabled: Boolean(draftGoal || openGoalId) });
    const openGoal = openGoalId && tree ? findGoalNodeById(tree, openGoalId) : null;
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
        return {
            canvasRect,
            offset: { left: canvasRect.left - surfaceRect.left, top: canvasRect.top - surfaceRect.top },
            area: chart.chartArea,
            surfaceSize: { width: surfaceRect.width, height: surfaceRect.height },
        };
    }, [chartRef]);

    const { controls: extendControls, extend, shrink, futureShare } = useAxisExtension({ chartRef, annotating, placement });
    const chartContext = useMemo(() => ({
        ...context, goalConditionLines: lines, onOpenGoal: setOpenGoalId, axisFutureShare: futureShare,
    }), [context, futureShare, lines]);

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

    // Esc leaves annotate mode wherever focus is (clicking "Set goal" leaves it on that button). An
    // open pin, menu or goal takes its own Esc first, and a field being typed in keeps it.
    const escapeLeaves = annotating && !pin && !menu && !draftGoal && !openGoalId;
    useEffect(() => {
        if (!escapeLeaves) return undefined;
        const leave = (event) => {
            if (event.key !== 'Escape' || event.target.closest?.('input, textarea, select')) return;
            stopAnnotating();
        };
        window.addEventListener('keydown', leave);
        return () => window.removeEventListener('keydown', leave);
    }, [escapeLeaves, stopAnnotating]);

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
    /** The crosshair's reading of the chart under this event. */
    const pointAt = (event) => {
        const target = read(event.nativeEvent);
        const where = target ? placement() : null;
        return target && where && where.area ? {
            target,
            offset: where.offset,
            area: where.area,
            surfaceSize: where.surfaceSize,
            touch: event.pointerType === 'touch',
            pointer: { x: event.clientX - where.canvasRect.left, y: event.clientY - where.canvasRect.top },
        } : null;
    };
    /** Pins a point that can set a goal, inside the surface however narrow the chart. */
    const pinPoint = (point) => {
        if (!point?.target?.conditionDraft) return false;
        const { offset, area, pointer, surfaceSize } = point;
        const fit = (value, room) => Math.max(POPOVER_MARGIN, Math.min(value, room - POPOVER_MARGIN));
        setPin({
            target: point.target,
            left: fit(offset.left + Math.min(pointer.x + 12, area.right - POPOVER_WIDTH), surfaceSize.width - POPOVER_WIDTH),
            top: fit(offset.top + Math.max(area.top, pointer.y - 20), surfaceSize.height - POPOVER_HEIGHT),
        });
        return true;
    };
    const annotateHandlers = {
        onPointerMove: (event) => {
            if (!pin) setHover(pointAt(event));
        },
        onPointerLeave: () => {
            if (!pin) setHover(null);
        },
        onClick: (event) => {
            if (pin || event.target.closest?.('[data-chart-goal-menu]')) return;
            pinPoint(pointAt(event));
        },
        // A touch has no hover before it lands, and lifting ends its pointer: it pins here, not on the click.
        onTouchPress: (event) => {
            if (pin || event.target.closest?.('[data-chart-goal-menu]')) return;
            annotatePressRef.current = true;
            setHover(pointAt(event));
        },
        onTouchLift: (event) => {
            if (!annotatePressRef.current) return;
            annotatePressRef.current = false;
            setHover(null);
            if (!pin && pinPoint(pointAt(event))) swallowNextClick();
        },
    };
    const menuHandlers = {
        onContextMenu: (event) => {
            if (openAt(event.nativeEvent)) event.preventDefault();
        },
        onPointerDown: (event) => {
            if (event.pointerType !== 'touch') return;
            if (annotating) {
                annotateHandlers.onTouchPress(event);
                return;
            }
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
        onPointerUp: (event) => {
            cancelPress();
            if (annotating && event.pointerType === 'touch') annotateHandlers.onTouchLift(event);
        },
        onPointerCancel: () => {
            cancelPress();
            annotatePressRef.current = false;
        },
        onKeyDown: (event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'a' || event.key === 'A') onAnnotatingChange(!annotating);
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

    // An open goal edited or completed here refreshes every goal view, and its marker on this chart.
    const refreshGoals = () => Promise.all([
        refreshGoalReadModels(queryClient, queryKeys, rootId),
        queryClient.invalidateQueries({ queryKey: queryKeys.goalConditionRoot(rootId) }),
    ]);
    const updateOpenGoal = async (goalId, updates) => {
        try {
            const response = await fractalApi.updateGoal(rootId, goalId, updates);
            await refreshGoals();
            return response?.data || null;
        } catch (error) {
            notify.error(`Couldn’t update the goal: ${formatError(error)}`);
            throw error;
        }
    };
    const toggleOpenGoal = async (goalId, currentStatus, sequenceOptions = null) => {
        try {
            const response = await fractalApi.toggleGoalCompletion(rootId, goalId, !currentStatus, null, sequenceOptions);
            await refreshGoals();
            return response;
        } catch (error) {
            notify.error(`Couldn’t update the goal: ${formatError(error)}`);
            return null;
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
            {annotating && !pin ? (
                <AxisExtendButtons
                    controls={extendControls}
                    onExtend={(axis, end) => { setHover(null); extend(axis, end); }}
                    onShrink={(axis, end) => { setHover(null); shrink(axis, end); }}
                    onPointerEnter={() => setHover(null)}
                />
            ) : null}
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
            {openGoal ? (
                <Suspense fallback={null}>
                    <GoalDetailModal
                        isOpen
                        goal={openGoal}
                        rootId={rootId}
                        treeData={tree}
                        displayMode="modal"
                        onUpdate={updateOpenGoal}
                        onToggleCompletion={toggleOpenGoal}
                        onClose={() => setOpenGoalId(null)}
                    />
                </Suspense>
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
