import { useMemo, useState } from 'react';

function buildInitialGoalFormState(goal, mode) {
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
        } catch {
            parsedTargets = [];
        }
    }

    return {
        name: mode === 'create' ? '' : (goal?.name || ''),
        description: mode === 'create' ? '' : (goal?.attributes?.description || goal?.description || ''),
        deadline: mode === 'create' ? '' : deadline,
        relevanceStatement: mode === 'create' ? '' : (goal?.attributes?.relevance_statement || ''),
        completedViaChildren: mode === 'create' ? false : (goal?.attributes?.completed_via_children || false),
        inheritParentActivities: mode === 'create'
            ? false
            : (goal?.attributes?.inherit_parent_activities || false),
        trackActivities: mode === 'create' ? true : (goal?.attributes?.track_activities !== undefined ? goal.attributes.track_activities : true),
        allowManualCompletion: mode === 'create' ? true : (goal?.attributes?.allow_manual_completion !== undefined ? goal.attributes.allow_manual_completion : true),
        targets: mode === 'create' ? [] : parsedTargets,
    };
}

function resolveNextValue(nextValue, currentValue) {
    return typeof nextValue === 'function' ? nextValue(currentValue) : nextValue;
}

export function useGoalForm(goal, mode) {
    const initialState = useMemo(() => buildInitialGoalFormState(goal, mode), [goal, mode]);
    const validationRules = useMemo(() => ({
        name: (val) => !val || !val.trim() ? 'Goal Name is required' : null,
        description: () => null,
        deadline: () => null,
        relevanceStatement: () => null,
    }), []);
    const formKey = `${mode}:${goal?.attributes?.id || goal?.id || 'new-goal'}`;
    const [formStateByKey, setFormStateByKey] = useState({});
    const currentFormState = formStateByKey[formKey] || {
        values: initialState,
        errors: {},
        touched: {},
    };

    const updateFormState = (updater) => {
        setFormStateByKey((prev) => {
            const currentState = prev[formKey] || {
                values: initialState,
                errors: {},
                touched: {},
            };
            const nextState =
                typeof updater === 'function' ? updater(currentState) : updater;

            return {
                ...prev,
                [formKey]: nextState,
            };
        });
    };

    const setFieldValue = (field, nextValue) => {
        updateFormState((prev) => {
            const nextFieldValue = resolveNextValue(nextValue, prev.values[field]);
            const nextErrors = prev.errors[field]
                ? { ...prev.errors, [field]: null }
                : prev.errors;

            return {
                ...prev,
                values: {
                    ...prev.values,
                    [field]: nextFieldValue,
                },
                errors: nextErrors,
            };
        });
    };

    const setFieldTouched = (field) => {
        updateFormState((prev) => ({
            ...prev,
            touched: {
                ...prev.touched,
                [field]: true,
            },
            errors: {
                ...prev.errors,
                [field]: validationRules[field]
                    ? validationRules[field](prev.values[field], prev.values)
                    : null,
            },
        }));
    };

    const validateForm = () => {
        const nextErrors = {};
        let isValid = true;

        Object.keys(validationRules).forEach((field) => {
            const error = validationRules[field](currentFormState.values[field], currentFormState.values);
            if (error) {
                nextErrors[field] = error;
                isValid = false;
            }
        });

        updateFormState((prev) => ({
            ...prev,
            errors: nextErrors,
            touched: Object.keys(validationRules).reduce((acc, field) => {
                acc[field] = true;
                return acc;
            }, {}),
        }));

        return isValid;
    };

    const resetForm = (newValues = initialState) => {
        updateFormState({
            values: newValues,
            errors: {},
            touched: {},
        });
    };

    return {
        name: currentFormState.values.name,
        setName: (value) => {
            setFieldValue('name', value);
            setFieldTouched('name');
        },
        description: currentFormState.values.description,
        setDescription: (value) => {
            setFieldValue('description', value);
            setFieldTouched('description');
        },
        deadline: currentFormState.values.deadline,
        setDeadline: (value) => {
            setFieldValue('deadline', value);
            setFieldTouched('deadline');
        },
        relevanceStatement: currentFormState.values.relevanceStatement,
        setRelevanceStatement: (value) => {
            setFieldValue('relevanceStatement', value);
            setFieldTouched('relevanceStatement');
        },
        completedViaChildren: currentFormState.values.completedViaChildren,
        setCompletedViaChildren: (value) => setFieldValue('completedViaChildren', value),
        inheritParentActivities: currentFormState.values.inheritParentActivities,
        setInheritParentActivities: (value) => setFieldValue('inheritParentActivities', value),
        trackActivities: currentFormState.values.trackActivities,
        setTrackActivities: (value) => setFieldValue('trackActivities', value),
        allowManualCompletion: currentFormState.values.allowManualCompletion,
        setAllowManualCompletion: (value) => setFieldValue('allowManualCompletion', value),
        targets: currentFormState.values.targets,
        setTargets: (value) => setFieldValue('targets', value),
        errors: currentFormState.errors,
        validateForm,
        resetForm,
    };
}
