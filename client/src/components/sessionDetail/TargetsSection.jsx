import React, { useMemo } from 'react';
import TargetCard from '../TargetCard';
import styles from './GoalsPanel.module.css';

/**
 * TargetsSection - Displays a list of targets aggregated from the goal hierarchy.
 * Targets are sorted by goal depth (deepest first, e.g., Nano -> Micro -> Immediate -> ShortTerm).
 */
function TargetsSection({
    hierarchy,
    activityDefinitions
}) {
    // 1. Extract and Flatten Targets
    const sortedTargets = useMemo(() => {
        if (!hierarchy || hierarchy.length === 0) return [];

        const allTargets = [];

        hierarchy.forEach(node => {
            if (node.targets && node.targets.length > 0) {
                node.targets.forEach(target => {
                    allTargets.push({
                        ...target,
                        _goalDepth: node.depth,
                        _goalName: node.name,
                        _goalType: node.type,
                        _goalId: node.id
                    });
                });
            }
        });

        // 2. Sort by Depth Descending (Deepest first)
        // If depths are equal, maybe sort by creation time or name? stick to depth for now.
        return allTargets.sort((a, b) => b._goalDepth - a._goalDepth);
    }, [hierarchy]);

    if (sortedTargets.length === 0) return null;

    return (
        <div className={styles.contextSection} style={{ marginTop: '24px' }}>
            <div className={styles.headerContainer}>
                <div className={styles.contextLabel}>
                    Targets
                </div>
            </div>

            <div className={styles.targetsList}>
                {sortedTargets.map(target => (
                    <div key={target.id} className={styles.targetWrapper}>
                        {/* Optional: Goal Header for context? User asked for just targets, but maybe context is helpful. 
                            The plan said "Duplicate display of goals slightly (as headers)". 
                            Let's add a small label above the card if it helps context, or just rely on the card.
                            TargetCard has name. Let's stick to just the cards for now as requested "just have the target cards".
                        */}
                        <div className={styles.targetGoalLabel}>
                            From: {target._goalName}
                            <span className={styles.targetGoalType}>
                                • {target._goalType?.replace('Goal', '')}
                            </span>
                        </div>
                        <TargetCard
                            target={target}
                            activityDefinitions={activityDefinitions}
                            isCompleted={target.completed}
                            isEditMode={false}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

export default TargetsSection;
