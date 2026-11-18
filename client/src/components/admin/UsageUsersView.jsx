import React, { useMemo, useState } from 'react';

import { formatDateTime } from './usageParts';
import styles from './UsageViews.module.css';

const COLUMNS = [
    { key: 'username', label: 'User', type: 'text' },
    { key: 'last_seen', label: 'Last seen', type: 'date' },
    { key: 'last_login_at', label: 'Last login', type: 'date' },
    { key: 'page_views', label: 'Page views', type: 'number' },
    { key: 'sessions_created', label: 'Sessions', type: 'number' },
    { key: 'goals_created', label: 'Goals', type: 'number' },
    { key: 'total_events', label: 'Events', type: 'number' },
];

const sortValue = (entry, column) => {
    const value = entry[column.key];
    if (column.type === 'date') return value ? new Date(value).getTime() : -Infinity;
    if (column.type === 'number') return value ?? 0;
    return String(value ?? '').toLowerCase();
};

/** Overview → Users: per-account activity in the window, searchable and sortable. */
export default function UsageUsersView({ perUser = [] }) {
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState({ key: 'last_seen', descending: true });

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        const column = COLUMNS.find((candidate) => candidate.key === sort.key);
        const matching = perUser.filter((entry) => !query
            || entry.username?.toLowerCase().includes(query)
            || entry.email?.toLowerCase().includes(query));
        return [...matching].sort((a, b) => {
            const left = sortValue(a, column);
            const right = sortValue(b, column);
            const order = left < right ? -1 : left > right ? 1 : 0;
            return sort.descending ? -order : order;
        });
    }, [perUser, search, sort]);

    const toggleSort = (key) => setSort((current) => (
        current.key === key ? { key, descending: !current.descending } : { key, descending: key !== 'username' }
    ));

    return (
        <div className={styles.view}>
            <input
                className={styles.search}
                type="search"
                aria-label="Search users"
                placeholder="Search by username or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
            />
            <div className={styles.tableScroll}>
                <table className={styles.compactTable}>
                    <thead>
                        <tr>
                            {COLUMNS.map((column) => {
                                const active = sort.key === column.key;
                                return (
                                    <th
                                        key={column.key}
                                        className={column.type === 'number' ? styles.num : undefined}
                                        aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}
                                    >
                                        <button type="button" className={styles.sortButton} onClick={() => toggleSort(column.key)}>
                                            {column.label}{active ? (sort.descending ? ' ▼' : ' ▲') : ''}
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((entry) => (
                            <tr key={entry.user_id}>
                                <td>{entry.username} ({entry.email})</td>
                                <td>{formatDateTime(entry.last_seen)}</td>
                                <td>{formatDateTime(entry.last_login_at)}</td>
                                <td className={styles.num}>{entry.page_views}</td>
                                <td className={styles.num}>{entry.sessions_created}</td>
                                <td className={styles.num}>{entry.goals_created}</td>
                                <td className={styles.num}>{entry.total_events}</td>
                            </tr>
                        ))}
                        {rows.length === 0 && (
                            <tr><td colSpan={COLUMNS.length}>{search ? 'No users match that search.' : 'No activity in this window.'}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
