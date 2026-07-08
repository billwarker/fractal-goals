import React, { useMemo, useState } from 'react';

import styles from '../../pages/Admin.module.css';

/**
 * Full domain-event breakdown for the admin usage dashboard: every event type
 * recorded in event_logs within the selected window, filterable by domain.
 */
function EventsBreakdownTable({ events = [] }) {
    const [activeDomain, setActiveDomain] = useState('');
    const [search, setSearch] = useState('');

    const domains = useMemo(
        () => [...new Set(events.map((event) => event.domain))].sort(),
        [events],
    );

    const visibleEvents = useMemo(() => events.filter((event) => {
        if (activeDomain && event.domain !== activeDomain) return false;
        if (search && !event.event_type.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    }), [events, activeDomain, search]);

    return (
        <>
            <div className={styles.betaSignupControls}>
                <div className={styles.betaStatusFilters}>
                    <button
                        type="button"
                        className={activeDomain === '' ? styles.activeTab : ''}
                        onClick={() => setActiveDomain('')}
                    >
                        All domains
                    </button>
                    {domains.map((domain) => (
                        <button
                            key={domain}
                            type="button"
                            className={activeDomain === domain ? styles.activeTab : ''}
                            onClick={() => setActiveDomain(domain)}
                        >
                            {domain.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>
                <input
                    className={styles.search}
                    placeholder="Search event types"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </div>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Event</th>
                        <th>Domain</th>
                        <th>Count</th>
                        <th>Users</th>
                    </tr>
                </thead>
                <tbody>
                    {visibleEvents.map((event) => (
                        <tr key={event.event_type}>
                            <td>{event.event_type}</td>
                            <td>{event.domain}</td>
                            <td>{event.count}</td>
                            <td>{event.users}</td>
                        </tr>
                    ))}
                    {visibleEvents.length === 0 && (
                        <tr><td colSpan={4}>No domain events in this window.</td></tr>
                    )}
                </tbody>
            </table>
        </>
    );
}

export default EventsBreakdownTable;
