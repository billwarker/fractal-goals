import React, { useMemo, useState } from 'react';
import SessionActivityItem from './SessionActivityItem';
import styles from './SessionSection.module.css';
import { Heading } from '../atoms/Typography';
import MetaField from '../common/MetaField';
import SectionHeader from '../common/SectionHeader';
import { useActiveSessionActions, useActiveSessionData, useActiveSessionUi } from '../../contexts/ActiveSessionContext';
import useIsMobile from '../../hooks/useIsMobile';
import ModalBackdrop from '../atoms/ModalBackdrop';
import CircuitRunCard from '../circuits/CircuitRunCard';
import CircuitBuilderModal from '../circuits/CircuitBuilderModal';
import SessionAddActivityButton from './SessionAddActivityButton';
import SessionSectionActivitySelector from './SessionSectionActivitySelector';
import { useCircuitDefinitionMutations, useCircuits, useCreateCircuitRun } from '../../hooks/useCircuitQueries';

import { prepareActivityDefinitionCopy } from '../../utils/activityBuilder';
import { getAverageDurationStat } from '../../utils/durationStats';
import { calculateSectionDurationFromInstanceIds, formatClockDuration } from '../../utils/sessionTime';
import { buildDefinitionMap, buildInstanceMap, buildPositionMap, buildSessionPositionMap } from '../../utils/sessionSection';

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
    activityGoalScope = null,
}) => {
    const isMobile = useIsMobile();
    // Context
    const {
        activityInstances,
        activities,
        activityGroups,
        circuitRuns,
        instancesLoading,
        localSessionData,
        rootId,
        sessionId,
        session
    } = useActiveSessionData();
    const { data: circuitDefinitions = [] } = useCircuits(rootId);
    const createCircuitRun = useCreateCircuitRun(rootId, sessionId);
    const { updateMutation: updateCircuitDefinition } = useCircuitDefinitionMutations(rootId);

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
        duplicateActivityInstance,
        clearActivityInstanceValues,
        copyActivityValuesFromInstance,
        moveActivity,
        reorderActivity,
    } = useActiveSessionActions();

    const [isDragOver, setIsDragOver] = useState(false);
    const [circuitError, setCircuitError] = useState('');
    const [selectedCircuitItem, setSelectedCircuitItem] = useState(null);
    const [editingCircuit, setEditingCircuit] = useState(null);
    const instanceById = useMemo(() => {
        return buildInstanceMap(activityInstances || []);
    }, [activityInstances]);

    const definitionById = useMemo(() => {
        return buildDefinitionMap(activities || []);
    }, [activities]);
    const circuitRunById = useMemo(() => new Map(
        (circuitRuns || []).map((run) => [run.id, run]),
    ), [circuitRuns]);
    const orderedItems = useMemo(() => (
        Array.isArray(section.items)
            ? section.items
            : (section.activity_ids || []).map((activityInstanceId) => ({
                type: 'activity',
                activity_instance_id: activityInstanceId,
            }))
    ), [section.activity_ids, section.items]);

    const activityPositionById = useMemo(() => {
        return buildPositionMap(section.activity_ids || []);
    }, [section.activity_ids]);
    const sessionPositionById = useMemo(() => {
        const sections = Array.isArray(localSessionData?.sections) && localSessionData.sections.length > 0
            ? localSessionData.sections
            : [section];
        return buildSessionPositionMap(sections);
    }, [localSessionData, section]);
    const previousMatchingInstanceById = useMemo(() => {
        const orderedIds = (localSessionData?.sections || [])
            .flatMap((sessionSection) => sessionSection?.activity_ids || []);
        const effectiveOrderedIds = orderedIds.length > 0 ? orderedIds : (section.activity_ids || []);
        const latestByDefinitionId = new Map();
        const previousByInstanceId = new Map();

        effectiveOrderedIds.forEach((instanceId) => {
            const instance = instanceById.get(instanceId);
            const definitionId = instance?.activity_definition_id;
            if (!definitionId) return;
            previousByInstanceId.set(instanceId, latestByDefinitionId.get(definitionId) || null);
            latestByDefinitionId.set(definitionId, instanceId);
        });

        return previousByInstanceId;
    }, [instanceById, localSessionData?.sections, section.activity_ids]);
    const sectionAverage = useMemo(() => {
        const sectionStats = session?.stats?.template?.section_stats || {};
        const key = section?.template_section_id || section?.id || `legacy:${sectionIndex}:${String(section?.name || '').trim().toLowerCase()}`;
        return getAverageDurationStat(sectionStats[key]);
    }, [section, sectionIndex, session?.stats?.template?.section_stats]);
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

    const handleSectionClick = (event) => {
        if (!selectedActivityId && !selectedCircuitItem) return;
        if (event.target.closest('[data-session-activity-card="true"]')) return;
        if (event.target.closest('[data-session-circuit-card="true"]')) return;
        if (event.target.closest('button, input, textarea, select, a, [role="button"]')) return;
        setSelectedCircuitItem(null);
        onFocusActivity?.(null, null);
    };

    const isSelectorOpen = Boolean(showActivitySelector[sectionIndex]);
    const closeSelector = () => {
        setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: false }));
    };

    const openActivityBuilder = (activityDefinition = null, options = {}) => {
        closeSelector();
        if (Object.keys(options).length > 0) {
            onOpenActivityBuilder(sectionIndex, activityDefinition, options);
            return;
        }
        onOpenActivityBuilder(sectionIndex, activityDefinition);
    };

    const handleCreateActivityDefinition = () => {
        openActivityBuilder();
    };

    const addCircuit = async (definitionId) => {
        setCircuitError('');
        try {
            await createCircuitRun.mutateAsync({
                circuitDefinitionId: definitionId,
                sectionIndex,
            });
            closeSelector();
        } catch (error) {
            setCircuitError(error?.response?.data?.error || error.message || 'Unable to add circuit');
        }
    };

    const updateCircuit = async (payload) => {
        if (!editingCircuit) return;
        setCircuitError('');
        try {
            await updateCircuitDefinition.mutateAsync({
                circuitId: editingCircuit.id,
                data: payload,
            });
            setEditingCircuit(null);
        } catch (error) {
            setCircuitError(error?.response?.data?.error || error.message || 'Unable to update circuit');
        }
    };

    const selectorContent = (
        <SessionSectionActivitySelector
            activities={activities}
            circuitDefinitions={circuitDefinitions}
            activityGroups={activityGroups}
            activityGoalScope={activityGoalScope}
            onClose={closeSelector}
            onSelectActivity={(activity) => addActivity(sectionIndex, activity.id, activity)}
            onSelectCircuit={(circuit) => addCircuit(circuit.id)}
            onCreateActivityDefinition={handleCreateActivityDefinition}
            onCopyActivityDefinition={(activity) => openActivityBuilder(prepareActivityDefinitionCopy(activity))}
            initialBrowseGroupId={section.default_activity_group_id || null}
        />
    );

    return (
        <div
            onClick={handleSectionClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`${styles.sectionContainer} ${isDragOver ? styles.sectionContainerDragOver : ''}`}
        >
            <SectionHeader
                className={styles.sectionHeader}
                contentClassName={styles.sectionHeaderContent}
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
                                    {formatClockDuration(calculateSectionDurationFromInstanceIds(
                                        section,
                                        activityInstances,
                                        circuitRuns,
                                    ))}
                                </span>
                                {sectionAverage && (
                                    <span
                                        className={styles.durationPlanned}
                                        title={`Average based on ${sectionAverage.sampleCount} completed sessions`}
                                    >
                                        Avg {sectionAverage.label}
                                    </span>
                                )}
                            </span>
                        )}
                    />
                )}
            />

            <div className={styles.activitiesContainer}>
                {orderedItems.map((item, itemIndex) => {
                    if (item?.type === 'circuit') {
                        const run = circuitRunById.get(item.circuit_run_id);
                        if (!run) return null;
                        const circuitDefinition = circuitDefinitions.find(
                            (candidate) => candidate.id === run.circuit_definition_id,
                        );
                        const sessionPosition = sessionPositionById.get(`circuit:${run.id}`) ?? itemIndex;
                        return (
                            <CircuitRunCard
                                key={`circuit:${run.id}`}
                                rootId={rootId}
                                sessionId={sessionId}
                                run={run}
                                itemNumber={sessionPosition + 1}
                                activityInstances={activityInstances}
                                activityDefinitions={activities}
                                onFocusActivity={onFocusActivity}
                                selectedCircuitItem={selectedCircuitItem}
                                onSelectCircuitItem={setSelectedCircuitItem}
                                showReorderButtons
                                onReorder={(direction) => reorderActivity(sectionIndex, itemIndex, direction)}
                                canMoveUp={itemIndex > 0}
                                canMoveDown={itemIndex < orderedItems.length - 1}
                                onEditDefinition={circuitDefinition
                                    ? () => setEditingCircuit(circuitDefinition)
                                    : null}
                                onDuplicate={isCompleted ? null : async () => {
                                    setCircuitError('');
                                    try {
                                        await createCircuitRun.mutateAsync({
                                            circuitDefinitionId: run.circuit_definition_id,
                                            sectionIndex,
                                            itemIndex: itemIndex + 1,
                                        });
                                    } catch (error) {
                                        setCircuitError(
                                            error?.response?.data?.error
                                            || error.message
                                            || 'Unable to duplicate circuit',
                                        );
                                    }
                                }}
                                allNotes={allNotes}
                                onAddNote={onAddNote}
                                onUpdateNote={onUpdateNote}
                                onDeleteNote={onDeleteNote}
                                onNoteCreated={onNoteCreated}
                                disabled={isCompleted}
                            />
                        );
                    }
                    const instanceId = item?.activity_instance_id;
                    const instance = instanceById.get(instanceId);
                    if (!instance) return null;
                    const definition = definitionById.get(instance.activity_definition_id);
                    const isDragging = draggedItem?.instanceId === instanceId;
                    const position = activityPositionById.get(instanceId) ?? -1;
                    const sessionPosition = sessionPositionById.get(instanceId) ?? position;
                    const previousMatchingInstanceId = previousMatchingInstanceById.get(instanceId) || null;

                    return (
                        <div
                            key={instanceId}
                            data-session-activity-card="true"
                            data-session-activity-instance-id={instanceId}
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
                                onFocus={(instance, setIndex) => {
                                    setSelectedCircuitItem(null);
                                    onFocusActivity(instance, setIndex);
                                }}
                                isSelected={selectedActivityId === instanceId}
                                onReorder={(direction) => reorderActivity(sectionIndex, itemIndex, direction)}
                                canMoveUp={itemIndex > 0}
                                canMoveDown={itemIndex < orderedItems.length - 1}
                                showReorderButtons={true}
                                sessionIndex={sessionPosition >= 0 ? sessionPosition + 1 : null}
                                onDuplicate={() => duplicateActivityInstance(sectionIndex, instanceId, position)}
                                onClearValues={() => clearActivityInstanceValues(instanceId)}
                                onCopyPreviousValues={previousMatchingInstanceId
                                    ? () => copyActivityValuesFromInstance(instanceId, previousMatchingInstanceId)
                                    : null}
                                onNoteCreated={onNoteCreated}
                                allNotes={allNotes}
                                onAddNote={onAddNote}
                                onUpdateNote={onUpdateNote}
                                onDeleteNote={onDeleteNote}
                                onOpenGoals={onOpenGoals}
                                isDragging={isDragging}
                                activityDefinition={definition}
                                activityNotes={notesByInstanceId.get(instanceId) || []}
                                onOpenActivityBuilder={(activityDefinitionToEdit) => openActivityBuilder(activityDefinitionToEdit, { mode: 'edit' })}
                            />
                        </div>
                    );
                })}

                {instancesLoading && orderedItems.length === 0 && (
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

                {circuitError && <p className={styles.circuitError} role="alert">{circuitError}</p>}

                {/* Unified activity and circuit control */}
                {!isCompleted && (
                    isSelectorOpen ? (
                        isMobile ? (
                            <ModalBackdrop
                                className={styles.mobileSelectorOverlay}
                                onClose={closeSelector}
                                role="presentation"
                            >
                                <div className={styles.mobileSelectorSheet} onClick={(event) => event.stopPropagation()}>
                                    {selectorContent}
                                </div>
                            </ModalBackdrop>
                        ) : (
                            selectorContent
                        )
                    ) : (
                        <SessionAddActivityButton
                            activityGoalScope={activityGoalScope}
                            onClick={() => setShowActivitySelector(prev => ({ ...prev, [sectionIndex]: true }))}
                        />
                    )
                )}
            </div>
            {editingCircuit && (
                <CircuitBuilderModal
                    isOpen
                    circuit={editingCircuit}
                    activities={activities}
                    activityGroups={activityGroups}
                    onClose={() => setEditingCircuit(null)}
                    onSave={updateCircuit}
                    isSaving={updateCircuitDefinition.isPending}
                />
            )}
        </div>
    );
};

export default SessionSection;
