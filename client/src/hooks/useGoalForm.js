import { useMemo, useState } from 'react';

import { getGoalNodeRevision } from '../utils/goalNodeModel';
import { conditionToDraft, getGoalCompletionCondition, getGoalCondition, getGoalStartedAt } from '../utils/goalConditions';

function buildInitialGoalFormState(goal, mode, initialCompletion) {
    let deadline = '';
    if (goal) {
        const rawDeadline = goal.attributes?.deadline || goal.deadline || '';
        if (rawDeadline) {
            deadline = rawDeadline.split('T')[0].split(' ')[0];
        }
    }

    return {
        name: mode === 'create' ? '' : (goal?.name || ''),
        description: mode === 'create' ? '' : (goal?.attributes?.description || goal?.description || ''),
        deadline: mode === 'create' ? '' : deadline,
        startedAt: mode === 'create' ? '' : getGoalStartedAt(goal),
        completionCondition: mode === 'create'
            ? (initialCompletion?.completionCondition ?? 'manual')
            : getGoalCompletionCondition(goal),
        conditionDraft: mode === 'create'
            ? (initialCompletion?.conditionDraft ?? null)
            : conditionToDraft(getGoalCondition(goal)),
        inheritParentActivities: mode === 'create'
            ? false
            : (goal?.attributes?.inherit_parent_activities || false),
        trackActivities: mode === 'create' ? true : (goal?.attributes?.track_activities !== undefined ? goal.attributes.track_activities : true),
        // The goal's own review cadence; null means its level's.
        reviewCadence: mode !== 'create' && (goal?.review_cadence_value ?? goal?.attributes?.review_cadence_value)
            ? {
                value: goal.review_cadence_value ?? goal.attributes.review_cadence_value,
                unit: goal.review_cadence_unit ?? goal.attributes.review_cadence_unit,
            }
            : null,
        reviewsOn: mode === 'create' ? true : !(goal?.review_disabled ?? goal?.attributes?.review_disabled ?? false),
    };
}

function resolveNextValue(nextValue, currentValue) {
    return typeof nextValue === 'function' ? nextValue(currentValue) : nextValue;
}

export function useGoalForm(goal, mode, initialCompletion = null) {
    const initialState = useMemo(
        () => buildInitialGoalFormState(goal, mode, initialCompletion),
        [goal, mode, initialCompletion],
    );
    const validationRules = useMemo(() => ({
        name: (val) => !val || !val.trim() ? 'Goal Name is required' : null,
        description: () => null,
        deadline: () => null,
    }), []);
    const formKey = `${mode}:${goal?.attributes?.id || goal?.id || 'new-goal'}:${getGoalNodeRevision(goal)}`;
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
        startedAt: currentFormState.values.startedAt,
        setStartedAt: (value) => setFieldValue('startedAt', value),
        completionCondition: currentFormState.values.completionCondition,
        setCompletionCondition: (value) => setFieldValue('completionCondition', value),
        conditionDraft: currentFormState.values.conditionDraft,
        setConditionDraft: (value) => setFieldValue('conditionDraft', value),
        inheritParentActivities: currentFormState.values.inheritParentActivities,
        setInheritParentActivities: (value) => setFieldValue('inheritParentActivities', value),
        trackActivities: currentFormState.values.trackActivities,
        setTrackActivities: (value) => setFieldValue('trackActivities', value),
        reviewCadence: currentFormState.values.reviewCadence,
        setReviewCadence: (value) => setFieldValue('reviewCadence', value),
        reviewsOn: currentFormState.values.reviewsOn,
        setReviewsOn: (value) => setFieldValue('reviewsOn', value),
        errors: currentFormState.errors,
        validateForm,
        resetForm,
    };
}
