/**
 * SessionSectionGrid - Grid of session sections with exercises
 * 
 * Renders sections horizontally with their exercises.
 * Optimized with React.memo for list rendering performance.
 */

import React, { memo, useMemo } from 'react';
import { formatShortDuration, calculateSectionDuration } from '../../hooks/useSessionDuration';
import ExerciseCard from './ExerciseCard';
import styles from './SessionSectionGrid.module.css';

/**
 * Single section column with exercises
 */
const SectionColumn = memo(function SectionColumn({
    section,
    sectionIndex,
    activities
}) {
    const sectionDuration = useMemo(() => {
        const seconds = calculateSectionDuration(section);
        if (seconds > 0) {
            return formatShortDuration(seconds);
        }
        return `${section.duration_minutes || 0} min (planned)`;
    }, [section]);

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
            {section.exercises && section.exercises.length > 0 && (
                <div className={styles.exercisesList}>
                    {section.exercises.map((exercise, exerciseIndex) => {
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
    activities
}) {
    if (!sections || sections.length === 0) {
        return null;
    }

    return (
        <div
            className={styles.sectionsGrid}
            style={{ gridTemplateColumns: `repeat(${sections.length}, 1fr)` }}
        >
            {sections.map((section, sectionIndex) => (
                <SectionColumn
                    key={sectionIndex}
                    section={section}
                    sectionIndex={sectionIndex}
                    activities={activities}
                />
            ))}
        </div>
    );
});

export default SessionSectionGrid;
