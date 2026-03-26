import React, { useMemo, useState } from 'react';
import SessionActivityItem from './SessionActivityItem';
import styles from './SessionSection.module.css';
import { Heading } from '../atoms/Typography';
import MetaField from '../common/MetaField';
import SectionHeader from '../common/SectionHeader';
import { useActiveSessionActions, useActiveSessionData, useActiveSessionUi } from '../../contexts/ActiveSessionContext';
import useIsMobile from '../../hooks/useIsMobile';
import ActivitySelectorPanel from '../common/ActivitySelectorPanel';
import ActivityModeSelector from '../common/ActivityModeSelector';
import { prepareActivityDefinitionCopy } from '../../utils/activityBuilder';
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
        rootId,
        activityInstances,
        activities,
        activityGroups,
        instancesLoading,
        session
    } = useActiveSessionData();

    const isCompleted = session?.completed || session?.attributes?.completed;

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

    const [isDragOver, setIsDragOver] = useState(false);
    const [selectedModeIds, setSelectedModeIds] = useState([]);
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
        setSelectedModeIds([]);
    };

    const openActivityBuilder = (activityDefinition = null) => {
        closeSelector();
        onOpenActivityBuilder(sectionIndex, activityDefinition);
    };

    const handleCreateActivityDefinition = () => {
        openActivityBuilder();
    };

    const selectorContent = (
        <>
            <div className={styles.modeSelectorWrap}>
                <div className={styles.modeSelectorLabel}>Modes for the next activity</div>
                <ActivityModeSelector
                    rootId={rootId}
                    selectedModeIds={selectedModeIds}
                    onChange={setSelectedModeIds}
                />
            </div>
            <ActivitySelectorPanel
                activities={activities}
                activityGroups={activityGroups}
                onClose={closeSelector}
                onSelectActivity={(activity) => addActivity(sectionIndex, activity.id, activity, selectedModeIds)}
                onCreateActivityDefinition={handleCreateActivityDefinition}
                onCopyActivityDefinition={(activity) => openActivityBuilder(prepareActivityDefinitionCopy(activity))}
                allowCreate={true}
                allowCopy={true}
            />
        </>
    );

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`${styles.sectionContainer} ${isDragOver ? styles.sectionContainerDragOver : ''}`}
        >
            <SectionHeader
                className={styles.sectionHeader}
                title={(
                    <Heading level={3} className={styles.sectionTitle}>
                        {section.name || `Section ${sectionIndex + 1}`}
                    </Heading>
                )}
                meta={(
                    <MetaField
                        className={styles.sectionDurationField}
                        label="Duration"
                        value={(
                            <span className={styles.sectionDuration}>
                                <span className={styles.durationValue}>
                                    {formatClockDuration(calculateSectionDurationFromInstanceIds(section, activityInstances))}
                                </span>
                                <span className={styles.durationPlanned}>
                                    (planned: {section.estimated_duration_minutes || '—'} min)
                                </span>
                            </span>
                        )}
                    />
                )}
            />

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
                {!isCompleted && (
                    isSelectorOpen ? (
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
                    )
                )}
            </div>
        </div>
    );
};

export default SessionSection;
