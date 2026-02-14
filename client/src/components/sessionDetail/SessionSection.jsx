import React, { useState } from 'react';
import SessionActivityItem from './SessionActivityItem';
import styles from './SessionSection.module.css';
import { Heading } from '../atoms/Typography';

/**
 * Calculate total duration in seconds for a section based on activity instances
 */
function calculateSectionDuration(section, activityInstances) {
    if (!section || !section.activity_ids || !activityInstances) return 0;

    let totalSeconds = 0;
    for (const instanceId of section.activity_ids) {
        const instance = activityInstances.find(inst => inst.id === instanceId);
        if (instance && instance.duration_seconds != null) {
            totalSeconds += instance.duration_seconds;
        }
    }
    return totalSeconds;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS format
 */
function formatDuration(seconds) {
    if (seconds == null || seconds === 0) return '--:--';

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const SessionSection = ({
    section,
    sectionIndex,
    activityInstances,
    onDeleteActivity,
    onUpdateActivity,
    onFocusActivity,
    selectedActivityId,
    rootId,
    showActivitySelector,
    onToggleActivitySelector,
    onAddActivity,
    onOpenActivityBuilder,
    groupedActivities,
    groupMap,
    activities,
    onNoteCreated,
    sessionId,
    allNotes,
    onAddNote,
    onUpdateNote,
    onDeleteNote,
    onOpenGoals,
    // Drag and drop props
    onMoveActivity,
    onReorderActivity,
    draggedItem,
    setDraggedItem
}) => {
    const [viewGroupId, setViewGroupId] = useState(null);
    const [isDragOver, setIsDragOver] = useState(false);

    // Filter ungrouped activities
    const ungroupedActivities = activities.filter(a => !a.group_id);

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
            onMoveActivity(
                draggedItem.sourceSectionIndex,
                sectionIndex,
                draggedItem.instanceId
            );
        }
        setDraggedItem(null);
    };

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
                        {formatDuration(calculateSectionDuration(section, activityInstances))}
                    </span>
                    <span className={styles.durationPlanned}>
                        (planned: {section.estimated_duration_minutes || '—'} min)
                    </span>
                </div>
            </div>

            <div className={styles.activitiesContainer}>
                {section.activity_ids?.map((instanceId) => {
                    const instance = activityInstances.find(i => i.id === instanceId);
                    if (!instance) return null;
                    const definition = activities.find(a => a.id === instance.activity_definition_id);
                    const isDragging = draggedItem?.instanceId === instanceId;

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
                                activityDefinition={definition}
                                onDelete={() => onDeleteActivity(sectionIndex, instanceId)}
                                onUpdate={(key, value) => onUpdateActivity(instanceId, { [key]: value })}
                                onFocus={(instance, setIndex) => onFocusActivity(instance, setIndex)}
                                isSelected={selectedActivityId === instanceId}
                                rootId={rootId}
                                onReorder={(direction) => onReorderActivity(sectionIndex, section.activity_ids.indexOf(instanceId), direction)}
                                canMoveUp={section.activity_ids.indexOf(instanceId) > 0}
                                canMoveDown={section.activity_ids.indexOf(instanceId) < section.activity_ids.length - 1}
                                showReorderButtons={true}
                                onNoteCreated={onNoteCreated}
                                sessionId={sessionId}
                                allNotes={allNotes}
                                onAddNote={onAddNote}
                                onUpdateNote={onUpdateNote}
                                onDeleteNote={onDeleteNote}
                                onOpenGoals={onOpenGoals}
                                isDragging={isDragging}
                            />
                        </div>
                    );
                })}

                {/* Drop Zone Indicator */}
                {isDragOver && draggedItem && (
                    <div className={styles.dropZoneIndicator}>
                        Drop "{draggedItem.activityName}" here
                    </div>
                )}

                {/* Add Activity Button / Selector */}
                {showActivitySelector ? (
                    <div className={styles.activitySelector}>
                        <div className={styles.selectorHeader}>
                            <span className={styles.selectorTitle}>
                                {viewGroupId === null ? 'Select Activity Group' :
                                    viewGroupId === 'ungrouped' ? 'Ungrouped Activities' :
                                        groupMap[viewGroupId]?.name || 'Group Activities'}
                            </span>
                            <div className={styles.selectorActions}>
                                {viewGroupId !== null && (
                                    <button
                                        onClick={() => setViewGroupId(null)}
                                        className={styles.backButton}
                                    >
                                        ← Back
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        onToggleActivitySelector(false);
                                        setViewGroupId(null); // Reset on close
                                    }}
                                    className={styles.closeButton}
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {/* Hierarchical View */}
                        {viewGroupId === null ? (
                            /* LEVEL 1: GROUPS */
                            <div className={styles.groupsGrid}>
                                {/* Group Cards */}
                                {Object.entries(groupedActivities).map(([groupId, groupActivities]) => {
                                    const group = groupMap[groupId];
                                    if (!groupActivities.length) return null;
                                    return (
                                        <button
                                            key={groupId}
                                            onClick={() => setViewGroupId(groupId)}
                                            className={styles.groupCard}
                                        >
                                            <div className={styles.groupCardName}>{group?.name || 'Unknown'}</div>
                                            <div className={styles.groupCardCount}>{groupActivities.length} activities</div>
                                        </button>
                                    );
                                })}

                                {/* Ungrouped Card */}
                                {ungroupedActivities.length > 0 && (
                                    <button
                                        onClick={() => setViewGroupId('ungrouped')}
                                        className={styles.ungroupedCard}
                                    >
                                        <div className={styles.ungroupedCardName}>Ungrouped</div>
                                        <div className={styles.groupCardCount}>{ungroupedActivities.length} activities</div>
                                    </button>
                                )}
                            </div>
                        ) : (
                            /* LEVEL 2: ACTIVITIES */
                            <div className={styles.activitiesList}>
                                {(viewGroupId === 'ungrouped' ? ungroupedActivities : groupedActivities[viewGroupId] || []).map(act => (
                                    <button
                                        key={act.id}
                                        onClick={() => onAddActivity(sectionIndex, act.id)}
                                        className={styles.activityButton}
                                    >
                                        <span>+</span> {act.name}
                                    </button>
                                ))}
                                {(!groupedActivities[viewGroupId] && viewGroupId !== 'ungrouped' && (
                                    <div className={styles.noActivitiesMessage}>No activities found in this group.</div>
                                ))}
                            </div>
                        )}

                        {/* Actions Footer (only on root) */}
                        {viewGroupId === null && (
                            <>
                                <div className={styles.selectorDivider}></div>
                                <button
                                    onClick={() => onOpenActivityBuilder(sectionIndex)}
                                    className={styles.createActivityButton}
                                >
                                    + Create New Activity Definition
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => onToggleActivitySelector(true)}
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
