import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Button from '../components/atoms/Button';
import HeaderButton from '../components/layout/HeaderButton';
import PageHeader from '../components/layout/PageHeader';
import { useChartThemeDefaults } from '../components/analytics/ChartJSWrapper';
import EmptyState from '../components/common/EmptyState';
import LoadingState from '../components/common/LoadingState';
import ViewToggleTabs from '../components/common/ViewToggleTabs';
import LogsActivityChart, { domainColor } from '../components/logs/LogsActivityChart';
import LogsList from '../components/logs/LogsList';
import {
    LOG_DOMAIN_KEYS,
    LOG_RANGE_OPTIONS,
    MAX_CHART_DAYS,
    resolveLogRange,
} from '../components/logs/logsRange';
import styles from '../components/logs/Logs.module.css';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { useTimezone } from '../contexts/TimezoneContext';
import { useLogActivity, useLogsData } from '../hooks/useLogsData';
import { getDurationDaysInclusive, getISOYMDInTimezone } from '../utils/dateUtils';
import notify from '../utils/notify';

const PAGE_SIZE = 50;

/**
 * Application event history (admin-only): activity over time, then the events themselves.
 */
function Logs() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const { timezone } = useTimezone();
    const { user } = useAuth();
    const chartTheme = useChartThemeDefaults();
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    const [page, setPage] = useState(1);
    const [eventType, setEventType] = useState('all');
    const [range, setRange] = useState('30');
    const [custom, setCustom] = useState({ startDate: '', endDate: '' });

    useEffect(() => {
        if (!rootId) navigate('/');
    }, [rootId, navigate]);

    const today = getISOYMDInTimezone(new Date(), timezone);
    const { startDate, endDate } = resolveLogRange(range, today, custom);
    // The chart needs a bounded range; an open-ended custom range charts its last 30 days.
    const chartDays = startDate && endDate ? getDurationDaysInclusive(startDate, endDate) : 0;
    const chartTooLong = chartDays > MAX_CHART_DAYS;

    const {
        logs, total, eventTypes, isLoading, isFetching, refetch, clearLogs, isClearing,
    } = useLogsData(rootId, { page, pageSize: PAGE_SIZE, eventType, startDate, endDate, timezone });
    const { activity, isLoading: activityLoading } = useLogActivity(rootId, {
        startDate, endDate, timezone, eventType, enabled: !chartTooLong,
    });

    const domainColors = useMemo(
        () => Object.fromEntries(LOG_DOMAIN_KEYS.map((key) => [key, domainColor(chartTheme, key)])),
        [chartTheme],
    );
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const changeFilters = (update) => {
        update();
        setPage(1);
    };

    const showDay = useCallback((day) => {
        setRange('custom');
        setCustom({ startDate: day, endDate: day });
        setPage(1);
    }, []);

    const handleClearLogs = async () => {
        if (isClearing || !user?.is_admin) return;
        setShowClearConfirm(false);
        try {
            await clearLogs();
            setPage(1);
            notify.success('Logs cleared');
        } catch (error) {
            notify.error(`Failed to clear logs: ${error.response?.data?.error || error.message}`);
        }
    };

    return (
        <div className={styles.page}>
            <PageHeader
                title="Logs"
                subtitle={isLoading ? 'Loading events…' : `${total.toLocaleString()} event${total === 1 ? '' : 's'}`}
                actions={(
                    <>
                        <HeaderButton variant="secondary" disabled={isClearing || isFetching} onClick={() => refetch()}>
                            {isFetching && !isLoading ? 'Refreshing…' : 'Refresh'}
                        </HeaderButton>
                        {user?.is_admin && (
                            <HeaderButton variant="danger" disabled={isClearing} onClick={() => setShowClearConfirm(true)}>
                                {isClearing ? 'Clearing…' : 'Clear logs'}
                            </HeaderButton>
                        )}
                    </>
                )}
            />

            <div className={styles.body}>
            <div className={styles.filters}>
                <ViewToggleTabs
                    items={LOG_RANGE_OPTIONS}
                    value={range}
                    onChange={(value) => changeFilters(() => {
                        setRange(value);
                        if (value === 'custom' && !custom.startDate && !custom.endDate) setCustom({ startDate, endDate });
                    })}
                    ariaLabel="Date range"
                    size="compact"
                    semantics="radio"
                />
                {range === 'custom' && (
                    <div className={styles.dates}>
                        <label className={styles.field}>
                            <span>From</span>
                            <input
                                type="date"
                                value={custom.startDate}
                                max={custom.endDate || undefined}
                                onChange={(event) => changeFilters(() => setCustom((current) => ({ ...current, startDate: event.target.value })))}
                            />
                        </label>
                        <label className={styles.field}>
                            <span>To</span>
                            <input
                                type="date"
                                value={custom.endDate}
                                min={custom.startDate || undefined}
                                onChange={(event) => changeFilters(() => setCustom((current) => ({ ...current, endDate: event.target.value })))}
                            />
                        </label>
                    </div>
                )}
                <label className={`${styles.field} ${styles.typeField}`}>
                    <span>Event</span>
                    <select value={eventType} onChange={(event) => changeFilters(() => setEventType(event.target.value))}>
                        <option value="all">All events</option>
                        {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                </label>
            </div>

            <section className={styles.panel} aria-label="Activity over time">
                {chartTooLong ? (
                    <p className={styles.chartNote}>The chart covers up to a year. Shorten the range to see activity by day.</p>
                ) : activityLoading && !activity ? (
                    <LoadingState label="Loading activity…" className={styles.chartLoading} />
                ) : activity && activity.total === 0 ? (
                    <p className={styles.chartNote}>No events in this range.</p>
                ) : activity ? (
                    <LogsActivityChart activity={activity} onSelectDay={showDay} />
                ) : null}
            </section>

            <section className={styles.panel} aria-label="Events">
                {isLoading && logs.length === 0 ? (
                    <LoadingState label="Loading events…" />
                ) : logs.length === 0 ? (
                    <EmptyState
                        compact
                        title="No events"
                        description="Nothing matches these filters. Try a longer range or all events."
                    />
                ) : (
                    <>
                        <LogsList logs={logs} timezone={timezone} domainColors={domainColors} />
                        {totalPages > 1 && (
                            <nav className={styles.pagination} aria-label="Event pages">
                                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>
                                    Previous
                                </Button>
                                <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
                                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                                    Next
                                </Button>
                            </nav>
                        )}
                    </>
                )}
            </section>

            </div>

            <DeleteConfirmModal
                isOpen={showClearConfirm}
                onClose={() => setShowClearConfirm(false)}
                onConfirm={handleClearLogs}
                title="Clear all logs?"
                message="Permanently delete all application event logs for this fractal, including events outside the current filters. Your goals, sessions, and activities will remain unchanged."
                confirmText="Clear all logs"
            />
        </div>
    );
}

export default Logs;
