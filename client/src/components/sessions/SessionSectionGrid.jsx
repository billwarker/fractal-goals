/**
 * SessionSectionGrid - Grid of session sections with recorded work
 *
 * Renders sections horizontally with ordered activity and circuit items.
 * Optimized with React.memo for list rendering performance.
 */

import React, { memo, useMemo } from 'react';
import { formatShortDuration } from '../../hooks/useSessionDuration';
import ActivityCard from './ActivityCard';
import CircuitWorkSummaryCard from './CircuitWorkSummaryCard';
import useIsMobile from '../../hooks/useIsMobile';
import styles from './SessionSectionGrid.module.css';

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

    return (
        <div className={styles.sectionColumn}>
            {/* Section Header */}
            <div className={styles.sectionHeader}>
                {section.name}
            </div>

            <div className={styles.sectionDuration}>
                {sectionDuration}
            </div>

            {/* Work items - Vertical List */}
            {sectionItems.length > 0 && (
                <div className={styles.activitiesList}>
                    {sectionItems.map((item, itemIndex) => {
                        if (item.type === 'circuit') {
                            return (
                                <CircuitWorkSummaryCard
                                    key={`circuit-${item.circuit.id || itemIndex}`}
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
                                key={`activity-${activity.instance_id || itemIndex}`}
                                activity={activity}
                                activityDefinition={actDef}
                                activityGroups={activityGroups}
                                sessionStats={sessionStats}
                                deltaDisplayMode={deltaDisplayMode}
                            />
                        );
                    })}
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

    if (!sections || sections.length === 0) {
        return null;
    }

    return (
        <div
            className={styles.sectionsGrid}
            style={isMobile ? undefined : { gridTemplateColumns: `repeat(${sections.length}, 1fr)` }}
        >
            {sections.map((section, sectionIndex) => (
                <SectionColumn
                    key={sectionIndex}
                    section={section}
                    activities={activities}
                    activityGroups={activityGroups}
                    activityInstances={activityInstances}
                    sessionStats={sessionStats}
                    deltaDisplayMode={deltaDisplayMode}
                />
            ))}
        </div>
    );
});

export default SessionSectionGrid;
