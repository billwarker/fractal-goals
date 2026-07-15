import React, { useMemo, useState } from 'react';

import ActivityCard from '../ActivityCard';
import ActivityCatalogueToolbar from '../activities/ActivityCatalogueToolbar';
import Linkify from '../atoms/Linkify';
import styles from './LandingActivityCatalogue.module.css';

const ROOT_GROUP_KEY = '__root__';
const UNGROUPED_KEY = '__ungrouped__';

const bySortOrderAndName = (left, right) => (
    (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0)
    || String(left.name || '').localeCompare(String(right.name || ''))
);

function buildCatalogueModel(activities, activityGroups, query) {
    const groups = Array.isArray(activityGroups) ? activityGroups : [];
    const definitions = Array.isArray(activities) ? activities : [];
    const groupById = new Map(groups.map((group) => [String(group.id), group]));
    const childrenByParent = new Map();
    const activitiesByGroup = new Map();

    groups.forEach((group) => {
        const parentId = group.parent_id && groupById.has(String(group.parent_id))
            ? String(group.parent_id)
            : ROOT_GROUP_KEY;
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(group);
    });
    childrenByParent.forEach((children) => children.sort(bySortOrderAndName));

    definitions.forEach((activity) => {
        const groupId = activity.group_id && groupById.has(String(activity.group_id))
            ? String(activity.group_id)
            : UNGROUPED_KEY;
        if (!activitiesByGroup.has(groupId)) activitiesByGroup.set(groupId, []);
        activitiesByGroup.get(groupId).push(activity);
    });
    activitiesByGroup.forEach((items) => items.sort((left, right) => (
        String(left.name || '').localeCompare(String(right.name || ''))
    )));

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return { childrenByParent, activitiesByGroup, visibleGroupIds: null, groupScopeIds: null };
    }

    const visibleGroupIds = new Set();
    const groupScopeIds = new Set();
    const addAncestors = (groupId) => {
        let current = groupById.get(String(groupId));
        while (current) {
            visibleGroupIds.add(String(current.id));
            current = current.parent_id ? groupById.get(String(current.parent_id)) : null;
        }
    };
    const addDescendants = (groupId) => {
        const normalizedId = String(groupId);
        visibleGroupIds.add(normalizedId);
        groupScopeIds.add(normalizedId);
        (childrenByParent.get(normalizedId) || []).forEach((child) => addDescendants(child.id));
    };

    groups.forEach((group) => {
        const searchable = `${group.name || ''} ${group.description || ''}`.toLowerCase();
        if (!searchable.includes(normalizedQuery)) return;
        addAncestors(group.id);
        addDescendants(group.id);
    });
    definitions.forEach((activity) => {
        const searchable = `${activity.name || ''} ${activity.description || ''}`.toLowerCase();
        if (searchable.includes(normalizedQuery) && activity.group_id) addAncestors(activity.group_id);
    });

    return { childrenByParent, activitiesByGroup, visibleGroupIds, groupScopeIds };
}

export default function LandingActivityCatalogue({
    activities = [],
    activityGroups = [],
    instantiationSummary = {},
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [collapsedGroupIds, setCollapsedGroupIds] = useState(() => new Set());
    const model = useMemo(
        () => buildCatalogueModel(activities, activityGroups, searchTerm),
        [activities, activityGroups, searchTerm]
    );
    const normalizedQuery = searchTerm.trim().toLowerCase();
    const allGroupIds = useMemo(
        () => activityGroups.map((group) => String(group.id)),
        [activityGroups]
    );
    const allGroupsCollapsed = allGroupIds.length > 0
        && allGroupIds.every((groupId) => collapsedGroupIds.has(groupId));
    const activityMatches = (activity, groupId) => (
        !normalizedQuery
        || model.groupScopeIds?.has(String(groupId))
        || `${activity.name || ''} ${activity.description || ''}`.toLowerCase().includes(normalizedQuery)
    );

    const toggleGroup = (groupId) => {
        setCollapsedGroupIds((current) => {
            const next = new Set(current);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const toggleAllGroups = () => {
        setCollapsedGroupIds(allGroupsCollapsed ? new Set() : new Set(allGroupIds));
    };

    const renderActivity = (activity) => (
        <ActivityCard
            activity={activity}
            instantiationSummary={instantiationSummary?.[activity.id]}
            readOnly
            key={activity.id}
        />
    );

    const renderGroup = (group, level = 0) => {
        const groupId = String(group.id);
        if (model.visibleGroupIds && !model.visibleGroupIds.has(groupId)) return null;
        const directActivities = (model.activitiesByGroup.get(groupId) || [])
            .filter((activity) => activityMatches(activity, groupId));
        const childGroups = (model.childrenByParent.get(groupId) || []).filter((child) => (
            !model.visibleGroupIds || model.visibleGroupIds.has(String(child.id))
        ));
        const isCollapsed = !normalizedQuery && collapsedGroupIds.has(groupId);

        return (
            <section
                className={`${styles.groupSection} ${level > 0 ? styles.nestedGroupSection : ''} ${isCollapsed ? styles.groupSectionCollapsed : ''}`}
                key={group.id}
            >
                <header className={styles.groupHeader}>
                    <button
                        type="button"
                        className={styles.collapseButton}
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.name}`}
                        onClick={() => toggleGroup(groupId)}
                    >
                        {isCollapsed ? '+' : '−'}
                    </button>
                    <div>
                        <h3>{group.name}</h3>
                        {group.description && <p><Linkify>{group.description}</Linkify></p>}
                    </div>
                </header>

                {!isCollapsed && (
                    <div className={styles.groupContents}>
                        {childGroups.length > 0 && (
                            <div className={styles.childGroups}>
                                {childGroups.map((child) => renderGroup(child, level + 1))}
                            </div>
                        )}
                        {directActivities.length > 0 && (
                            <div className={styles.activityGrid}>
                                {directActivities.map(renderActivity)}
                            </div>
                        )}
                        {childGroups.length === 0 && directActivities.length === 0 && (
                            <div className={styles.emptyGroup}>No activities in this group.</div>
                        )}
                    </div>
                )}
            </section>
        );
    };

    const rootGroups = model.childrenByParent.get(ROOT_GROUP_KEY) || [];
    const ungroupedActivities = (model.activitiesByGroup.get(UNGROUPED_KEY) || [])
        .filter((activity) => activityMatches(activity, UNGROUPED_KEY));
    const visibleRootGroups = rootGroups.filter((group) => (
        !model.visibleGroupIds || model.visibleGroupIds.has(String(group.id))
    ));
    const hasResults = visibleRootGroups.length > 0 || ungroupedActivities.length > 0;

    return (
        <section className={styles.catalogue} aria-label="Activity catalogue">
            <div className={styles.toolbar}>
                <ActivityCatalogueToolbar
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    hasGroups={allGroupIds.length > 0}
                    allGroupsCollapsed={allGroupsCollapsed}
                    onToggleCollapseAll={toggleAllGroups}
                />
            </div>

            <div className={styles.catalogueBody}>
                {visibleRootGroups.map(renderGroup)}
                {ungroupedActivities.length > 0 && (
                    <section className={styles.ungrouped} aria-labelledby="landing-ungrouped-activities">
                        <h4 id="landing-ungrouped-activities">Ungrouped activities</h4>
                        <div className={styles.activityGrid}>
                            {ungroupedActivities.map(renderActivity)}
                        </div>
                    </section>
                )}
                {!hasResults && (
                    <div className={styles.emptyState}>
                        {normalizedQuery
                            ? `No groups or activities match “${searchTerm.trim()}”.`
                            : 'This example does not have an activity catalogue yet.'}
                    </div>
                )}
            </div>
        </section>
    );
}
