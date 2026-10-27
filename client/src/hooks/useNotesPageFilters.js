import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { NOTE_CATEGORIES } from '../utils/noteTypes';

const CATEGORY_VALUES = new Set(NOTE_CATEGORIES.map((category) => category.value));
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const csv = (value) => (value ? value.split(',').map((part) => part.trim()).filter(Boolean) : []);

// URL parameter for each filter field. Saved filter ids and the selected heatmap day are part
// of the view, so back/forward and shared links restore exactly what was on screen.
const PARAMS = {
    text: 'q', categories: 'cat', goalId: 'goal', goalName: 'goal_name',
    activityIds: 'act', groupIds: 'grp', pinnedOnly: 'pinned', savedFilterIds: 'saved', day: 'day',
};

export const EMPTY_NOTES_FILTERS = {
    text: '', categories: [], goalId: null, goalName: '', activityIds: [], groupIds: [],
    pinnedOnly: false, savedFilterIds: [], day: null,
};

/** Notes page filter state, kept in the URL. */
export function useNotesPageFilters(timezone) {
    const [searchParams, setSearchParams] = useSearchParams();

    const filters = useMemo(() => ({
        text: searchParams.get(PARAMS.text) || '',
        categories: csv(searchParams.get(PARAMS.categories)).filter((value) => CATEGORY_VALUES.has(value)),
        goalId: searchParams.get(PARAMS.goalId) || null,
        goalName: searchParams.get(PARAMS.goalName) || '',
        activityIds: csv(searchParams.get(PARAMS.activityIds)),
        groupIds: csv(searchParams.get(PARAMS.groupIds)),
        pinnedOnly: searchParams.get(PARAMS.pinnedOnly) === '1',
        savedFilterIds: csv(searchParams.get(PARAMS.savedFilterIds)),
        day: DAY.test(searchParams.get(PARAMS.day) || '') ? searchParams.get(PARAMS.day) : null,
    }), [searchParams]);

    const updateFilters = useCallback((updates) => {
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            Object.entries(updates).forEach(([field, value]) => {
                const key = PARAMS[field];
                if (!key) return;
                const serialized = Array.isArray(value) ? value.join(',')
                    : typeof value === 'boolean' ? (value ? '1' : '')
                        : (value || '');
                if (serialized) next.set(key, serialized);
                else next.delete(key);
            });
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    /** The ad-hoc spec: what a saved filter captures. */
    const spec = useMemo(() => ({
        text: filters.text.trim() || undefined,
        categories: filters.categories.length ? filters.categories : undefined,
        goal_id: filters.goalId || undefined,
        activity_definition_ids: filters.activityIds.length ? filters.activityIds : undefined,
        activity_group_ids: filters.groupIds.length ? filters.groupIds : undefined,
        pinned_only: filters.pinnedOnly || undefined,
    }), [filters]);

    const apiFilters = useMemo(() => ({
        ...spec,
        saved_filter_ids: filters.savedFilterIds,
        day: filters.day || undefined,
        timezone: timezone || 'UTC',
    }), [spec, filters.savedFilterIds, filters.day, timezone]);

    const hasAdHocFilters = Object.values(spec).some((value) => value !== undefined);
    const hasActiveFilters = hasAdHocFilters || filters.savedFilterIds.length > 0 || Boolean(filters.day);

    // One URL update: consecutive setSearchParams calls in a handler would overwrite each other.
    const clearAdHoc = useCallback((alsoUpdate = {}) => updateFilters({
        text: '', categories: [], goalId: null, goalName: '', activityIds: [], groupIds: [], pinnedOnly: false,
        ...alsoUpdate,
    }), [updateFilters]);
    const clearAll = useCallback(() => updateFilters(EMPTY_NOTES_FILTERS), [updateFilters]);

    return { filters, spec, apiFilters, updateFilters, hasAdHocFilters, hasActiveFilters, clearAdHoc, clearAll };
}
