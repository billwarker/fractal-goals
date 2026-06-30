/**
 * Pure metric/duration formatting + parsing helpers for session activity items.
 * Extracted verbatim from SessionActivityItem.jsx (audit P1-5) — no behavior
 * change. These are stateless and safe to unit-test in isolation.
 */

export function formatDuration(seconds) {
    if (seconds == null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function parseMMSS(value) {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d+):(\d{1,2})$/);
    if (!match) return null;
    const mins = Number(match[1]);
    const secs = Number(match[2]);
    if (!Number.isInteger(mins) || !Number.isInteger(secs) || secs > 59) return null;
    const totalSeconds = mins * 60 + secs;
    return totalSeconds > 0 ? totalSeconds : null;
}

export function formatMetricNumber(value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    const numericValue = Number(value);
    if (Number.isInteger(numericValue)) {
        return String(numericValue);
    }
    return numericValue.toFixed(1).replace(/\.0$/, '');
}

export function formatDurationMetricValue(value) {
    if (value == null || value === '') return '';
    const rawValue = String(value);
    if (rawValue.includes(':')) return rawValue;
    const numericValue = Number(rawValue);
    if (Number.isNaN(numericValue)) return rawValue;
    const totalSeconds = Math.max(0, Math.round(numericValue));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function parseDurationMetricInput(value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return '';
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return Math.max(0, Math.round(Number(trimmed)));
    }
    const match = trimmed.match(/^(\d+):(\d{1,2})$/);
    if (!match) return null;
    const mins = Number(match[1]);
    const secs = Number(match[2]);
    if (!Number.isInteger(mins) || !Number.isInteger(secs) || secs > 59) return null;
    return (mins * 60) + secs;
}

export function clampMetricValue(metricDef, value) {
    if (value === '' || value == null) return value;
    let nextValue = Number(value);
    if (Number.isNaN(nextValue)) return value;
    if (metricDef?.min_value != null) {
        nextValue = Math.max(Number(metricDef.min_value), nextValue);
    }
    if (metricDef?.max_value != null) {
        nextValue = Math.min(Number(metricDef.max_value), nextValue);
    }
    return nextValue;
}

export function normalizeMetricValueForStorage(metricDef, value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return '';

    let normalized;
    if (metricDef?.input_type === 'duration') {
        normalized = parseDurationMetricInput(trimmed);
        if (normalized == null) return trimmed;
    } else {
        const numericValue = Number(trimmed);
        if (Number.isNaN(numericValue)) return trimmed;
        normalized = metricDef?.input_type === 'integer'
            ? Math.trunc(numericValue)
            : numericValue;
    }

    const clamped = clampMetricValue(metricDef, normalized);
    return String(clamped);
}

export function getMetricDefaultStorageValue(metricDef) {
    if (metricDef?.default_value == null || metricDef.default_value === '') return '';
    return normalizeMetricValueForStorage(metricDef, metricDef.default_value);
}

export function formatMetricValueForInput(metricDef, value) {
    if (value == null || value === '') return '';
    if (metricDef?.input_type === 'duration') {
        return formatDurationMetricValue(value);
    }
    return String(value);
}

export function formatAllowedMetricValueLabel(metricDef, value) {
    if (metricDef?.input_type === 'duration') {
        return formatDurationMetricValue(value);
    }
    return String(value);
}

export function getAllowedMetricValues(metricDef) {
    return Array.isArray(metricDef?.predefined_values)
        ? metricDef.predefined_values
            .filter((value) => value !== '' && value != null)
            .map((value) => normalizeMetricValueForStorage(metricDef, value))
        : [];
}

export function formatAllowedMetricValues(metricDef) {
    const values = getAllowedMetricValues(metricDef);
    if (values.length === 0) return null;
    return values.map((value) => formatAllowedMetricValueLabel(metricDef, value)).join(', ');
}

export function getMetricInputProps(metricDef) {
    if (metricDef?.input_type === 'duration') {
        return {
            type: 'text',
            inputMode: 'numeric',
            placeholder: 'MM:SS',
        };
    }

    return {
        type: 'number',
        step: metricDef?.input_type === 'integer' ? 1 : 'any',
        min: metricDef?.min_value ?? undefined,
        max: metricDef?.max_value ?? undefined,
    };
}

export function formatInlineProgressValue(comparison, displayMode = 'percent') {
    if (!comparison) return null;

    if (displayMode === 'absolute') {
        if (comparison.delta == null) return null;
        const delta = Number(comparison.delta);
        const magnitude = formatMetricNumber(Math.abs(delta));
        if (delta > 0) return `+${magnitude}`;
        if (delta < 0) return `-${magnitude}`;
        return '0';
    }

    if (comparison.pct_change != null) {
        const magnitude = formatMetricNumber(Math.abs(comparison.pct_change));
        if (comparison.improved) return `▲${magnitude}%`;
        if (comparison.regressed) return `▼${magnitude}%`;
        return '0%';
    }

    if (comparison.delta == null) return null;
    const delta = Number(comparison.delta);
    const magnitude = formatMetricNumber(Math.abs(delta));
    if (delta > 0) return `+${magnitude}`;
    if (delta < 0) return `-${magnitude}`;
    return '0';
}


export function getBestSetIndexes(sets, anchorMetricId, higherIsBetter, getMetricValue) {
    if (!Array.isArray(sets) || !anchorMetricId) {
        return [];
    }

    let bestValue = null;
    const bestIndexes = [];

    sets.forEach((set, setIndex) => {
        const rawValue = getMetricValue(set.metrics, anchorMetricId);
        if (rawValue == null || String(rawValue).trim() === '') {
            return;
        }

        const numericValue = Number(rawValue);
        if (Number.isNaN(numericValue)) {
            return;
        }

        if (
            bestValue == null
            || (higherIsBetter && numericValue > bestValue)
            || (!higherIsBetter && numericValue < bestValue)
        ) {
            bestValue = numericValue;
            bestIndexes.length = 0;
            bestIndexes.push(setIndex);
            return;
        }

        if (numericValue === bestValue) {
            bestIndexes.push(setIndex);
        }
    });

    return bestIndexes;
}

/**
 * Build a blank set for an activity definition, seeding metric defaults.
 * (Splits expand to metric×split rows.)
 */
export function buildEmptySet(definition, hasSplits) {
    if (!Array.isArray(definition?.metric_definitions)) {
        return { instance_id: crypto.randomUUID(), completed: false, metrics: [] };
    }

    const metrics = hasSplits && Array.isArray(definition?.split_definitions)
        ? definition.split_definitions.flatMap((split) => definition.metric_definitions.map((metric) => ({
            metric_id: metric.id,
            split_id: split.id,
            value: getMetricDefaultStorageValue(metric),
        })))
        : definition.metric_definitions.map((metric) => ({
            metric_id: metric.id,
            value: getMetricDefaultStorageValue(metric),
        }));

    return {
        instance_id: crypto.randomUUID(),
        completed: false,
        metrics,
    };
}
