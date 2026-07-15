import React from 'react';

import HeaderButton from '../layout/HeaderButton';
import styles from './ActivityCatalogueToolbar.module.css';

export default function ActivityCatalogueToolbar({
    searchTerm,
    onSearchChange,
    hasGroups,
    allGroupsCollapsed,
    onToggleCollapseAll,
}) {
    return (
        <>
            <label className={styles.searchLabel}>
                <span className={styles.searchText}>Search</span>
                <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Groups or activities"
                    className={styles.searchInput}
                />
            </label>
            {hasGroups && (
                <HeaderButton variant="secondary" onClick={onToggleCollapseAll}>
                    {allGroupsCollapsed ? 'Expand All' : 'Collapse All'}
                </HeaderButton>
            )}
        </>
    );
}
