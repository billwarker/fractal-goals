import { useCallback, useState } from 'react';

import { normalizeGlobalFilters } from './analyticsGlobalFilters';
import { getDefaultGlobalFilters } from './dashboardState';

/**
 * The Analytics page's global scope: the time range (a reversed range is swapped round) and the
 * global filters, with handlers to change, reset, or clear both.
 */
export default function useAnalyticsGlobalScope() {
    const [globalDateRange, setGlobalDateRange] = useState({ start: null, end: null });
    const [globalFilters, setGlobalFilters] = useState(getDefaultGlobalFilters());

    const handleDateRangeChange = useCallback((nextRange) => {
        const start = nextRange?.start || null;
        const end = nextRange?.end || null;
        setGlobalDateRange(start && end && start > end ? { start: end, end: start } : { start, end });
    }, []);
    const handleGlobalFiltersChange = useCallback((nextFilters) => {
        setGlobalFilters(normalizeGlobalFilters(nextFilters));
    }, []);
    const handleResetGlobalFilters = useCallback(() => {
        setGlobalFilters(getDefaultGlobalFilters());
    }, []);

    return {
        globalDateRange, setGlobalDateRange, globalFilters, setGlobalFilters,
        handleDateRangeChange, handleGlobalFiltersChange, handleResetGlobalFilters,
    };
}
