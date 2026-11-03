import React, { useEffect, useRef, useState } from 'react';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import GoalIcon from '../atoms/GoalIcon';
import styles from './GoalMarkerLayer.module.css';

const NAME_ROOM = 200;
const ICON_SIZE = 24;

/** Where each marker's thresholds land in the layer, from the chart's scales. */
function measure(chart, layer, markers) {
    const area = chart?.chartArea;
    if (!area || !chart.canvas || !layer) return [];
    const canvasRect = chart.canvas.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const dx = canvasRect.left - layerRect.left;
    const dy = canvasRect.top - layerRect.top;
    return markers.flatMap((marker) => {
        let x = null;
        let y = null;
        let xRule = null;
        let yRule = null;
        marker.rules.forEach((rule) => {
            const scale = chart.scales?.[rule.scaleID];
            if (!scale) return;
            const pixel = Math.round(scale.getPixelForValue(rule.value));
            if (scale.axis === 'x' && x == null) { x = pixel; xRule = rule; }
            if (scale.axis === 'y' && y == null) { y = pixel; yRule = rule; }
        });
        if (x == null && y == null) return [];
        return [{
            key: marker.key,
            x, y, xRule, yRule,
            area: { left: area.left + dx, right: area.right + dx, top: area.top + dy, bottom: area.bottom + dy },
            dx, dy,
        }];
    });
}

const samePlacement = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Goals marked on a chart at their thresholds: the goal's icon where its values meet (or at the
 * end of the line, for a goal with a threshold on one axis). Hovering or focusing one names it and
 * draws its guide lines to the axes; clicking it opens the goal. Sits over the chart as an absolutely
 * positioned layer, so its parent must be positioned.
 *
 * @param {{ chartRef: { current: any }, markers: Array<{ key: string, goal: any, rules: any[] }>,
 *   onOpenGoal?: ((goalId: string) => void) | null }} props
 */
export default function GoalMarkerLayer({ chartRef, markers, onOpenGoal = null }) {
    const { getGoalIcon, getGoalColor, getGoalSecondaryColor } = useGoalLevels();
    const layerRef = useRef(null);
    const [placed, setPlaced] = useState([]);
    const [activeKey, setActiveKey] = useState(null);

    // The chart lays out in its own effect (an earlier sibling), so measure after it, and again on resize.
    useEffect(() => {
        const chart = chartRef?.current;
        if (!chart?.canvas || !markers.length) return undefined;
        let frame = 0;
        const update = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const next = measure(chartRef.current, layerRef.current, markers);
                setPlaced((current) => (samePlacement(current, next) ? current : next));
            });
        };
        update();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        observer?.observe(chart.canvas);
        return () => {
            cancelAnimationFrame(frame);
            observer?.disconnect();
        };
    });

    if (!markers.length) return null;
    const byKey = new Map(markers.map((marker) => [marker.key, marker]));
    return (
        <div ref={layerRef} className={styles.layer}>
            {placed.map(({ key, x, y, xRule, yRule, area, dx, dy }) => {
                const marker = byKey.get(key);
                if (!marker) return null;
                const { goal } = marker;
                const left = x == null ? area.right : x + dx;
                const top = y == null ? area.top : y + dy;
                const active = activeKey === key;
                const colorKey = goal.completed ? 'Completed' : goal;
                const thresholds = [xRule, yRule].filter(Boolean).map((rule) => `${rule.symbol} ${rule.value}`).join(', ');
                const label = `${goal.goal_name} (${thresholds})`;
                const handlers = {
                    onMouseEnter: () => setActiveKey(key),
                    onMouseLeave: () => setActiveKey(null),
                    onFocus: () => setActiveKey(key),
                    onBlur: () => setActiveKey(null),
                };
                const content = (
                    <>
                        <GoalIcon
                            shape={getGoalIcon(goal)}
                            color={getGoalColor(colorKey)}
                            secondaryColor={getGoalSecondaryColor(colorKey)}
                            size={ICON_SIZE}
                        />
                        {active ? <span className={styles.name}>{goal.goal_name}</span> : null}
                    </>
                );
                const className = `${styles.marker} ${left > area.right - NAME_ROOM ? styles.flipped : ''} ${goal.completed ? styles.completed : ''} ${active ? styles.active : ''}`;
                return (
                    <React.Fragment key={key}>
                        {active && x != null ? (
                            <>
                                <span className={styles.vLine} style={{ left, top, height: area.bottom - top }} />
                                <span className={`${styles.axisValue} ${styles.xValue}`} style={{ left, top: area.bottom }}>{xRule.symbol} {xRule.value}</span>
                            </>
                        ) : null}
                        {active && y != null ? (
                            <>
                                <span className={styles.hLine} style={{ top, left: area.left, width: left - area.left }} />
                                <span className={`${styles.axisValue} ${styles.yValue}`} style={{ top, left: area.left }}>{yRule.symbol} {yRule.value}</span>
                            </>
                        ) : null}
                        {onOpenGoal ? (
                            <button
                                type="button"
                                className={className}
                                style={{ left, top }}
                                aria-label={`Open goal ${label}`}
                                title={label}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenGoal(goal.goal_id);
                                }}
                                // Not a press on the chart (annotate mode's crosshair or long-press menu).
                                onPointerDown={(event) => event.stopPropagation()}
                                {...handlers}
                            >
                                {content}
                            </button>
                        ) : (
                            <span className={className} style={{ left, top }} title={label} {...handlers}>{content}</span>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

/** The chart (`children`) in a positioned box with its goal markers over it; just the chart when there are none. */
export function GoalMarkerHost({ chartRef, markers, onOpenGoal = null, children }) {
    if (!markers.length) return children;
    return (
        <div className={styles.host}>
            {children}
            <GoalMarkerLayer chartRef={chartRef} markers={markers} onOpenGoal={onOpenGoal} />
        </div>
    );
}
