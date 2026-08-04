import React from 'react';

import HeaderButton from '../layout/HeaderButton';
import styles from './ActivityCatalogueToolbar.module.css';

export default function ActivityCatalogueToolbar({
    searchTerm,
    onSearchChange,
    placeholder = 'Groups or activities',
    hasGroups,
    allGroupsCollapsed,
    onToggleCollapseAll,
    controlClassName = '',
}) {
    return (
        <>
            <label className={styles.searchLabel}>
                <span className={styles.searchText}>Search</span>
                <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={placeholder}
                    className={`${styles.searchInput} ${controlClassName}`.trim()}
                />
            </label>
            {hasGroups && (
                <HeaderButton className={controlClassName} variant="secondary" onClick={onToggleCollapseAll}>
                    {allGroupsCollapsed ? 'Expand All' : 'Collapse All'}
                </HeaderButton>
            )}
        </>
    );
}
