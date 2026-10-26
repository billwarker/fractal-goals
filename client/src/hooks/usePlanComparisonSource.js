import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { loggedSessionPlanSections } from '../utils/loggedSessionPlan';
import { useProgramDayPlans } from './useProgramSessionPlans';
import { sessionDetailQueryOptions } from './useSessionQueries';

/**
 * What the Days tab's left column shows for each template on `date`, in plan shape, so the right
 * column can compare with it and copy it: `templateId -> { date, kind, sections, isLoading }`.
 * `kind` is `plan` (a stored or template plan), `logged` (what the first credited session
 * logged, as its card shows), or `empty` (a past date with nothing logged). Reads the same
 * queries as the left column's cards, so nothing is fetched twice.
 */
export default function usePlanComparisonSource({
    rootId,
    programId,
    dayId,
    date,
    timezone = 'UTC',
    isEmptyPast = false,
}) {
    const plansQuery = useProgramDayPlans(rootId, programId, dayId, date && !isEmptyPast ? date : null, timezone);
    // Older payloads have no is_loaded: every template stays open, as in the column.
    const entries = useMemo(
        () => (plansQuery.data?.plans || []).filter((entry) => entry.is_loaded ?? true),
        [plansQuery.data],
    );
    const sessionIds = entries.map((entry) => entry.logged_sessions?.[0]?.id).filter(Boolean);
    const sessionQueries = useQueries({
        queries: sessionIds.map((sessionId) => sessionDetailQueryOptions(rootId, sessionId)),
    });
    const sessionsKey = sessionQueries.map((query) => query.dataUpdatedAt).join(',');

    return useMemo(() => {
        const byTemplate = new Map();
        if (!date) return byTemplate;
        if (isEmptyPast) {
            // The left column shows "No sessions logged"; every template has nothing to copy.
            return { get: () => ({ date, kind: 'empty', sections: [], isLoading: false }) };
        }
        const sessionById = new Map(sessionQueries.map((query, index) => [sessionIds[index], query]));
        entries.forEach((entry) => {
            const loggedId = entry.logged_sessions?.[0]?.id;
            if (loggedId) {
                const query = sessionById.get(loggedId);
                byTemplate.set(entry.template.id, {
                    date,
                    kind: 'logged',
                    sections: query?.data ? loggedSessionPlanSections(query.data) : [],
                    isLoading: !query?.data,
                });
                return;
            }
            byTemplate.set(entry.template.id, { date, kind: 'plan', sections: entry.sections || [], isLoading: false });
        });
        return byTemplate;
        // sessionQueries changes identity every render; sessionsKey tracks their data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, entries, isEmptyPast, sessionsKey]);
}
