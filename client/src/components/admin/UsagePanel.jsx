import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { adminApi } from '../../utils/api';
import { presetToRange } from '../../utils/dateRange';
import DateRangeFilter from '../common/DateRangeFilter';
import LoadingState from '../common/LoadingState';
import ViewToggleTabs from '../common/ViewToggleTabs';
import AcquisitionView from './AcquisitionView';
import EngagementView from './EngagementView';
import EventsBreakdownTable from './EventsBreakdownTable';
import UsageSummaryView from './UsageSummaryView';
import UsageSystemView from './UsageSystemView';
import UsageUsersView from './UsageUsersView';
import styles from '../../pages/Admin.module.css';
import viewStyles from './UsageViews.module.css';

const USAGE_PRESETS = ['7d', '30d', '90d', '6m', '1y', 'custom'];

export const OVERVIEW_VIEWS = [
    { value: 'summary', label: 'Summary' },
    { value: 'acquisition', label: 'Acquisition' },
    { value: 'engagement', label: 'Engagement' },
    { value: 'users', label: 'Users' },
    { value: 'events', label: 'Events' },
    { value: 'system', label: 'System' },
];
const VIEW_PARAM = 'view';

const GROWTH_VIEWS = new Set(['acquisition', 'engagement']);

function OverviewView({ view, data, accountCards, onOpen }) {
    if (GROWTH_VIEWS.has(view) && !data.growth) return <p className={viewStyles.note}>No acquisition or engagement data yet.</p>;
    if (view === 'acquisition') {
        return (
            <AcquisitionView
                growth={data.growth}
                windowStart={data.window?.start}
                windowEnd={data.window?.end}
                webLiveSince={data.live_since?.web_events}
            />
        );
    }
    if (view === 'engagement') return <EngagementView data={data} />;
    if (view === 'users') return <UsageUsersView perUser={data.per_user || []} />;
    if (view === 'events') {
        return (
            <div className={viewStyles.view}>
                <EventsBreakdownTable events={data.events_breakdown || []} />
            </div>
        );
    }
    if (view === 'system') return <UsageSystemView data={data} />;
    return <UsageSummaryView data={data} accountCards={accountCards} onOpen={onOpen} />;
}

/**
 * Admin → Overview: one usage query for the selected range, reviewed one area at a time.
 * The area is kept in `?view=` so a reload or a shared link reopens it.
 */
export default function UsagePanel({ enabled, accountCards = [] }) {
    const [dateRange, setDateRange] = useState(() => presetToRange('30d'));
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get(VIEW_PARAM);
    const view = OVERVIEW_VIEWS.some((item) => item.value === requested) ? requested : 'summary';

    const openView = (next) => setSearchParams((params) => {
        const updated = new URLSearchParams(params);
        if (next === 'summary') updated.delete(VIEW_PARAM);
        else updated.set(VIEW_PARAM, next);
        return updated;
    }, { replace: true });

    const usageQuery = useQuery({
        queryKey: ['admin', 'usage', dateRange.start, dateRange.end],
        queryFn: async () => (await adminApi.getUsage({
            ...(dateRange.start ? { start: dateRange.start } : {}),
            ...(dateRange.end ? { end: dateRange.end } : {}),
        })).data,
        enabled,
    });
    const data = usageQuery.data;

    return (
        <section className={styles.section}>
            <div className={viewStyles.view}>
                <DateRangeFilter
                    value={dateRange}
                    onChange={setDateRange}
                    presets={USAGE_PRESETS}
                    classNames={{
                        chipGroup: styles.betaStatusFilters,
                        chipActive: styles.activeTab,
                    }}
                />
                <ViewToggleTabs
                    items={OVERVIEW_VIEWS}
                    value={view}
                    onChange={openView}
                    ariaLabel="Overview sections"
                    className={viewStyles.overviewTabs}
                />

                {usageQuery.isLoading && <LoadingState label="Loading usage data…" />}
                {usageQuery.isError && <p>Failed to load usage data.</p>}

                {data && (
                    <div role="tabpanel" aria-label={OVERVIEW_VIEWS.find((item) => item.value === view).label}>
                        <OverviewView view={view} data={data} accountCards={accountCards} onOpen={openView} />
                    </div>
                )}
            </div>
        </section>
    );
}
