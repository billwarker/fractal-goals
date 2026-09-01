import { useCallback, useEffect, useRef } from 'react';

function resolveMetricId(metric) {
    return metric?.metric_id || metric?.metric_definition_id || null;
}

function resolveSplitId(metric) {
    return metric?.split_id || metric?.split_definition_id || null;
}

function applyDraftsToSets(baseSets, drafts) {
    if (!drafts || Object.keys(drafts).length === 0) return [...baseSets];

    return baseSets.map((set, setIdx) => {
        const nextSet = {
            ...set,
            metrics: Array.isArray(set.metrics) ? [...set.metrics] : [],
        };

        Object.entries(drafts).forEach(([key, draftValue]) => {
            const [draftSetIndex, metricId, splitIdRaw] = key.split(':');
            if (Number(draftSetIndex) !== setIdx) return;

            const splitId = splitIdRaw || null;
            const metricIndex = nextSet.metrics.findIndex((metric) => (
                resolveMetricId(metric) === metricId
                && (splitId ? resolveSplitId(metric) === splitId : !resolveSplitId(metric))
            ));

            if (metricIndex >= 0) {
                nextSet.metrics[metricIndex] = {
                    ...nextSet.metrics[metricIndex],
                    value: draftValue,
                };
                return;
            }

            const nextMetric = { metric_id: metricId, value: draftValue };
            if (splitId) nextMetric.split_id = splitId;
            nextSet.metrics.push(nextMetric);
        });

        return nextSet;
    });
}

function applySingleSetDraft(baseSets, { setIndex, metricId, splitId = null, value }) {
    return baseSets.map((set, currentSetIdx) => {
        if (currentSetIdx !== setIndex) return set;

        const nextSet = {
            ...set,
            metrics: Array.isArray(set.metrics) ? [...set.metrics] : [],
        };
        const metricIndex = nextSet.metrics.findIndex((metric) => (
            resolveMetricId(metric) === metricId
            && (splitId ? resolveSplitId(metric) === splitId : !resolveSplitId(metric))
        ));

        if (metricIndex >= 0) {
            nextSet.metrics[metricIndex] = {
                ...nextSet.metrics[metricIndex],
                value,
            };
            return nextSet;
        }

        const nextMetric = { metric_id: metricId, value };
        if (splitId) nextMetric.split_id = splitId;
        nextSet.metrics.push(nextMetric);
        return nextSet;
    });
}

export default function useMetricDrafts({ exercise, updateExercise }) {
    // Draft text is rendered locally by MetricValueEditor. Keeping this registry
    // in refs preserves drafts for cascade/add/remove operations without making
    // the entire activity card rerender for every keystroke.
    const setMetricDraftsRef = useRef({});
    const singleMetricDraftsRef = useRef({});
    const latestSetsRef = useRef(exercise.sets || []);

    useEffect(() => {
        latestSetsRef.current = exercise.sets || [];
    }, [exercise.sets]);

    const setMetricDraftKey = useCallback((setIndex, metricId, splitId = null) => (
        `${setIndex}:${metricId}:${splitId || ''}`
    ), []);
    const singleMetricDraftKey = useCallback((metricId, splitId = null) => (
        `${metricId}:${splitId || ''}`
    ), []);

    const getMetricValue = useCallback((metricsList, metricId, splitId = null) => {
        const metric = metricsList?.find((item) => (
            resolveMetricId(item) === metricId
            && (splitId ? resolveSplitId(item) === splitId : !resolveSplitId(item))
        ));
        return metric ? metric.value : '';
    }, []);

    const getSetMetricDisplayValue = useCallback((setIndex, metricsList, metricId, splitId = null) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        if (Object.prototype.hasOwnProperty.call(setMetricDraftsRef.current, key)) {
            return setMetricDraftsRef.current[key];
        }
        return getMetricValue(metricsList, metricId, splitId);
    }, [getMetricValue, setMetricDraftKey]);

    const getSingleMetricDisplayValue = useCallback((metricsList, metricId, splitId = null) => {
        const key = singleMetricDraftKey(metricId, splitId);
        if (Object.prototype.hasOwnProperty.call(singleMetricDraftsRef.current, key)) {
            return singleMetricDraftsRef.current[key];
        }
        return getMetricValue(metricsList, metricId, splitId);
    }, [getMetricValue, singleMetricDraftKey]);

    const hasSetMetricDraft = useCallback((setIndex, metricId, splitId = null) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        return Object.prototype.hasOwnProperty.call(setMetricDraftsRef.current, key);
    }, [setMetricDraftKey]);

    const hasSingleMetricDraft = useCallback((metricId, splitId = null) => {
        const key = singleMetricDraftKey(metricId, splitId);
        return Object.prototype.hasOwnProperty.call(singleMetricDraftsRef.current, key);
    }, [singleMetricDraftKey]);

    const handleSetMetricDraftChange = useCallback((setIndex, metricId, value, splitId = null) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        setMetricDraftsRef.current[key] = value;
    }, [setMetricDraftKey]);

    const handleSingleMetricDraftChange = useCallback((metricId, value, splitId = null) => {
        const key = singleMetricDraftKey(metricId, splitId);
        singleMetricDraftsRef.current[key] = value;
    }, [singleMetricDraftKey]);

    const commitSetMetricChange = useCallback((setIndex, metricId, splitId = null, overrideValue = undefined) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        const hasDraft = Object.prototype.hasOwnProperty.call(setMetricDraftsRef.current, key);
        if (!hasDraft && overrideValue === undefined) return;

        const nextValue = overrideValue === undefined ? setMetricDraftsRef.current[key] : overrideValue;
        const nextSets = applySingleSetDraft(latestSetsRef.current, {
            setIndex,
            metricId,
            splitId,
            value: nextValue,
        });
        latestSetsRef.current = nextSets;
        delete setMetricDraftsRef.current[key];
        updateExercise('sets', nextSets);
    }, [setMetricDraftKey, updateExercise]);

    const commitSingleMetricChange = useCallback((metricId, splitId = null, overrideValue = undefined) => {
        const key = singleMetricDraftKey(metricId, splitId);
        const hasDraft = Object.prototype.hasOwnProperty.call(singleMetricDraftsRef.current, key);
        if (!hasDraft && overrideValue === undefined) return;

        const value = overrideValue === undefined ? singleMetricDraftsRef.current[key] : overrideValue;
        const currentMetrics = [...(exercise.metrics || [])];
        const metricIndex = currentMetrics.findIndex((metric) => (
            resolveMetricId(metric) === metricId
            && (splitId ? resolveSplitId(metric) === splitId : !resolveSplitId(metric))
        ));

        if (metricIndex >= 0) {
            currentMetrics[metricIndex] = { ...currentMetrics[metricIndex], value };
        } else {
            const nextMetric = { metric_id: metricId, value };
            if (splitId) nextMetric.split_id = splitId;
            currentMetrics.push(nextMetric);
        }

        delete singleMetricDraftsRef.current[key];
        updateExercise('metrics', currentMetrics);
    }, [exercise.metrics, singleMetricDraftKey, updateExercise]);

    const applyAllSetDrafts = useCallback((baseSets) => (
        applyDraftsToSets(baseSets, setMetricDraftsRef.current)
    ), []);

    const clearSetDrafts = useCallback(() => {
        setMetricDraftsRef.current = {};
    }, []);

    return {
        getMetricValue,
        getSetMetricDisplayValue,
        getSingleMetricDisplayValue,
        hasSetMetricDraft,
        hasSingleMetricDraft,
        handleSetMetricDraftChange,
        handleSingleMetricDraftChange,
        commitSetMetricChange,
        commitSingleMetricChange,
        applyAllSetDrafts,
        clearSetDrafts,
        latestSetsRef,
    };
}
