/**
 * SessionSectionGrid - Grid of session sections with recorded work
 *
 * Renders sections and their work items in a single horizontal strip, so the
 * row is only as tall as its tallest item and overflow scrolls horizontally.
 * Within a section, consecutive items share a vertical stack whenever the stack
 * stays no taller than the tallest single item across all sections.
 * Optimized with React.memo for list rendering performance.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatShortDuration } from '../../hooks/useSessionDuration';
import ActivityCard from './ActivityCard';
import CircuitWorkSummaryCard from './CircuitWorkSummaryCard';
import useIsMobile from '../../hooks/useIsMobile';
import styles from './SessionSectionGrid.module.css';

// Must match the .activitiesList / .itemStack gap in SessionSectionGrid.module.css
const STACK_GAP_PX = 8;
// Absorbs sub-pixel rounding so equal-height items still pair up
const HEIGHT_TOLERANCE_PX = 1;

/**
 * Tracks rendered heights of work items via one shared ResizeObserver.
 * Returns a ref-callback factory keyed by item id and a { key: height } map.
 */
function useItemHeights() {
    const [heights, setHeights] = useState({});
    const observerRef = useRef(null);
    const elementsRef = useRef(new Map());

    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') return undefined;

        const observer = new ResizeObserver((entries) => {
            setHeights((prev) => {
                let next = prev;
                entries.forEach((entry) => {
                    const key = entry.target.dataset.itemKey;
                    const height = Math.ceil(entry.target.getBoundingClientRect().height);
                    if (key && prev[key] !== height) {
                        if (next === prev) next = { ...prev };
                        next[key] = height;
                    }
                });
                return next;
            });
        });
        observerRef.current = observer;
        elementsRef.current.forEach((element) => observer.observe(element));

        return () => {
            observer.disconnect();
            observerRef.current = null;
        };
    }, []);

    // One stable ref callback per key so re-renders don't re-observe elements
    const refCallbacksRef = useRef(new Map());
    const registerItem = useCallback((key) => {
        const cached = refCallbacksRef.current.get(key);
        if (cached) return cached;

        const callback = (element) => {
            const previous = elementsRef.current.get(key);
            if (previous && previous !== element) {
                observerRef.current?.unobserve(previous);
                elementsRef.current.delete(key);
            }
            if (element) {
                element.dataset.itemKey = key;
                elementsRef.current.set(key, element);
                observerRef.current?.observe(element);
            }
        };
        refCallbacksRef.current.set(key, callback);
        return callback;
    }, []);

    return { heights, registerItem };
}

/**
 * Greedily packs items, in order, into vertical stacks no taller than maxHeight.
 * Items without a measured height get their own stack.
 */
export function packIntoStacks(itemKeys, heights, maxHeight) {
    const stacks = [];
    let current = null;

    itemKeys.forEach((key) => {
        const height = heights[key];
        const fits = current
            && height != null
            && current.height + STACK_GAP_PX + height <= maxHeight + HEIGHT_TOLERANCE_PX;

        if (fits) {
            current.keys.push(key);
            current.height += STACK_GAP_PX + height;
            return;
        }

        current = { keys: [key], height: height ?? Infinity };
        stacks.push(current);
    });

    return stacks;
}

/**
 * Single section column with recorded work
 */
const SectionColumn = memo(function SectionColumn({
    section,
    activities,
    activityGroups = [],
    activityInstances = [],
    sessionStats = null,
    deltaDisplayMode = 'percent',
    itemKeyPrefix,
    itemHeights,
    maxItemHeight,
    registerItem,
    stackItems,
}) {
    const sectionItems = useMemo(() => {
        if (Array.isArray(section.items)) {
            return section.items
                .map((item) => {
                    if (item?.type === 'circuit' && item.circuit) {
                        return { type: 'circuit', circuit: item.circuit };
                    }
                    if (item?.type === 'activity' && item.activity) {
                        return { type: 'activity', activity: item.activity };
                    }
                    return null;
                })
                .filter(Boolean);
        }

        const instanceIds = section.activity_ids || [];
        if (!instanceIds.length || !activityInstances.length) return [];

        return instanceIds
            .map((instanceId) => {
                const instance = activityInstances.find((item) => item.id === instanceId);
                if (!instance) return null;

                return {
                    type: 'activity',
                    activity: {
                        ...instance,
                        type: 'activity',
                        activity_id: instance.activity_definition_id,
                        instance_id: instance.id,
                        name: instance.name || ''
                    },
                };
            })
            .filter(Boolean);
    }, [section.activity_ids, section.items, activityInstances]);

    const sectionDuration = useMemo(() => {
        const seconds = sectionItems.reduce((sum, item) => {
            const workItem = item.type === 'circuit' ? item.circuit : item.activity;
            return sum + (workItem?.duration_seconds || 0);
        }, 0);
        if (seconds > 0) {
            return formatShortDuration(seconds);
        }
        return `${section.duration_minutes || 0} min (planned)`;
    }, [section.duration_minutes, sectionItems]);

    const keyedItems = useMemo(() => sectionItems.map((item, itemIndex) => {
        const id = item.type === 'circuit'
            ? `circuit-${item.circuit.id || itemIndex}`
            : `activity-${item.activity.instance_id || itemIndex}`;
        return { ...item, key: `${itemKeyPrefix}:${id}` };
    }), [sectionItems, itemKeyPrefix]);

    const itemsByKey = useMemo(
        () => new Map(keyedItems.map((item) => [item.key, item])),
        [keyedItems]
    );

    const stacks = useMemo(() => {
        const keys = keyedItems.map((item) => item.key);
        if (!stackItems) return keys.map((key) => ({ keys: [key] }));
        return packIntoStacks(keys, itemHeights, maxItemHeight);
    }, [keyedItems, itemHeights, maxItemHeight, stackItems]);

    const renderItem = (item) => {
        if (item.type === 'circuit') {
            return (
                <CircuitWorkSummaryCard
                    circuit={item.circuit}
                    activities={activities}
                    activityInstances={activityInstances}
                    deltaDisplayMode={deltaDisplayMode}
                />
            );
        }

        const activity = item.activity;
        const activityDefinitionId = activity.activity_id || activity.activity_definition_id;
        const actDef = activities.find(a => a.id === activityDefinitionId);

        return (
            <ActivityCard
                activity={activity}
                activityDefinition={actDef}
                activityGroups={activityGroups}
                sessionStats={sessionStats}
                deltaDisplayMode={deltaDisplayMode}
            />
        );
    };

    return (
        <div className={styles.sectionColumn}>
            {/* Section Header */}
            <div className={styles.sectionHeader}>
                {section.name}
            </div>

            <div className={styles.sectionDuration}>
                {sectionDuration}
            </div>

            {/* Work items - horizontal run of vertical stacks */}
            {sectionItems.length > 0 && (
                <div className={styles.activitiesList}>
                    {stacks.map((stack) => (
                        <div key={stack.keys[0]} className={styles.itemStack}>
                            {stack.keys.map((key) => (
                                <div key={key} ref={registerItem(key)} className={styles.itemSlot}>
                                    {renderItem(itemsByKey.get(key))}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

/**
 * Main SessionSectionGrid component
 */
const SessionSectionGrid = memo(function SessionSectionGrid({
    sections,
    activities,
    activityGroups = [],
    activityInstances = [],
    sessionStats = null,
    deltaDisplayMode = 'percent',
}) {
    const isMobile = useIsMobile();
    const { heights, registerItem } = useItemHeights();

    const maxItemHeight = useMemo(() => {
        const values = Object.values(heights);
        return values.length ? Math.max(...values) : 0;
    }, [heights]);

    if (!sections || sections.length === 0) {
        return null;
    }

    return (
        <div className={styles.sectionsGrid}>
            {sections.map((section, sectionIndex) => (
                <SectionColumn
                    key={sectionIndex}
                    section={section}
                    activities={activities}
                    activityGroups={activityGroups}
                    activityInstances={activityInstances}
                    sessionStats={sessionStats}
                    deltaDisplayMode={deltaDisplayMode}
                    itemKeyPrefix={String(sectionIndex)}
                    itemHeights={heights}
                    maxItemHeight={maxItemHeight}
                    registerItem={registerItem}
                    stackItems={!isMobile}
                />
            ))}
        </div>
    );
});

export default SessionSectionGrid;
