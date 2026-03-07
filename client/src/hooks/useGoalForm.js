import { useEffect, useMemo } from 'react';
import { useFormValidation } from './useFormValidation';

export function useGoalForm(goal, mode, isOpen) {
    const initialState = useMemo(() => {
        let deadline = '';
        if (goal) {
            const rawDeadline = goal.attributes?.deadline || goal.deadline || '';
            if (rawDeadline) {
                deadline = rawDeadline.split('T')[0].split(' ')[0];
            }
        }

        let parsedTargets = [];
        if (goal?.attributes?.targets) {
            try {
                parsedTargets = typeof goal.attributes.targets === 'string'
                    ? JSON.parse(goal.attributes.targets)
                    : goal.attributes.targets;
            } catch (e) {
                parsedTargets = [];
            }
        }

        return {
            name: mode === 'create' ? '' : (goal?.name || ''),
            description: mode === 'create' ? '' : (goal?.attributes?.description || goal?.description || ''),
            deadline: mode === 'create' ? '' : deadline,
            relevanceStatement: mode === 'create' ? '' : (goal?.attributes?.relevance_statement || ''),
            completedViaChildren: mode === 'create' ? false : (goal?.attributes?.completed_via_children || false),
            trackActivities: mode === 'create' ? true : (goal?.attributes?.track_activities !== undefined ? goal.attributes.track_activities : true),
            allowManualCompletion: mode === 'create' ? true : (goal?.attributes?.allow_manual_completion !== undefined ? goal.attributes.allow_manual_completion : true),
            targets: mode === 'create' ? [] : parsedTargets
        };
    }, [goal, mode]);

    const validationRules = useMemo(() => ({
        name: (val) => !val || !val.trim() ? 'Goal Name is required' : null,
        description: (val) => null, // Optional
        deadline: (val) => null, // Optional
        relevanceStatement: (val) => null // Optional
    }), []);

    const form = useFormValidation(initialState, validationRules);

    // Derived state for dependency tracking
    const depGoalId = goal?.attributes?.id || goal?.id;
    const depGoalCompleted = goal?.attributes?.completed;
    const depGoalCompletedAt = goal?.attributes?.completed_at;

    useEffect(() => {
        form.resetForm(initialState);
    }, [initialState, depGoalId, depGoalCompleted, depGoalCompletedAt, mode, isOpen]);

    return {
        // Expose values mapped to old props
        name: form.values.name, setName: (val) => { form.setFieldValue('name', val); form.setFieldTouched('name'); },
        description: form.values.description, setDescription: (val) => { form.setFieldValue('description', val); form.setFieldTouched('description'); },
        deadline: form.values.deadline, setDeadline: (val) => { form.setFieldValue('deadline', val); form.setFieldTouched('deadline'); },
        relevanceStatement: form.values.relevanceStatement, setRelevanceStatement: (val) => { form.setFieldValue('relevanceStatement', val); form.setFieldTouched('relevanceStatement'); },
        completedViaChildren: form.values.completedViaChildren, setCompletedViaChildren: (val) => form.setFieldValue('completedViaChildren', val),
        trackActivities: form.values.trackActivities, setTrackActivities: (val) => form.setFieldValue('trackActivities', val),
        allowManualCompletion: form.values.allowManualCompletion, setAllowManualCompletion: (val) => form.setFieldValue('allowManualCompletion', val),
        targets: form.values.targets, setTargets: (val) => form.setFieldValue('targets', val),

        // Expose new validation utilities
        errors: form.errors,
        validateForm: form.validateForm,
        resetForm: () => form.resetForm(initialState)
    };
}
