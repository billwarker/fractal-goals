import React, { useEffect, useMemo, useState } from 'react';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import GoalIcon from '../atoms/GoalIcon';
import './SessionFilterSelectionModal.css';

function getGoalType(item) {
    return item?.type || item?.attributes?.type || '';
}

function buildActivityGroupMap(activityGroups) {
    return activityGroups.reduce((map, group) => {
        map[group.id] = group;
        return map;
    }, {});
}

function buildChildGroupsByParent(activityGroups) {
    return activityGroups.reduce((map, group) => {
        const parentId = group.parent_id || null;
        if (!map[parentId]) {
            map[parentId] = [];
        }
        map[parentId].push(group);
        return map;
    }, {});
}

function buildGroupPath(groupId, groupMap) {
    if (!groupId || !groupMap[groupId]) return 'Ungrouped';
    const parts = [];
    const visited = new Set();
    let currentId = groupId;

    while (currentId && groupMap[currentId] && !visited.has(currentId)) {
        visited.add(currentId);
        parts.unshift(groupMap[currentId].name);
        currentId = groupMap[currentId].parent_id || null;
    }

    return parts.join(' / ');
}

function SessionFilterSelectionModal({
    isOpen,
    title,
    items = [],
    activityGroups = [],
    selectedIds = [],
    searchPlaceholder = 'Search',
    emptyState = 'No options available.',
    itemKind = 'default',
    onClose,
    onConfirm,
}) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const [searchTerm, setSearchTerm] = useState('');
    const [draftSelectedIds, setDraftSelectedIds] = useState(() => new Set(selectedIds));
    const [browseParentGroupId, setBrowseParentGroupId] = useState(null);
    const [activeLeafGroupId, setActiveLeafGroupId] = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        setSearchTerm('');
        setDraftSelectedIds(new Set(selectedIds));
        setBrowseParentGroupId(null);
        setActiveLeafGroupId(null);
    }, [isOpen, selectedIds]);

    const groupMap = useMemo(
        () => buildActivityGroupMap(Array.isArray(activityGroups) ? activityGroups : []),
        [activityGroups]
    );

    const childGroupsByParent = useMemo(
        () => buildChildGroupsByParent(Array.isArray(activityGroups) ? activityGroups : []),
        [activityGroups]
    );

    const groupedActivities = useMemo(() => (
        items.reduce((map, item) => {
            if (!item.group_id) return map;
            if (!map[item.group_id]) {
                map[item.group_id] = [];
            }
            map[item.group_id].push(item);
            return map;
        }, {})
    ), [items]);

    const ungroupedActivities = useMemo(
        () => items.filter((item) => !item.group_id),
        [items]
    );

    const recursiveActivityCounts = useMemo(() => {
        if (itemKind !== 'activity') return {};
        const counts = {};
        const visiting = new Set();

        const computeCount = (groupId) => {
            if (!groupId) return 0;
            if (counts[groupId] != null) return counts[groupId];
            if (visiting.has(groupId)) return 0;
            visiting.add(groupId);

            const directCount = groupedActivities[groupId]?.length || 0;
            const nestedCount = (childGroupsByParent[groupId] || [])
                .reduce((sum, childGroup) => sum + computeCount(childGroup.id), 0);

            const total = directCount + nestedCount;
            counts[groupId] = total;
            visiting.delete(groupId);
            return total;
        };

        activityGroups.forEach((group) => {
            computeCount(group.id);
        });

        return counts;
    }, [activityGroups, childGroupsByParent, groupedActivities, itemKind]);

    const recursiveSelectedCounts = useMemo(() => {
        if (itemKind !== 'activity') return {};
        const counts = {};
        const visiting = new Set();

        const computeCount = (groupId) => {
            if (!groupId) return 0;
            if (counts[groupId] != null) return counts[groupId];
            if (visiting.has(groupId)) return 0;
            visiting.add(groupId);

            const directCount = (groupedActivities[groupId] || [])
                .filter((activity) => draftSelectedIds.has(activity.id))
                .length;
            const nestedCount = (childGroupsByParent[groupId] || [])
                .reduce((sum, childGroup) => sum + computeCount(childGroup.id), 0);

            const total = directCount + nestedCount;
            counts[groupId] = total;
            visiting.delete(groupId);
            return total;
        };

        activityGroups.forEach((group) => {
            computeCount(group.id);
        });

        return counts;
    }, [activityGroups, childGroupsByParent, draftSelectedIds, groupedActivities, itemKind]);

    const currentGroupChoices = useMemo(() => {
        if (itemKind !== 'activity') return [];
        return (childGroupsByParent[browseParentGroupId || null] || [])
            .filter((group) => (recursiveActivityCounts[group.id] || 0) > 0);
    }, [browseParentGroupId, childGroupsByParent, itemKind, recursiveActivityCounts]);

    const currentLevelActivities = useMemo(() => {
        if (itemKind !== 'activity' || !browseParentGroupId) return [];
        return groupedActivities[browseParentGroupId] || [];
    }, [browseParentGroupId, groupedActivities, itemKind]);

    const leafActivities = useMemo(() => {
        if (itemKind !== 'activity') return [];
        if (activeLeafGroupId === 'ungrouped') return ungroupedActivities;
        if (!activeLeafGroupId) return [];
        return groupedActivities[activeLeafGroupId] || [];
    }, [activeLeafGroupId, groupedActivities, itemKind, ungroupedActivities]);

    const searchResultsByGroup = useMemo(() => {
        if (itemKind !== 'activity') return [];
        const query = searchTerm.trim().toLowerCase();
        if (!query) return [];

        const matches = items.filter((item) => {
            const groupPath = buildGroupPath(item.group_id, groupMap).toLowerCase();
            const description = (item.description || '').toLowerCase();
            return item.name.toLowerCase().includes(query)
                || description.includes(query)
                || groupPath.includes(query);
        });

        const sections = matches.reduce((map, item) => {
            const key = item.group_id || 'ungrouped';
            if (!map[key]) {
                map[key] = [];
            }
            map[key].push(item);
            return map;
        }, {});

        return Object.entries(sections)
            .map(([groupId, groupItems]) => ({
                groupId,
                groupLabel: groupId === 'ungrouped' ? 'Ungrouped' : buildGroupPath(groupId, groupMap),
                items: [...groupItems].sort((left, right) => left.name.localeCompare(right.name)),
            }))
            .sort((left, right) => left.groupLabel.localeCompare(right.groupLabel));
    }, [groupMap, itemKind, items, searchTerm]);

    const ungroupedSelectedCount = useMemo(() => (
        ungroupedActivities.filter((activity) => draftSelectedIds.has(activity.id)).length
    ), [draftSelectedIds, ungroupedActivities]);

    const filteredItems = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return items;
        return items.filter((item) => {
            const type = getGoalType(item).toLowerCase();
            return item.name.toLowerCase().includes(query) || type.includes(query);
        });
    }, [items, searchTerm]);

    const handleToggle = (itemId) => {
        setDraftSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const handleConfirm = () => {
        onConfirm?.(Array.from(draftSelectedIds));
        onClose?.();
    };

    const handleBack = () => {
        if (activeLeafGroupId !== null) {
            setActiveLeafGroupId(null);
            return;
        }
        if (browseParentGroupId) {
            setBrowseParentGroupId(groupMap[browseParentGroupId]?.parent_id || null);
        }
    };

    const renderSelectionRow = (item) => {
        const isSelected = draftSelectedIds.has(item.id);
        const goalType = getGoalType(item);

        return (
            <label
                key={item.id}
                className={`session-filter-modal-item ${isSelected ? 'selected' : ''}`}
            >
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(item.id)}
                />
                <div className="session-filter-modal-item-content">
                    {itemKind === 'goal' && (
                        <div className="session-filter-modal-goal-icon">
                            <GoalIcon
                                shape={getGoalIcon(goalType)}
                                color={getGoalColor(goalType)}
                                secondaryColor={getGoalSecondaryColor(goalType)}
                                size={16}
                            />
                        </div>
                    )}
                    <div className="session-filter-modal-text">
                        <div className="session-filter-modal-name">{item.name}</div>
                        {itemKind === 'goal' && goalType && (
                            <div className="session-filter-modal-meta">
                                {goalType.replace(/([A-Z])/g, ' $1').trim()}
                            </div>
                        )}
                        {itemKind === 'activity' && item.description && (
                            <div className="session-filter-modal-meta">{item.description}</div>
                        )}
                    </div>
                </div>
            </label>
        );
    };

    const renderActivityBrowser = () => {
        const currentParentGroup = browseParentGroupId ? groupMap[browseParentGroupId] : null;
        const isSearchMode = Boolean(searchTerm.trim());

        if (items.length === 0) {
            return <div className="session-filter-modal-empty">{emptyState}</div>;
        }

        if (isSearchMode) {
            if (searchResultsByGroup.length === 0) {
                return <div className="session-filter-modal-empty">No activities match this search.</div>;
            }

            return (
                <div className="session-filter-modal-scroll-region">
                    <div className="session-filter-modal-list">
                        {searchResultsByGroup.map((section) => (
                            <div key={section.groupId} className="session-filter-modal-group-section">
                                <div className="session-filter-modal-section-title">{section.groupLabel}</div>
                                <div className="session-filter-modal-group-items">
                                    {section.items.map((item) => renderSelectionRow(item))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        return (
            <div className="session-filter-modal-browser">
                {(browseParentGroupId || activeLeafGroupId !== null) && (
                    <div className="session-filter-modal-browser-header">
                        <button
                            type="button"
                            className="session-filter-modal-back-button"
                            onClick={handleBack}
                        >
                            ← Back
                        </button>
                        <div className="session-filter-modal-browser-step">
                            {activeLeafGroupId === null
                                ? (browseParentGroupId
                                    ? `Step 1: Select Sub-Group in ${currentParentGroup?.name || 'Group'}`
                                    : 'Step 1: Select Activity Group')
                                : (activeLeafGroupId === 'ungrouped'
                                    ? 'Step 2: Pick an Ungrouped Activity'
                                    : `Step 2: Pick a ${groupMap[activeLeafGroupId]?.name || 'Group'} Activity`)}
                        </div>
                    </div>
                )}

                {activeLeafGroupId === null ? (
                    <>
                        <div className="session-filter-modal-groups-grid">
                            {currentGroupChoices.map((group) => {
                                const hasChildren = (childGroupsByParent[group.id] || [])
                                    .some((childGroup) => (recursiveActivityCounts[childGroup.id] || 0) > 0);
                                const activityCount = recursiveActivityCounts[group.id] || 0;
                                const selectedCount = recursiveSelectedCounts[group.id] || 0;

                                return (
                                    <button
                                        key={group.id}
                                        type="button"
                                        className="session-filter-modal-group-card"
                                        onClick={() => {
                                            if (hasChildren) {
                                                setBrowseParentGroupId(group.id);
                                                setActiveLeafGroupId(null);
                                            } else {
                                                setActiveLeafGroupId(group.id);
                                            }
                                        }}
                                    >
                                        <div className="session-filter-modal-group-name">{group.name} {'›'}</div>
                                        <div className="session-filter-modal-group-count">{activityCount} activities</div>
                                        {selectedCount > 0 && (
                                            <div className="session-filter-modal-group-selected">{selectedCount} selected</div>
                                        )}
                                    </button>
                                );
                            })}

                            {!browseParentGroupId && ungroupedActivities.length > 0 && (
                                <button
                                    type="button"
                                    className="session-filter-modal-group-card session-filter-modal-group-card-ungrouped"
                                    onClick={() => setActiveLeafGroupId('ungrouped')}
                                >
                                    <div className="session-filter-modal-group-name">Ungrouped</div>
                                    <div className="session-filter-modal-group-count">{ungroupedActivities.length} activities</div>
                                    {ungroupedSelectedCount > 0 && (
                                        <div className="session-filter-modal-group-selected">
                                            {ungroupedSelectedCount} selected
                                        </div>
                                    )}
                                </button>
                            )}
                        </div>

                        {currentLevelActivities.length > 0 && (
                            <>
                                <div className="session-filter-modal-divider" />
                                <div className="session-filter-modal-section-title">
                                    Activities in {currentParentGroup?.name || 'this group'}
                                </div>
                                <div className="session-filter-modal-scroll-region">
                                    <div className="session-filter-modal-list">
                                        {currentLevelActivities.map((item) => renderSelectionRow(item))}
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    leafActivities.length === 0 ? (
                        <div className="session-filter-modal-empty">No activities found in this group.</div>
                    ) : (
                        <div className="session-filter-modal-scroll-region">
                            <div className="session-filter-modal-list">
                                {leafActivities.map((item) => renderSelectionRow(item))}
                            </div>
                        </div>
                    )
                )}
            </div>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="lg"
        >
            <ModalBody>
                <div className="session-filter-modal-search">
                    <input
                        type="text"
                        value={searchTerm}
                        placeholder={searchPlaceholder}
                        onChange={(event) => setSearchTerm(event.target.value)}
                    />
                </div>

                {itemKind === 'activity' ? renderActivityBrowser() : filteredItems.length === 0 ? (
                    <div className="session-filter-modal-empty">{emptyState}</div>
                ) : (
                    <div className="session-filter-modal-scroll-region">
                        <div className="session-filter-modal-list">
                            {filteredItems.map((item) => renderSelectionRow(item))}
                        </div>
                    </div>
                )}
            </ModalBody>

            <ModalFooter>
                <button
                    type="button"
                    className="session-filter-modal-secondary"
                    onClick={() => setDraftSelectedIds(new Set())}
                >
                    Clear
                </button>
                <button
                    type="button"
                    className="session-filter-modal-secondary"
                    onClick={onClose}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="session-filter-modal-primary"
                    onClick={handleConfirm}
                >
                    Apply ({draftSelectedIds.size})
                </button>
            </ModalFooter>
        </Modal>
    );
}

export default SessionFilterSelectionModal;
