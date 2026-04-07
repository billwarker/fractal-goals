/**
 * SessionSectionGrid - Grid of session sections with activities
 *
 * Renders sections horizontally with their activities.
 * Optimized with React.memo for list rendering performance.
 */

import React, { memo, useMemo } from 'react';
import { formatShortDuration } from '../../hooks/useSessionDuration';
import ActivityCard from './ActivityCard';
import useIsMobile from '../../hooks/useIsMobile';
import styles from './SessionSectionGrid.module.css';

/**
 * Single section column with activities
 */
const SectionColumn = memo(function SectionColumn({
    section,
    activities,
    activityInstances = []
}) {
    const sectionActivities = useMemo(() => {
        const instanceIds = section.activity_ids || [];
        if (!instanceIds.length || !activityInstances.length) return [];

        return instanceIds
            .map((instanceId) => {
                const instance = activityInstances.find((item) => item.id === instanceId);
                if (!instance) return null;

                return {
                    ...instance,
                    type: 'activity',
                    activity_id: instance.activity_definition_id,
                    instance_id: instance.id,
                    name: instance.name || ''
                };
            })
            .filter(Boolean);
    }, [section.activity_ids, activityInstances]);

    const sectionDuration = useMemo(() => {
        const seconds = sectionActivities.reduce((sum, activity) => sum + (activity.duration_seconds || 0), 0);
        if (seconds > 0) {
            return formatShortDuration(seconds);
        }
        return `${section.duration_minutes || 0} min (planned)`;
    }, [section.duration_minutes, sectionActivities]);

    return (
        <div className={styles.sectionColumn}>
            {/* Section Header */}
            <div className={styles.sectionHeader}>
                {section.name}
            </div>

            <div className={styles.sectionDuration}>
                {sectionDuration}
            </div>

            {/* Activities - Vertical List */}
            {sectionActivities.length > 0 && (
                <div className={styles.activitiesList}>
                    {sectionActivities.map((activity, activityIndex) => {
                        const actDef = activity.type === 'activity'
                            ? activities.find(a => a.id === activity.activity_id)
                            : null;

                        return (
                            <ActivityCard
                                key={activityIndex}
                                activity={activity}
                                activityDefinition={actDef}
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
    activityInstances = []
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
                    activityInstances={activityInstances}
                />
            ))}
        </div>
    );
});

export default SessionSectionGrid;
