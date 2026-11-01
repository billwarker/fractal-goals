import React, { createContext, useContext } from 'react';

import EmptyState from '../common/EmptyState';
import styles from './ChartStates.module.css';

/**
 * Loading, error and empty states shared by every analytics chart, on the Analytics page, in goal
 * charts and in surface widgets, so they look and read the same everywhere.
 *
 * The Analytics page wraps each panel in a ChartScopeProvider; when filters are set, an empty chart
 * says the filters may be why and offers to clear them.
 */
const ChartScopeContext = createContext({ hasActiveFilters: false, onClearFilters: null });

export function ChartScopeProvider({ hasActiveFilters, onClearFilters, children }) {
    const value = React.useMemo(() => ({ hasActiveFilters, onClearFilters }), [hasActiveFilters, onClearFilters]);
    return <ChartScopeContext.Provider value={value}>{children}</ChartScopeContext.Provider>;
}

export function ChartLoading({ label = 'Loading analytics…' }) {
    return (
        <div className={styles.loading} role="status">
            <div className={styles.skeleton} aria-hidden="true">
                {[45, 70, 55, 85, 40, 65, 30].map((height, index) => (
                    <span key={index} style={{ height: `${height}%` }} />
                ))}
            </div>
            <span className={styles.label}>{label}</span>
        </div>
    );
}

export function ChartError({ message = 'Analytics could not be loaded.', onRetry = null }) {
    return (
        <div className={styles.message} role="alert">
            <span>{message}</span>
            {onRetry ? <button type="button" className={styles.retry} onClick={() => onRetry()}>Retry</button> : null}
        </div>
    );
}

/** An empty chart: what would appear and, while filters are set, a way to clear them. */
export function ChartEmpty({ title = 'Nothing to show yet', description }) {
    const { hasActiveFilters, onClearFilters } = useContext(ChartScopeContext);
    const filtered = hasActiveFilters && onClearFilters;
    return (
        <EmptyState
            compact
            title={filtered ? 'Nothing matches these filters' : title}
            description={filtered ? `${description} Try a wider time range or fewer filters.` : description}
            actionLabel={filtered ? 'Clear filters' : undefined}
            onAction={filtered ? onClearFilters : undefined}
        />
    );
}
