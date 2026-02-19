import React, { useMemo, useState } from 'react';
import SessionActivityItem from './SessionActivityItem';
import styles from './SessionSection.module.css';
import { Heading } from '../atoms/Typography';
import { useActiveSessionActions, useActiveSessionData, useActiveSessionUi } from '../../contexts/ActiveSessionContext';
import useIsMobile from '../../hooks/useIsMobile';
import { calculateSectionDurationFromInstanceIds, formatClockDuration } from '../../utils/sessionTime';
import { buildDefinitionMap, buildInstanceMap, buildPositionMap } from '../../utils/sessionSection';

const SessionSection = ({
    section,
    sectionIndex,
    onFocusActivity,
    selectedActivityId,
    onOpenActivityBuilder,
    onNoteCreated,
    allNotes,
    onAddNote,
    onUpdateNote,
    onDeleteNote,
    onOpenGoals,
}) => {
    const isMobile = useIsMobile();
    // Context
    const {
        activityInstances,
        activities,
        activityGroups,
        groupMap,
        groupedActivities,
        instancesLoading
    } = useActiveSessionData();

    const {
        showActivitySelector,
        setShowActivitySelector,
        draggedItem,
        setDraggedItem,
    } = useActiveSessionUi();

    const {
        addActivity,
        removeActivity,
        moveActivity,
        reorderActivity,
    } = useActiveSessionActions();

    const [browseParentGroupId, setBrowseParentGroupId] = useState(null);
    const [activeLeafGroupId, setActiveLeafGroupId] = useState(null);
    const [isDragOver, setIsDragOver] = useState(false);

    // Filter ungrouped activities
    const ungroupedActivities = Array.isArray(activities) ? activities.filter(a => !a.group_id) : [];

    const childGroupsByParent = useMemo(() => {
        const map = {};
        (Array.isArray(activityGroups) ? activityGroups : []).forEach((group) => {
            const parentId = group.parent_id || null;
            if (!map[parentId]) map[parentId] = [];
            map[parentId].push(group);
        });
        return map;
    }, [activityGroups]);

    const recursiveActivityCounts = useMemo(() => {
        const counts = {};
        const visiting = new Set();

        const computeCount = (groupId) => {
            if (!groupId) return 0;
            if (counts[groupId] != null) return counts[groupId];
            if (visiting.has(groupId)) return 0;
            visiting.add(groupId);

            const direct = groupedActivities[groupId]?.length || 0;
            const children = childGroupsByParent[groupId] || [];
            const nested = children.reduce((sum, child) => sum + computeCount(child.id), 0);
            const total = direct + nested;
            counts[groupId] = total;
            visiting.delete(groupId);
            return total;
        };

        (Array.isArray(activityGroups) ? activityGroups : []).forEach((group) => {
            computeCount(group.id);
        });

        return counts;
    }, [activityGroups, childGroupsByParent, groupedActivities]);

    const currentGroupChoices = useMemo(() => {
        const groups = childGroupsByParent[browseParentGroupId || null] || [];
        return groups.filter((group) => (recursiveActivityCounts[group.id] || 0) > 0);
    }, [browseParentGroupId, childGroupsByParent, recursiveActivityCounts]);

    const currentParentGroup = browseParentGroupId ? groupMap[browseParentGroupId] : null;
    const currentLevelActivities = browseParentGroupId
        ? (groupedActivities[browseParentGroupId] || [])
        : [];
    const leafActivities = activeLeafGroupId === 'ungrouped'
        ? ungroupedActivities
        : (groupedActivities[activeLeafGroupId] || []);
    const instanceById = useMemo(() => {
        return buildInstanceMap(activityInstances || []);
    }, [activityInstances]);

    const definitionById = useMemo(() => {
        return buildDefinitionMap(activities || []);
    }, [activities]);

    const activityPositionById = useMemo(() => {
        return buildPositionMap(section.activity_ids || []);
    }, [section.activity_ids]);
    const notesByInstanceId = useMemo(() => {
        const map = new Map();
        (allNotes || []).forEach((note) => {
            const instanceId = note.activity_instance_id;
            if (!instanceId) return;
            if (!map.has(instanceId)) map.set(instanceId, []);
            map.get(instanceId).push(note);
        });
        return map;
    }, [allNotes]);

    // Drag handlers for the section (drop target)
    const handleDragOver = (e) => {
        e.preventDefault();
        if (draggedItem && draggedItem.sourceSectionIndex !== sectionIndex) {
            setIsDragOver(true);
        }
    };

    const handleDragLeave = (e) => {
        // Only set to false if we're leaving the section entirely
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsDragOver(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);

        if (draggedItem && draggedItem.sourceSectionIndex !== sectionIndex) {
            // Move activity from source section to this section
            moveActivity(
                draggedItem.sourceSectionIndex,
                sectionIndex,
                draggedItem.instanceId
            );
        }
        setDraggedItem(null);
    };

    const isSelectorOpen = Boolean(showActivitySelector[sectionIndex]);
    const closeSelector = () => {
        setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: false }));
        setBrowseParentGroupId(null);
        setActiveLeafGroupId(null);
    };

    const handleBack = () => {
        if (activeLeafGroupId !== null) {
            setActiveLeafGroupId(null);
            return;
        }
        if (browseParentGroupId) {
            setBrowseParentGroupId(groupMap[browseParentGroupId]?.parent_id || null);
            return;
        }
        closeSelector();
    };

    const selectorContent = (
        <div className={styles.activitySelector}>
            <div className={styles.selectorHeader}>
                <span className={styles.selectorTitle}>
                    {activeLeafGroupId === null
                        ? (browseParentGroupId
                            ? `Step 1: Select Sub-Group in ${currentParentGroup?.name || 'Group'}`
                            : 'Step 1: Select Activity Group')
                        : (activeLeafGroupId === 'ungrouped'
                            ? 'Step 2: Pick an Ungrouped Activity'
                            : `Step 2: Pick a ${groupMap[activeLeafGroupId]?.name || 'Group'} Activity`)
                    }
                </span>
                <div className={styles.selectorActions}>
                    <button
                        type="button"
                        onClick={handleBack}
                        className={styles.backButton}
                    >
                        ← Back
                    </button>
                    <button
                        type="button"
                        onClick={closeSelector}
                        className={styles.closeButton}
                        aria-label="Close activity selector"
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Hierarchical View */}
            {activeLeafGroupId === null ? (
                <>
                    <div className={styles.groupsGrid}>
                        {currentGroupChoices.map((group) => {
                            const childGroups = childGroupsByParent[group.id] || [];
                            const hasChildren = childGroups.some((child) => (recursiveActivityCounts[child.id] || 0) > 0);
                            const activityCount = recursiveActivityCounts[group.id] || 0;
                            return (
                                <button
                                    type="button"
                                    key={group.id}
                                    onClick={() => {
                                        if (hasChildren) {
                                            setBrowseParentGroupId(group.id);
                                            setActiveLeafGroupId(null);
                                        } else {
                                            setActiveLeafGroupId(group.id);
                                        }
                                    }}
                                    className={styles.groupCard}
                                >
                                    <div className={styles.groupCardName}>
                                        {group?.name || 'Unknown'} {'›'}
                                    </div>
                                    <div className={styles.groupCardCount}>{activityCount} activities</div>
                                </button>
                            );
                        })}

                        {!browseParentGroupId && ungroupedActivities.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setActiveLeafGroupId('ungrouped')}
                                className={styles.ungroupedCard}
                            >
                                <div className={styles.ungroupedCardName}>Ungrouped</div>
                                <div className={styles.groupCardCount}>{ungroupedActivities.length} activities</div>
                            </button>
                        )}
                    </div>

                    {currentLevelActivities.length > 0 && (
                        <>
                            <div className={styles.selectorDivider}></div>
                            <div className={styles.activitiesList}>
                                {currentLevelActivities.map((act) => (
                                    <button
                                        type="button"
                                        key={act.id}
                                        onClick={() => addActivity(sectionIndex, act.id)}
                                        className={styles.activityButton}
                                    >
                                        <span>+</span> {act.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </>
            ) : (
                <div className={styles.activitiesList}>
                    {leafActivities.map(act => (
                        <button
                            type="button"
                            key={act.id}
                            onClick={() => addActivity(sectionIndex, act.id)}
                            className={styles.activityButton}
                        >
                            <span>+</span> {act.name}
                        </button>
                    ))}
                    {(leafActivities.length === 0 && (
                        <div className={styles.noActivitiesMessage}>No activities found in this group.</div>
                    ))}
                </div>
            )}

            {activeLeafGroupId === null && (
                <>
                    <div className={styles.selectorDivider}></div>
                    <button
                        type="button"
                        onClick={() => onOpenActivityBuilder(sectionIndex)}
                        className={styles.createActivityButton}
                    >
                        + Create New Activity Definition
                    </button>
                </>
            )}
        </div>
    );

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`${styles.sectionContainer} ${isDragOver ? styles.sectionContainerDragOver : ''}`}
        >
            <div className={styles.sectionHeader}>
                <Heading level={3} className={styles.sectionTitle}>
                    {section.name || `Section ${sectionIndex + 1}`}
                </Heading>
                <div className={styles.sectionDuration}>
                    Duration: <span className={styles.durationValue}>
                        {formatClockDuration(calculateSectionDurationFromInstanceIds(section, activityInstances))}
                    </span>
                    <span className={styles.durationPlanned}>
                        (planned: {section.estimated_duration_minutes || '—'} min)
                    </span>
                </div>
            </div>

                <div className={styles.activitiesContainer}>
                    {section.activity_ids?.map((instanceId) => {
                    const instance = instanceById.get(instanceId);
                    if (!instance) return null;
                    const definition = definitionById.get(instance.activity_definition_id);
                    const isDragging = draggedItem?.instanceId === instanceId;
                    const position = activityPositionById.get(instanceId) ?? -1;

                    return (
                        <div
                            key={instanceId}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggedItem({
                                    instanceId,
                                    sourceSectionIndex: sectionIndex,
                                    activityName: definition?.name || 'Activity'
                                });
                            }}
                            onDragEnd={() => {
                                setDraggedItem(null);
                            }}
                            className={`${styles.draggableActivity} ${isDragging ? styles.draggableActivityDragging : ''}`}
                        >
                            <SessionActivityItem
                                exercise={instance}
                                onDelete={() => removeActivity(instanceId)}
                                onFocus={(instance, setIndex) => onFocusActivity(instance, setIndex)}
                                isSelected={selectedActivityId === instanceId}
                                onReorder={(direction) => reorderActivity(sectionIndex, position, direction)}
                                canMoveUp={position > 0}
                                canMoveDown={position >= 0 && position < section.activity_ids.length - 1}
                                showReorderButtons={true}
                                onNoteCreated={onNoteCreated}
                                allNotes={allNotes}
                                onAddNote={onAddNote}
                                onUpdateNote={onUpdateNote}
                                onDeleteNote={onDeleteNote}
                                onOpenGoals={onOpenGoals}
                                isDragging={isDragging}
                                activityDefinition={definition}
                                activityNotes={notesByInstanceId.get(instanceId) || []}
                            />
                        </div>
                    );
                })}

                {instancesLoading && (!section.activity_ids || section.activity_ids.length === 0) && (
                    <div className={styles.dropZoneIndicator}>
                        Loading activity items...
                    </div>
                )}

                {/* Drop Zone Indicator */}
                {isDragOver && draggedItem && (
                    <div className={styles.dropZoneIndicator}>
                        Drop "{draggedItem.activityName}" here
                    </div>
                )}

                {/* Add Activity Button / Selector */}
                {isSelectorOpen ? (
                    isMobile ? (
                        <div
                            className={styles.mobileSelectorOverlay}
                            onClick={closeSelector}
                            role="presentation"
                        >
                            <div className={styles.mobileSelectorSheet} onClick={(event) => event.stopPropagation()}>
                                {selectorContent}
                            </div>
                        </div>
                    ) : (
                        selectorContent
                    )
                ) : (
                    <button
                        type="button"
                        onClick={() => setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: true }))}
                        className={styles.addActivityButton}
                    >
                        + Add Activity
                    </button>
                )}
            </div>
        </div>
    );
};

export default SessionSection;
