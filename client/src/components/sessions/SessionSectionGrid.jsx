/**
 * SessionSectionGrid - Grid of session sections with exercises
 * 
 * Renders sections horizontally with their exercises.
 * Optimized with React.memo for list rendering performance.
 */

import React, { memo, useMemo } from 'react';
import { formatShortDuration } from '../../hooks/useSessionDuration';
import ExerciseCard from './ExerciseCard';
import useIsMobile from '../../hooks/useIsMobile';
import styles from './SessionSectionGrid.module.css';

/**
 * Single section column with exercises
 */
const SectionColumn = memo(function SectionColumn({
    section,
    activities,
    activityInstances = []
}) {
    const sectionExercises = useMemo(() => {
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
        const seconds = sectionExercises.reduce((sum, exercise) => sum + (exercise.duration_seconds || 0), 0);
        if (seconds > 0) {
            return formatShortDuration(seconds);
        }
        return `${section.duration_minutes || 0} min (planned)`;
    }, [section.duration_minutes, sectionExercises]);

    return (
        <div className={styles.sectionColumn}>
            {/* Section Header */}
            <div className={styles.sectionHeader}>
                {section.name}
            </div>

            <div className={styles.sectionDuration}>
                {sectionDuration}
            </div>

            {/* Exercises - Vertical List */}
            {sectionExercises.length > 0 && (
                <div className={styles.exercisesList}>
                    {sectionExercises.map((exercise, exerciseIndex) => {
                        const actDef = exercise.type === 'activity'
                            ? activities.find(a => a.id === exercise.activity_id)
                            : null;

                        return (
                            <ExerciseCard
                                key={exerciseIndex}
                                exercise={exercise}
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
