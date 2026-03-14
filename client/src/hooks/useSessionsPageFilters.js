import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getISOYMDInTimezone } from '../utils/dateUtils';

export const SESSION_RANGE_PRESETS = [
    { value: '7d', label: '7D', days: 7 },
    { value: '30d', label: '30D', days: 30 },
    { value: '90d', label: '90D', days: 90 },
    { value: '6m', label: '6M', months: 6 },
    { value: '1y', label: '1Y', years: 1 },
    { value: 'all', label: 'All' },
    { value: 'custom', label: 'Custom' },
];

const SESSION_HEATMAP_MODES = ['count', 'duration'];
const SESSION_DURATION_OPERATORS = ['gt', 'lt'];

const DEFAULT_FILTERS = {
    completed: 'all',
    sortBy: 'session_start',
    sortOrder: 'desc',
    rangePreset: '90d',
    rangeStart: '',
    rangeEnd: '',
    heatmapMode: 'count',
    durationOperator: 'gt',
    durationMinutes: '',
    activityIds: [],
    goalIds: [],
};

function parseCsvParam(value) {
    if (!value) return [];
    return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function toUtcDate(dateString) {
    return new Date(`${dateString}T00:00:00Z`);
}

function formatUtcDate(dateValue) {
    return dateValue.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
    const nextDate = toUtcDate(dateString);
    nextDate.setUTCDate(nextDate.getUTCDate() + days);
    return formatUtcDate(nextDate);
}

function addMonths(dateString, months) {
    const nextDate = toUtcDate(dateString);
    nextDate.setUTCMonth(nextDate.getUTCMonth() + months);
    return formatUtcDate(nextDate);
}

function addYears(dateString, years) {
    const nextDate = toUtcDate(dateString);
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + years);
    return formatUtcDate(nextDate);
}

function getPresetRange(preset, today) {
    const config = SESSION_RANGE_PRESETS.find((item) => item.value === preset);
    if (!config || preset === 'all' || preset === 'custom') {
        return { rangeStart: '', rangeEnd: preset === 'all' ? '' : today };
    }
    if (config.days) {
        return {
            rangeStart: addDays(today, -(config.days - 1)),
            rangeEnd: today,
        };
    }
    if (config.months) {
        return {
            rangeStart: addMonths(today, -config.months),
            rangeEnd: today,
        };
    }
    if (config.years) {
        return {
            rangeStart: addYears(today, -config.years),
            rangeEnd: today,
        };
    }
    return { rangeStart: '', rangeEnd: today };
}

export function useSessionsPageFilters(timezone) {
    const [searchParams, setSearchParams] = useSearchParams();

    const filters = useMemo(() => {
        const today = getISOYMDInTimezone(new Date(), timezone || 'UTC');
        const completed = searchParams.get('completed') || DEFAULT_FILTERS.completed;
        const sortBy = searchParams.get('sort_by') || DEFAULT_FILTERS.sortBy;
        const sortOrder = searchParams.get('sort_order') || DEFAULT_FILTERS.sortOrder;
        const requestedPreset = searchParams.get('range_preset') || DEFAULT_FILTERS.rangePreset;
        const rangePreset = SESSION_RANGE_PRESETS.some((item) => item.value === requestedPreset)
            ? requestedPreset
            : DEFAULT_FILTERS.rangePreset;
        const requestedHeatmapMode = searchParams.get('heatmap_mode') || DEFAULT_FILTERS.heatmapMode;
        const heatmapMode = SESSION_HEATMAP_MODES.includes(requestedHeatmapMode)
            ? requestedHeatmapMode
            : DEFAULT_FILTERS.heatmapMode;
        const requestedDurationOperator = searchParams.get('duration_operator') || DEFAULT_FILTERS.durationOperator;
        const durationOperator = SESSION_DURATION_OPERATORS.includes(requestedDurationOperator)
            ? requestedDurationOperator
            : DEFAULT_FILTERS.durationOperator;
        const durationMinutes = searchParams.get('duration_minutes') || DEFAULT_FILTERS.durationMinutes;
        const activityIds = parseCsvParam(searchParams.get('activity_ids'));
        const goalIds = parseCsvParam(searchParams.get('goal_ids'));

        let rangeStart = searchParams.get('range_start') || '';
        let rangeEnd = searchParams.get('range_end') || '';

        if (rangePreset === 'custom') {
            rangeEnd = rangeEnd || today;
            rangeStart = rangeStart || rangeEnd;
        } else if (rangePreset !== 'all') {
            const presetRange = getPresetRange(rangePreset, today);
            rangeStart = presetRange.rangeStart;
            rangeEnd = presetRange.rangeEnd;
        } else {
            rangeStart = '';
            rangeEnd = '';
        }

        return {
            completed,
            sortBy,
            sortOrder,
            rangePreset,
            rangeStart,
            rangeEnd,
            heatmapMode,
            durationOperator,
            durationMinutes,
            activityIds,
            goalIds,
        };
    }, [searchParams, timezone]);

    const apiFilters = useMemo(() => ({
        completed: filters.completed,
        sort_by: filters.sortBy,
        sort_order: filters.sortOrder,
        range_start: filters.rangeStart || undefined,
        range_end: filters.rangeEnd || undefined,
        duration_operator: filters.durationMinutes ? filters.durationOperator : undefined,
        duration_minutes: filters.durationMinutes || undefined,
        timezone: timezone || 'UTC',
        activity_ids: filters.activityIds,
        goal_ids: filters.goalIds,
    }), [filters, timezone]);

    const heatmapApiFilters = useMemo(() => ({
        ...apiFilters,
        heatmap_metric: filters.heatmapMode,
    }), [apiFilters, filters.heatmapMode]);

    const updateFilters = useCallback((updates) => {
        const nextFilters = {
            ...filters,
            ...updates,
        };

        if (updates.rangeStart !== undefined || updates.rangeEnd !== undefined) {
            nextFilters.rangePreset = 'custom';
        }

        const nextParams = new URLSearchParams(searchParams);

        if (nextFilters.completed !== DEFAULT_FILTERS.completed) {
            nextParams.set('completed', nextFilters.completed);
        } else {
            nextParams.delete('completed');
        }

        if (nextFilters.sortBy !== DEFAULT_FILTERS.sortBy) {
            nextParams.set('sort_by', nextFilters.sortBy);
        } else {
            nextParams.delete('sort_by');
        }

        if (nextFilters.sortOrder !== DEFAULT_FILTERS.sortOrder) {
            nextParams.set('sort_order', nextFilters.sortOrder);
        } else {
            nextParams.delete('sort_order');
        }

        if (nextFilters.heatmapMode !== DEFAULT_FILTERS.heatmapMode) {
            nextParams.set('heatmap_mode', nextFilters.heatmapMode);
        } else {
            nextParams.delete('heatmap_mode');
        }

        if (nextFilters.rangePreset !== DEFAULT_FILTERS.rangePreset) {
            nextParams.set('range_preset', nextFilters.rangePreset);
        } else {
            nextParams.delete('range_preset');
        }

        if (nextFilters.rangePreset === 'custom') {
            if (nextFilters.rangeStart) {
                nextParams.set('range_start', nextFilters.rangeStart);
            } else {
                nextParams.delete('range_start');
            }
            if (nextFilters.rangeEnd) {
                nextParams.set('range_end', nextFilters.rangeEnd);
            } else {
                nextParams.delete('range_end');
            }
        } else {
            nextParams.delete('range_start');
            nextParams.delete('range_end');
        }

        if (nextFilters.durationOperator !== DEFAULT_FILTERS.durationOperator || nextFilters.durationMinutes) {
            nextParams.set('duration_operator', nextFilters.durationOperator);
        } else {
            nextParams.delete('duration_operator');
        }

        if (nextFilters.durationMinutes) {
            nextParams.set('duration_minutes', nextFilters.durationMinutes);
        } else {
            nextParams.delete('duration_minutes');
        }

        if (nextFilters.activityIds.length > 0) {
            nextParams.set('activity_ids', [...nextFilters.activityIds].sort().join(','));
        } else {
            nextParams.delete('activity_ids');
        }

        if (nextFilters.goalIds.length > 0) {
            nextParams.set('goal_ids', [...nextFilters.goalIds].sort().join(','));
        } else {
            nextParams.delete('goal_ids');
        }

        setSearchParams(nextParams, { replace: true });
    }, [filters, searchParams, setSearchParams]);

    const resetFilters = useCallback(() => {
        setSearchParams(new URLSearchParams(), { replace: true });
    }, [setSearchParams]);

    const hasActiveFilters = useMemo(() => (
        filters.completed !== DEFAULT_FILTERS.completed
        || filters.sortBy !== DEFAULT_FILTERS.sortBy
        || filters.sortOrder !== DEFAULT_FILTERS.sortOrder
        || filters.rangePreset !== DEFAULT_FILTERS.rangePreset
        || filters.durationMinutes !== DEFAULT_FILTERS.durationMinutes
        || filters.activityIds.length > 0
        || filters.goalIds.length > 0
    ), [filters]);

    return {
        filters,
        apiFilters,
        heatmapApiFilters,
        hasActiveFilters,
        updateFilters,
        resetFilters,
    };
}

export default useSessionsPageFilters;
