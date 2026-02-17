import React, { useMemo } from 'react';
import TargetCard from '../TargetCard';
import styles from './GoalsPanel.module.css';
import { useGoals } from '../../contexts/GoalsContext';

/**
 * TargetsSection - Displays a list of targets aggregated from the goal hierarchy.
 * Targets are sorted by goal depth (deepest first, e.g., Nano -> Micro -> Immediate -> ShortTerm).
 */
function TargetsSection({ rootId, sessionId, hierarchy, activeActivityId, activityDefinitions = [], targetAchievements, achievedTargetIds }) {
    const { useFractalTreeQuery } = useGoals();
    const { data: goalTree } = useFractalTreeQuery(rootId);

    // Flatten all goals and extract targets
    const allTargets = useMemo(() => {
        const targets = [];

        // Use either the scoped hierarchy provided or the whole tree
        const nodesToProcess = hierarchy || (goalTree ? [goalTree] : []);
        if (nodesToProcess.length === 0) return [];

        const processGoal = (goal, depth = 0) => {
            // Targets can be in goal.targets or goal.attributes.targets depending on serialization/eager loading
            const rawTargets = goal.attributes?.targets || goal.targets;
            let targetsList = [];

            if (Array.isArray(rawTargets)) {
                targetsList = rawTargets;
            } else if (typeof rawTargets === 'string' && rawTargets.length > 0) {
                try {
                    targetsList = JSON.parse(rawTargets);
                } catch (e) {
                    console.error("Failed to parse targets JSON", e);
                    targetsList = [];
                }
            }

            if (targetsList && Array.isArray(targetsList)) {
                targetsList.forEach(target => {
                    // Filter by activeActivityId if provided (scoping)
                    if (activeActivityId && target.activity_id !== activeActivityId) return;

                    // Get real-time achievement status if available
                    const achievement = targetAchievements?.get(target.id);
                    // Check if either the activity metrics, the event listener, or the backend says it's achieved
                    const isCompleted = (achievement ? achievement.achieved : target.completed) || (achievedTargetIds?.has(target.id));

                    targets.push({
                        ...target,
                        _goalDepth: goal.depth ?? depth, // Use depth from hierarchy node if available
                        _goalName: goal.name,
                        _goalType: goal.type,
                        _goalId: goal.id,
                        is_completed_realtime: isCompleted
                    });
                });
            }

            // Internal tree traversal only if we are using the goalTree root (hierarchy is null)
            if (!hierarchy && goal.children && Array.isArray(goal.children)) {
                goal.children.forEach(child => processGoal(child, depth + 1));
            }
        };

        nodesToProcess.forEach(node => processGoal(node, node.depth || 0));
        return targets;
    }, [goalTree, hierarchy, targetAchievements, activeActivityId, achievedTargetIds]);

    // 2. Sort by Depth Descending (Deepest first)
    // If depths are equal, maybe sort by creation time or name? stick to depth for now.
    const sortedTargets = useMemo(() => {
        return allTargets.sort((a, b) => b._goalDepth - a._goalDepth);
    }, [allTargets]);

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
                            isCompleted={target.is_completed_realtime}
                            isEditMode={false}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

export default TargetsSection;
