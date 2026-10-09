import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

function localDate(timezone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

export function useGoalActivityHeatmap(rootId, goalId, { includeChildren = true, timezone = 'UTC', date = null, enabled = true } = {}) {
    const [calendarDate, setCalendarDate] = useState(() => localDate(timezone));
    useEffect(() => {
        if (date || !rootId || !goalId || !enabled) return undefined;
        // Keep an open calendar current across local midnight without polling its history.
        const timer = window.setInterval(() => setCalendarDate(localDate(timezone)), 60_000);
        return () => window.clearInterval(timer);
    }, [date, rootId, goalId, timezone, enabled]);
    return useQuery({
        queryKey: queryKeys.goalActivityHeatmap(rootId, goalId, includeChildren, timezone, date, date ? null : calendarDate),
        enabled: Boolean(rootId && goalId && enabled),
        queryFn: async () => {
            const response = await fractalApi.getGoalActivityHeatmap(rootId, goalId, { includeChildren, timezone, date });
            return response.data;
        },
        staleTime: 60_000,
    });
}
