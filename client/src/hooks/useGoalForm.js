import { useState, useEffect } from 'react';

export function useGoalForm(goal, mode, isOpen) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [deadline, setDeadline] = useState('');
    const [relevanceStatement, setRelevanceStatement] = useState('');
    const [completedViaChildren, setCompletedViaChildren] = useState(false);
    const [trackActivities, setTrackActivities] = useState(true);
    const [allowManualCompletion, setAllowManualCompletion] = useState(true);
    const [targets, setTargets] = useState([]);

    // Derived state for dependency tracking
    const depGoalId = goal?.attributes?.id || goal?.id;
    const depGoalCompleted = goal?.attributes?.completed;
    const depGoalCompletedAt = goal?.attributes?.completed_at;

    const resetForm = () => {
        if (mode === 'create') {
            // Initialize empty form for create mode
            setName('');
            setDescription('');
            setDeadline('');
            setRelevanceStatement('');
            setTargets([]);
            setCompletedViaChildren(false);
            setTrackActivities(true);
            setAllowManualCompletion(true);
        } else if (goal) {
            setName(goal.name || '');
            setDescription(goal.attributes?.description || goal.description || '');

            // Format deadline for date input (needs YYYY-MM-DD format)
            const rawDeadline = goal.attributes?.deadline || goal.deadline || '';
            if (rawDeadline) {
                // Handle various datetime formats - extract just the date portion
                const dateOnly = rawDeadline.split('T')[0].split(' ')[0];
                setDeadline(dateOnly);
            } else {
                setDeadline('');
            }

            setRelevanceStatement(goal.attributes?.relevance_statement || '');
            setCompletedViaChildren(goal.attributes?.completed_via_children || false);
            setTrackActivities(goal.attributes?.track_activities !== undefined ? goal.attributes.track_activities : true);
            setAllowManualCompletion(goal.attributes?.allow_manual_completion !== undefined ? goal.attributes.allow_manual_completion : true);

            // Parse targets
            let parsedTargets = [];
            if (goal.attributes?.targets) {
                try {
                    parsedTargets = typeof goal.attributes.targets === 'string'
                        ? JSON.parse(goal.attributes.targets)
                        : goal.attributes.targets;
                } catch (e) {
                    console.error('Error parsing targets:', e);
                    parsedTargets = [];
                }
            }
            setTargets(parsedTargets);
        }
    };

    useEffect(() => {
        resetForm();
    }, [goal, depGoalId, depGoalCompleted, depGoalCompletedAt, mode, isOpen]);

    return {
        name, setName,
        description, setDescription,
        deadline, setDeadline,
        relevanceStatement, setRelevanceStatement,
        completedViaChildren, setCompletedViaChildren,
        trackActivities, setTrackActivities,
        allowManualCompletion, setAllowManualCompletion,
        targets, setTargets,
        resetForm
    };
}
