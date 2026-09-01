import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCircuitRunActions } from '../../hooks/useCircuitQueries';
import useAnchoredMenuController from '../../hooks/useAnchoredMenuController';
import { EditPencilIcon } from '../atoms/AppIcons';
import AddItemButton from '../atoms/AddItemButton';
import DropdownMenu, { DropdownMenuItem } from '../atoms/DropdownMenu';
import IconButton from '../atoms/IconButton';
import RemoveButton from '../atoms/RemoveButton';
import {
    SessionItemCard,
    SessionItemHeader,
    SessionItemHeaderLeft,
    SessionItemHeaderRight,
    SessionItemOrderRail,
} from '../sessionDetail/SessionItemCardPrimitives';
import activityStyles from '../sessionDetail/SessionActivityItem.module.css';
import CircuitMemberMetrics from './CircuitMemberMetrics';
import {
    CircuitMemberTagEditor,
    CircuitRoundTagControl,
    CircuitRunTagControl,
} from './CircuitTagControls';
import CircuitRunTimerControls from './CircuitRunTimerControls';
import CircuitRunNotes from './CircuitRunNotes';
import { canCascadeCircuitMetric } from './circuitMetricCascade';
import { handleCircuitSelectionKeyDown } from './circuitSelection';
import useCircuitRunDerivedState from './useCircuitRunDerivedState';
import styles from './CircuitRunCard.module.css';

const INITIAL_VISIBLE_ROUNDS = 10;

export default function CircuitRunCard({
    rootId,
    sessionId,
    run,
    itemNumber,
    activityInstances,
    activityDefinitions,
    onFocusActivity,
    selectedCircuitItem,
    onSelectCircuitItem,
    showReorderButtons = false,
    onReorder,
    canMoveUp = false,
    canMoveDown = false,
    onEditDefinition,
    onDuplicate,
    allNotes = [],
    onAddNote,
    onUpdateNote,
    onDeleteNote,
    onNoteCreated,
    disabled,
}) {
    const action = useCircuitRunActions(rootId, sessionId);
    const [error, setError] = useState('');
    const [visibleRoundCount, setVisibleRoundCount] = useState(INITIAL_VISIBLE_ROUNDS);
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const derived = useCircuitRunDerivedState({
        run,
        activityInstances,
        activityDefinitions,
        selectedCircuitItem,
        sessionId,
        allNotes,
    });

    const { anchorRef: optionsRef, menuRef: optionsMenuRef } = useAnchoredMenuController({
        open: isOptionsOpen,
        setOpen: setIsOptionsOpen,
        maxWidth: 240,
        estimatedHeight: 100,
    });

    const perform = async (payload) => {
        setError('');
        try {
            await action.mutateAsync({ ...payload, runId: run.id });
            return true;
        } catch (requestError) {
            const message = requestError?.response?.data?.error || requestError.message || 'Circuit action failed';
            if (payload.inlineError) return { error: message };
            setError(message);
            return false;
        }
    };

    const selectRun = (event) => {
        if (event.target.closest('button, input, textarea, select, a, [role="button"], [role="menu"]')) return;
        onSelectCircuitItem?.({ type: 'run', runId: run.id, id: run.id });
        onFocusActivity?.(null, null);
    };

    const selectRound = (event, roundId) => {
        if (event.target.closest('button, input, textarea, select, a, [role="button"], [role="menu"]')) return;
        event.stopPropagation();
        onSelectCircuitItem?.({ type: 'round', runId: run.id, id: roundId });
        onFocusActivity?.(null, null);
    };

    const selectMember = (event, member, instance, setIndex) => {
        event.stopPropagation();
        if (event.target.closest('button, input, textarea, select, a, [role="button"], [role="menu"]')) return;
        onSelectCircuitItem?.({
            type: 'member',
            runId: run.id,
            id: member.id,
            instanceId: instance?.id || null,
            setIndex,
        });
        if (instance) onFocusActivity?.(instance, setIndex);
    };

    const isRunSelected = selectedCircuitItem?.type === 'run'
        && selectedCircuitItem.runId === run.id;
    const rounds = run.rounds || [];
    const roundCount = run.round_count ?? rounds.length;
    const visibleRounds = rounds.slice(0, visibleRoundCount);
    const hiddenRoundBatchSize = Math.min(
        INITIAL_VISIBLE_ROUNDS,
        Math.max(0, rounds.length - visibleRoundCount),
    );
    const hasInstanceOptions = Boolean(onDuplicate || !disabled);
    const handleOptionAction = (event, action) => {
        event.stopPropagation();
        setIsOptionsOpen(false);
        action?.();
    };
    return (
        <SessionItemCard
            as="article"
            className={styles.card}
            data-session-circuit-card="true"
            isSelected={isRunSelected}
            onClick={selectRun}
            onKeyDown={(event) => handleCircuitSelectionKeyDown(event, selectRun)}
            role="group"
            tabIndex={0}
            aria-label={`Activity circuit ${run.name}`}
            aria-current={isRunSelected ? 'true' : undefined}
        >
            {!disabled && (
                <RemoveButton
                    className={styles.removeButton}
                    onClick={() => perform({ action: 'deleteRun' })}
                    disabled={action.isPending}
                    aria-label={`Delete circuit ${run.name}`}
                    title="Exit and delete circuit from session"
                />
            )}
            <SessionItemHeader className={styles.cardHeader}>
                <SessionItemHeaderLeft>
                    <SessionItemOrderRail
                        showReorderButtons={showReorderButtons}
                        onReorder={onReorder}
                        canMoveUp={canMoveUp}
                        canMoveDown={canMoveDown}
                        sessionIndex={itemNumber}
                    />
                    <div className={activityStyles.activityNameContainer}>
                        <div className={`${activityStyles.activityName} ${activityStyles.activityNameFlex}`}>
                            <span>{run.name}</span>
                            {(isRunSelected || (run.tags || []).length > 0) && (
                                <div className={activityStyles.activityHeaderActions}>
                                    {isRunSelected && onEditDefinition && (
                                        <IconButton
                                            size="sm"
                                            variant="subtle"
                                            className={activityStyles.editDefinitionButton}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onEditDefinition();
                                            }}
                                            title="Edit activity circuit"
                                            aria-label={`Edit ${run.name}`}
                                        >
                                            <EditPencilIcon size={14} />
                                        </IconButton>
                                    )}
                                    {isRunSelected && hasInstanceOptions && (
                                        <div className={activityStyles.instanceOptionsWrapper} ref={optionsRef}>
                                            <IconButton
                                                size="sm"
                                                variant="subtle"
                                                className={activityStyles.editDefinitionButton}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setIsOptionsOpen((open) => !open);
                                                }}
                                                title="Circuit options"
                                                aria-label={`${run.name} options`}
                                                aria-expanded={isOptionsOpen}
                                                aria-haspopup="menu"
                                            >
                                                ···
                                            </IconButton>
                                            {isOptionsOpen && createPortal(
                                                <DropdownMenu
                                                    ref={optionsMenuRef}
                                                    className={activityStyles.instanceOptionsMenu}
                                                    aria-label={`${run.name} circuit options`}
                                                >
                                                    {onDuplicate && (
                                                        <DropdownMenuItem
                                                            onClick={(event) => handleOptionAction(event, onDuplicate)}
                                                        >
                                                            Duplicate instance
                                                        </DropdownMenuItem>
                                                    )}
                                                    {!disabled && (
                                                        <DropdownMenuItem
                                                            danger
                                                            onClick={(event) => handleOptionAction(
                                                                event,
                                                                () => perform({ action: 'deleteRun' }),
                                                            )}
                                                        >
                                                            Delete from session
                                                        </DropdownMenuItem>
                                                    )}
                                                </DropdownMenu>,
                                                document.body,
                                            )}
                                        </div>
                                    )}
                                    <CircuitRunTagControl
                                        className={`${activityStyles.headerScopeControl} ${styles.runScopeControl}`}
                                        run={run}
                                        availableTags={derived.circuitAvailableTags}
                                        disabled={disabled}
                                        editable={isRunSelected}
                                        onPerform={perform}
                                    />
                                </div>
                            )}
                        </div>
                        <div className={activityStyles.activityMetaLine}>
                            <span>Circuit</span>
                            <span className={activityStyles.activityMetaSeparator}>•</span>
                            <span>{roundCount} {roundCount === 1 ? 'round' : 'rounds'}</span>
                        </div>
                        {run.description && <div className={activityStyles.activityDescription}>{run.description}</div>}
                    </div>
                </SessionItemHeaderLeft>
                <SessionItemHeaderRight>
                    <CircuitRunTimerControls
                        run={run}
                        disabled={disabled}
                        pending={action.isPending}
                        isSelected={isRunSelected}
                        onAction={perform}
                    />
                </SessionItemHeaderRight>
            </SessionItemHeader>

            <div className={styles.rounds} aria-label="Circuit rounds">
                    {visibleRounds.map((round) => {
                        const isRoundSelected = selectedCircuitItem?.type === 'round'
                            && selectedCircuitItem.runId === run.id
                            && selectedCircuitItem.id === round.id;
                        return (
                        <SessionItemCard
                            as="section"
                            key={round.id}
                            className={styles.round}
                            isSelected={isRoundSelected}
                            onClick={(event) => selectRound(event, round.id)}
                            onKeyDown={(event) => handleCircuitSelectionKeyDown(
                                event,
                                (selectionEvent) => selectRound(selectionEvent, round.id),
                            )}
                            role="group"
                            tabIndex={0}
                            aria-label={`Round ${round.round_number}`}
                            aria-current={isRoundSelected ? 'true' : undefined}
                            data-circuit-round-id={round.id}
                        >
                            <div className={styles.roundHeader}>
                                <div className={styles.roundIdentity}>
                                    <span className={styles.roundNumber}>#{round.round_number}</span>
                                    <div className={styles.roundTitle}><strong>Round {round.round_number}</strong></div>
                                </div>
                                <div className={styles.roundActions}>
                                    <CircuitRoundTagControl
                                        round={round}
                                        availableTags={derived.circuitAvailableTags}
                                        disabled={disabled}
                                        editable={isRoundSelected}
                                        onPerform={perform}
                                    />
                                    {!disabled && (
                                        <RemoveButton
                                            aria-label={`Remove round ${round.round_number}`}
                                            title={(run.rounds || []).length <= 1
                                                ? 'A circuit must keep at least one round'
                                                : `Remove round ${round.round_number}`}
                                            disabled={(run.rounds || []).length <= 1 || action.isPending}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                perform({ action: 'removeRound', roundId: round.id });
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                            <ol className={styles.members}>
                                {(round.members || []).map((member) => {
                                    const slot = derived.slotById.get(member.circuit_run_slot_id);
                                    const instanceId = member.activity_instance_id || slot?.activity_instance_id;
                                    const instance = derived.instanceById.get(instanceId);
                                    const currentDefinition = derived.definitionById.get(slot?.activity_definition_id);
                                    const definition = Array.isArray(slot?.activity_schema?.metric_definitions)
                                        ? slot.activity_schema
                                        : currentDefinition;
                                    const setIndex = slot?.has_sets ? round.round_number - 1 : null;
                                    const activitySet = slot?.has_sets
                                        ? (instance?.sets || []).find((set) => set.id === member.activity_set_id)
                                        : null;
                                    const metrics = member.metrics || activitySet?.metrics || instance?.metrics || [];
                                    const isMemberSelected = selectedCircuitItem?.type === 'member'
                                        && selectedCircuitItem.runId === run.id
                                        && selectedCircuitItem.id === member.id;
                                    const tagEditor = instance && currentDefinition ? (
                                        <CircuitMemberTagEditor
                                            rootId={rootId}
                                            definition={currentDefinition}
                                            instance={instance}
                                            activitySet={activitySet}
                                            runTags={run.tags}
                                            roundTags={round.tags}
                                            editable={isMemberSelected} />
                                    ) : null;
                                    return (
                                        <SessionItemCard
                                            as="li"
                                            key={member.id}
                                            className={styles.memberCard}
                                            isSelected={isMemberSelected}
                                            onClick={(event) => selectMember(event, member, instance, setIndex)}
                                            onKeyDown={(event) => handleCircuitSelectionKeyDown(
                                                event,
                                                (selectionEvent) => selectMember(
                                                    selectionEvent,
                                                    member,
                                                    instance,
                                                    setIndex,
                                                ),
                                            )}
                                            role="group"
                                            tabIndex={0}
                                            aria-label={`${round.round_number}.${member.sort_order + 1} ${slot?.activity_name || 'Activity'}`}
                                            aria-current={isMemberSelected ? 'true' : undefined}
                                            data-circuit-member-id={member.id}
                                        >
                                            <SessionItemHeader className={styles.memberHeader}>
                                                <SessionItemHeaderLeft>
                                                    <SessionItemOrderRail sessionIndex={`${round.round_number}.${member.sort_order + 1}`} />
                                                    <div
                                                        className={`${activityStyles.activityNameContainer} ${styles.memberIdentity}`}
                                                    >
                                                        <span className={`${activityStyles.activityName} ${styles.memberName}`}>
                                                            <span>{slot?.activity_name || 'Activity'}</span>
                                                            {instance?.progress_comparison?.included === false ? <span className={styles.memberExcluded}>Excluded</span> : null}
                                                        </span>
                                                    </div>
                                                </SessionItemHeaderLeft>
                                                {!activitySet && tagEditor ? (
                                                    <SessionItemHeaderRight>{tagEditor}</SessionItemHeaderRight>
                                                ) : null}
                                            </SessionItemHeader>
                                            {slot?.has_metrics && definition && (
                                                <CircuitMemberMetrics
                                                    memberId={member.id}
                                                    rootId={rootId}
                                                    definition={definition}
                                                    metrics={metrics}
                                                    disabled={disabled}
                                                    saving={action.isPending}
                                                    progress={{ comparison: instance?.progress_comparison, setIndex }}
                                                    onSave={(nextMetrics) => action.saveMemberMetrics
                                                        ? action.saveMemberMetrics({
                                                            runId: run.id,
                                                            memberId: member.id,
                                                            metrics: nextMetrics,
                                                        })
                                                        : perform({
                                                            action: 'updateMemberMetrics',
                                                            memberId: member.id,
                                                            value: nextMetrics,
                                                        })}
                                                    canCascade={(metricId, splitId) => canCascadeCircuitMetric(
                                                        rounds,
                                                        round.round_number,
                                                        member.circuit_run_slot_id,
                                                        metricId,
                                                        splitId,
                                                    )}
                                                    onCascade={(metricId, splitId) => perform({
                                                        action: 'cascadeMemberMetric',
                                                        memberId: member.id,
                                                        value: { metricId, splitId },
                                                    })}
                                                />
                                            )}
                                            {activitySet && tagEditor ? (
                                                <div className={styles.memberScopeControl}>{tagEditor}</div>
                                            ) : null}
                                        </SessionItemCard>
                                    );
                                })}
                            </ol>
                        </SessionItemCard>
                        );
                    })}
                    {visibleRoundCount < rounds.length && (
                        <AddItemButton
                            onClick={(event) => {
                                event.stopPropagation();
                                setVisibleRoundCount((count) => Math.min(count + INITIAL_VISIBLE_ROUNDS, rounds.length));
                            }}
                        >
                            Show {hiddenRoundBatchSize} more {hiddenRoundBatchSize === 1 ? 'round' : 'rounds'}
                        </AddItemButton>
                    )}
                    <CircuitRunNotes
                        notes={derived.circuitNotes}
                        noteTarget={derived.noteTarget}
                        onAddNote={onAddNote}
                        onUpdateNote={onUpdateNote}
                        onDeleteNote={onDeleteNote}
                        onNoteCreated={onNoteCreated}
                    />
                    {!disabled && (
                        <AddItemButton
                            onClick={(event) => {
                                event.stopPropagation();
                                perform({ action: 'addRound' });
                            }}
                            disabled={action.isPending}
                        >
                            + Add Round
                        </AddItemButton>
                    )}
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
        </SessionItemCard>
    );
}
