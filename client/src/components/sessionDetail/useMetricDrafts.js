import { useCallback, useEffect, useRef, useState } from 'react';

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
    const [setMetricDrafts, setSetMetricDrafts] = useState({});
    const [singleMetricDrafts, setSingleMetricDrafts] = useState({});
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
        if (Object.prototype.hasOwnProperty.call(setMetricDrafts, key)) {
            return setMetricDrafts[key];
        }
        return getMetricValue(metricsList, metricId, splitId);
    }, [getMetricValue, setMetricDraftKey, setMetricDrafts]);

    const getSingleMetricDisplayValue = useCallback((metricsList, metricId, splitId = null) => {
        const key = singleMetricDraftKey(metricId, splitId);
        if (Object.prototype.hasOwnProperty.call(singleMetricDrafts, key)) {
            return singleMetricDrafts[key];
        }
        return getMetricValue(metricsList, metricId, splitId);
    }, [getMetricValue, singleMetricDraftKey, singleMetricDrafts]);

    const hasSetMetricDraft = useCallback((setIndex, metricId, splitId = null) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        return Object.prototype.hasOwnProperty.call(setMetricDrafts, key);
    }, [setMetricDraftKey, setMetricDrafts]);

    const hasSingleMetricDraft = useCallback((metricId, splitId = null) => {
        const key = singleMetricDraftKey(metricId, splitId);
        return Object.prototype.hasOwnProperty.call(singleMetricDrafts, key);
    }, [singleMetricDraftKey, singleMetricDrafts]);

    const handleSetMetricDraftChange = useCallback((setIndex, metricId, value, splitId = null) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        setSetMetricDrafts((prev) => ({ ...prev, [key]: value }));
    }, [setMetricDraftKey]);

    const handleSingleMetricDraftChange = useCallback((metricId, value, splitId = null) => {
        const key = singleMetricDraftKey(metricId, splitId);
        setSingleMetricDrafts((prev) => ({ ...prev, [key]: value }));
    }, [singleMetricDraftKey]);

    const commitSetMetricChange = useCallback((setIndex, metricId, splitId = null, overrideValue = undefined) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        const hasDraft = Object.prototype.hasOwnProperty.call(setMetricDrafts, key);
        if (!hasDraft && overrideValue === undefined) return;

        const nextValue = overrideValue === undefined ? setMetricDrafts[key] : overrideValue;
        const nextSets = applySingleSetDraft(latestSetsRef.current, {
            setIndex,
            metricId,
            splitId,
            value: nextValue,
        });
        latestSetsRef.current = nextSets;
        updateExercise('sets', nextSets);
        setSetMetricDrafts((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, [setMetricDraftKey, setMetricDrafts, updateExercise]);

    const commitSingleMetricChange = useCallback((metricId, splitId = null, overrideValue = undefined) => {
        const key = singleMetricDraftKey(metricId, splitId);
        const hasDraft = Object.prototype.hasOwnProperty.call(singleMetricDrafts, key);
        if (!hasDraft && overrideValue === undefined) return;

        const value = overrideValue === undefined ? singleMetricDrafts[key] : overrideValue;
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

        updateExercise('metrics', currentMetrics);
        setSingleMetricDrafts((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, [exercise.metrics, singleMetricDraftKey, singleMetricDrafts, updateExercise]);

    const applyAllSetDrafts = useCallback((baseSets) => (
        applyDraftsToSets(baseSets, setMetricDrafts)
    ), [setMetricDrafts]);

    const clearSetDrafts = useCallback(() => {
        setSetMetricDrafts({});
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
