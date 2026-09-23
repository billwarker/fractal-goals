import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import { queryKeys } from './queryKeys';

/** Periods overlapping a visible range, used when no program read model supplies them. */
export function useCalendarPeriods(rootId, range, { enabled = true } = {}) {
    const start = range?.start || null;
    const end = range?.end || null;
    return useQuery({
        queryKey: queryKeys.calendarPeriods(rootId, start, end),
        queryFn: async () => (await fractalApi.getCalendarPeriods(rootId, { start, end })).data,
        enabled: Boolean(enabled && rootId && start && end),
        staleTime: 60 * 1000,
    });
}

function invalidatePeriodDependents(queryClient, rootId) {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.calendarPeriodsRoot(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programDayReadModelRoot(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programMetricsRoot(rootId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.programDayOptions(rootId) }),
    ]);
}

export function useCalendarPeriodMutations(rootId) {
    const queryClient = useQueryClient();
    const onSuccess = () => invalidatePeriodDependents(queryClient, rootId);
    const save = useMutation({
        mutationFn: ({ id, ...data }) => (id
            ? fractalApi.updateCalendarPeriod(rootId, id, data)
            : fractalApi.createCalendarPeriod(rootId, data)),
        onSuccess,
    });
    const remove = useMutation({
        mutationFn: (id) => fractalApi.deleteCalendarPeriod(rootId, id),
        onSuccess,
    });
    return { save, remove };
}

/**
 * Owns the calendar event (time-off period) editor: which period (or new draft) is open, saving, and
 * removal. Pages render ``<CalendarPeriodModal {...editor.modalProps} />``.
 */
export function useCalendarPeriodEditor(rootId) {
    const [draft, setDraft] = useState(null);
    const { save, remove } = useCalendarPeriodMutations(rootId);

    const openCreate = useCallback((dates = []) => {
        const sorted = [...dates].sort();
        setDraft({
            name: '',
            kind: 'vacation',
            start_date: sorted[0] || '',
            end_date: sorted[sorted.length - 1] || '',
            protects_streaks: true,
            notes: '',
            spansGaps: sorted.length > 1 && !isContiguous(sorted),
        });
    }, []);
    const openEdit = useCallback((period) => setDraft({ ...period, notes: period.notes || '' }), []);
    const close = useCallback(() => setDraft(null), []);

    const submit = useCallback(async (values) => {
        try {
            await save.mutateAsync({ ...values, notes: values.notes?.trim() ? values.notes.trim() : null });
            notify.success(values.id ? 'Event updated' : 'Event added');
            setDraft(null);
            return true;
        } catch (error) {
            notify.error(error.response?.data?.error || 'Event could not be saved');
            return false;
        }
    }, [save]);

    const removePeriod = useCallback(async (period) => {
        try {
            await remove.mutateAsync(period.id);
            notify.success('Event removed');
            setDraft(null);
            return true;
        } catch (error) {
            notify.error(error.response?.data?.error || 'Event could not be removed');
            return false;
        }
    }, [remove]);

    const modalProps = useMemo(() => ({
        isOpen: Boolean(draft),
        period: draft,
        pending: save.isPending || remove.isPending,
        onClose: close,
        onSubmit: submit,
        onDelete: removePeriod,
    }), [close, draft, remove.isPending, removePeriod, save.isPending, submit]);

    return { openCreate, openEdit, removePeriod, modalProps };
}

function isContiguous(sortedDates) {
    return sortedDates.every((value, index) => {
        if (index === 0) return true;
        const previous = new Date(`${sortedDates[index - 1]}T00:00:00Z`);
        const current = new Date(`${value}T00:00:00Z`);
        return current - previous === 24 * 60 * 60 * 1000;
    });
}
