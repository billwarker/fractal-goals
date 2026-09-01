import { useState } from 'react';
import { createPortal } from 'react-dom';
import useAnchoredMenuController from '../../hooks/useAnchoredMenuController';
import { formatForInput, localToISO, validateTimerRange } from '../../utils/dateUtils';
import { formatAggValue } from '../../utils/progressAggregations';
import { formatDuration, isMetricValueEmpty } from '../../utils/sessionActivityMetrics';
import Button from '../atoms/Button';
import ActivityCompletionButton from '../common/ActivityCompletionButton';
import MetricCascadeButton from '../common/MetricCascadeButton';
import { EditPencilIcon, PlayIcon } from '../atoms/AppIcons';
import DropdownMenu, { DropdownMenuItem } from '../atoms/DropdownMenu';
import Linkify from '../atoms/Linkify';
import CloseIcon from '../atoms/CloseIcon';
import RemoveButton from '../atoms/RemoveButton';
import { DeletedBadge } from '../ui/DeletedEntityFallback';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import SessionActivityProgressSummary, { SummaryDelta } from './SessionActivityProgressSummary';
import TimerConflictAction, { startTimerWithConflict } from './TimerConflictAction';
import useRelativeTimeAdjustment from './useRelativeTimeAdjustment';
import ActivityTagEditor from './ActivityTagEditor';
import {
    SessionItemCard,
    SessionItemHeader,
    SessionItemHeaderLeft,
    SessionItemHeaderRight,
    SessionItemOrderRail,
    SessionItemTimerActions,
    SessionItemTimerControls,
    SessionItemTimerMeta,
} from './SessionItemCardPrimitives';
import styles from './SessionActivityItem.module.css';

function SessionActivityItemView({
    rootId,
    handleActivityCardClick,
    isSelected,
    isDragging,
    showReorderButtons,
    onReorder,
    canMoveUp,
    canMoveDown,
    sessionIndex,
    setSelectedSetIndex,
    onFocus,
    exercise,
    def,
    activityDefinition,
    onOpenActivityBuilder,
    groupLabel,
    averageDuration,
    quickMode,
    onUpdate,
    onDuplicate,
    onClearValues,
    onCopyPreviousValues,
    showCopyPreviousValuesOption = false,
    copyPreviousValuesDisabled = false,
    copyPreviousValuesLabel = 'Copy values from previous instance',
    localStartTime,
    setStartTimeDraft,
    timezone,
    localStopTime,
    setStopTimeDraft,
    targetDurationInput,
    setTargetDurationInput,
    setTargetDurationError,
    targetDurationError,
    countdownPreview,
    isCountingDown,
    countdownRemaining,
    displayedDuration,
    isRunning,
    autoCompletedRef,
    hasTargetDurationInput,
    parsedTargetDuration,
    onDelete,
    hasSets,
    selectedSetIndex,
    bestSetIndex,
    hasMetrics,
    hasSplits,
    renderMetricEditor,
    renderMetricProgress,
    getSetMetricDisplayValue,
    hasSetMetricDraft,
    handleSetMetricDraftChange,
    commitSetMetricInput,
    getMetricValue,
    isNextSetEmpty,
    handleCascade,
    yieldBySetIndex,
    activeProgress,
    prevYieldBySetIndex,
    deltaDisplayMode,
    handleRemoveSet,
    handleAddSet,
    getSingleMetricDisplayValue,
    hasSingleMetricDraft,
    handleSingleMetricDraftChange,
    commitSingleMetricInput,
    activityNotes,
    onUpdateNote,
    onDeleteNote,
    handleAddNote,
}) {
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [timerConflictExtras, setTimerConflictExtras] = useState(null);
    const [timeInputErrors, setTimeInputErrors] = useState({ start: '', stop: '' });
    const hasInstanceOptions = Boolean(onDuplicate || showCopyPreviousValuesOption || onClearValues || onDelete);
    const { anchorRef: optionsRef, menuRef: optionsMenuRef } = useAnchoredMenuController({
        open: isOptionsOpen,
        setOpen: setIsOptionsOpen,
        maxWidth: 240,
        estimatedHeight: 190,
    });

    const handleOptionAction = (event, action) => {
        event.stopPropagation();
        setIsOptionsOpen(false);
        action?.();
    };

    const getTimerRangeError = (target, isoValue) => {
        try {
            return validateTimerRange({
                target,
                candidateIso: isoValue,
                startIso: localStartTime ? localToISO(localStartTime, timezone) : null,
                stopIso: localStopTime ? localToISO(localStopTime, timezone) : null,
            });
        } catch {
            return '';
        }
    };

    const handleCommitTimeInput = async (event, target, field, setDraft) => {
        if (event.target.value) {
            let isoValue;
            try {
                isoValue = localToISO(event.target.value, timezone);
            } catch {
                setTimeInputErrors((current) => ({
                    ...current,
                    [target]: 'Use YYYY-MM-DD HH:MM:SS',
                }));
                return;
            }

            const rangeError = getTimerRangeError(target, isoValue);
            if (rangeError) {
                setTimeInputErrors((current) => ({ ...current, [target]: rangeError }));
                return;
            }

            try {
                const saved = await onUpdate(field, isoValue);
                if (saved?.error) throw saved.error;
                setDraft(null);
                setTimeInputErrors((current) => ({ ...current, [target]: '' }));
            } catch (error) {
                setTimeInputErrors((current) => ({
                    ...current,
                    [target]: error?.response?.data?.error
                        || error?.message
                        || 'Use YYYY-MM-DD HH:MM:SS',
                }));
            }
        } else {
            try {
                const saved = await onUpdate(field, null);
                if (saved?.error) throw saved.error;
                setDraft(null);
                setTimeInputErrors((current) => ({ ...current, [target]: '' }));
            } catch (error) {
                setTimeInputErrors((current) => ({
                    ...current,
                    [target]: error?.response?.data?.error || error?.message || 'Unable to save time',
                }));
            }
        }
    };

    const relativeTimeAdjustment = useRelativeTimeAdjustment({
        timezone,
        validate: getTimerRangeError,
        onApply: (target, isoValue) => onUpdate(
            target === 'start' ? 'time_start' : 'time_stop',
            isoValue,
        ),
    });

    return (
        <SessionItemCard
            onClick={handleActivityCardClick}
            isSelected={isSelected}
            isDragging={isDragging}
        >
            <SessionItemHeader>
                <SessionItemHeaderLeft>
                    <SessionItemOrderRail
                        showReorderButtons={showReorderButtons}
                        onReorder={onReorder}
                        canMoveUp={canMoveUp}
                        canMoveDown={canMoveDown}
                        sessionIndex={sessionIndex}
                    />
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            // Clicking on activity name/header clears set selection
                            setSelectedSetIndex(null);
                            if (onFocus) onFocus(exercise, null);
                        }}
                        className={styles.activityNameContainer}
                    >
                            <div className={styles.activityIdentityText}>
                                <div className={`${styles.activityName} ${styles.activityNameFlex}`}>
                                    <span className={styles.activityNameFlex}>
                                        {def.name}
                                        {!activityDefinition && <DeletedBadge />}
                                    </span>
                                    {(isSelected || (exercise.tags || []).length > 0) && (
                                        <div className={styles.activityHeaderActions}>
                                            {isSelected && onOpenActivityBuilder && activityDefinition?.id && (
                                                <button
                                                    type="button"
                                                    className={styles.editDefinitionButton}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onOpenActivityBuilder(activityDefinition);
                                                    }}
                                                    title="Edit activity definition"
                                                    aria-label={`Edit ${def.name}`}
                                                >
                                                    <EditPencilIcon size={14} />
                                                </button>
                                            )}
                                            {isSelected && hasInstanceOptions && (
                                                <div className={styles.instanceOptionsWrapper} ref={optionsRef}>
                                                    <button
                                                        type="button"
                                                        className={styles.editDefinitionButton}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setIsOptionsOpen((open) => !open);
                                                        }}
                                                        title="Activity options"
                                                        aria-label={`${def.name} options`}
                                                        aria-expanded={isOptionsOpen}
                                                        aria-haspopup="menu"
                                                    >
                                                        ···
                                                    </button>
                                                    {isOptionsOpen && createPortal(
                                                        <DropdownMenu
                                                            ref={optionsMenuRef}
                                                            className={styles.instanceOptionsMenu}
                                                            aria-label={`${def.name} activity options`}
                                                        >
                                                            {onDuplicate && (
                                                                <DropdownMenuItem
                                                                    onClick={(event) => handleOptionAction(event, onDuplicate)}
                                                                >
                                                                    Duplicate instance
                                                                </DropdownMenuItem>
                                                            )}
                                                            {showCopyPreviousValuesOption && (
                                                                <DropdownMenuItem
                                                                    disabled={copyPreviousValuesDisabled}
                                                                    onClick={(event) => handleOptionAction(event, onCopyPreviousValues)}
                                                                >
                                                                    {copyPreviousValuesLabel}
                                                                </DropdownMenuItem>
                                                            )}
                                                            {onClearValues && (
                                                                <DropdownMenuItem
                                                                    onClick={(event) => handleOptionAction(event, onClearValues)}
                                                                >
                                                                    Clear logged values
                                                                </DropdownMenuItem>
                                                            )}
                                                            {onDelete && !quickMode && (
                                                                <DropdownMenuItem
                                                                    danger
                                                                    onClick={(event) => handleOptionAction(event, onDelete)}
                                                                >
                                                                    Delete from session
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenu>,
                                                        document.body,
                                                    )}
                                                </div>
                                            )}
                                            {!quickMode && activityDefinition?.id && (
                                                <ActivityTagEditor
                                                    className={styles.headerScopeControl}
                                                    rootId={rootId}
                                                    activityId={activityDefinition.id}
                                                    instanceId={exercise.id}
                                                    assignmentVersion={exercise.tag_assignment_version}
                                                    availableTags={activityDefinition.tags || []}
                                                    tags={exercise.tags || []}
                                                    editable={isSelected}
                                                    triggerFirst
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                                {(groupLabel || averageDuration) && (
                                    <div className={styles.activityMetaLine}>
                                        {groupLabel && (
                                            <span className={styles.activityGroupLabel}>{groupLabel}</span>
                                        )}
                                        {groupLabel && averageDuration && (
                                            <span className={styles.activityMetaSeparator}>•</span>
                                        )}
                                        {averageDuration && (
                                            <span
                                                className={styles.activityAverage}
                                                title={`Average based on ${averageDuration.sampleCount} completed activity instances`}
                                            >
                                                Avg {averageDuration.label}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {def.description && (
                                    <div className={styles.activityDescription} title={def.description}>
                                        <Linkify
                                            className={styles.activityDescriptionContent}
                                            linkClassName={styles.activityDescriptionLink}
                                        >
                                            {def.description}
                                        </Linkify>
                                    </div>
                                )}
                            </div>
                    </div>
                </SessionItemHeaderLeft>

                <SessionItemHeaderRight>
                    {quickMode ? (
                        <div className={styles.actionStack}>
                            <div className={styles.quickModeStatus}>
                                <ActivityCompletionButton
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onUpdate('completed', !exercise.completed);
                                    }}
                                    completed={exercise.completed}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className={styles.actionStack}>
                            <SessionItemTimerControls>
                                <SessionItemTimerMeta>
                                    {/* DateTime Start Field */}
                                    <div className={styles.timerFieldContainer}>
                                        <div className={styles.timerLabelRow}>
                                            <label className={styles.timerLabel}>Start</label>
                                            {isSelected && exercise.time_start && (
                                                relativeTimeAdjustment.renderToggle('start')
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="YYYY-MM-DD HH:MM:SS"
                                            value={localStartTime}
                                            onChange={(e) => {
                                                setStartTimeDraft(e.target.value);
                                                setTimeInputErrors((current) => ({ ...current, start: '' }));
                                            }}
                                            onBlur={(e) => { void handleCommitTimeInput(e, 'start', 'time_start', setStartTimeDraft); }}
                                            className={`${styles.timerInput} ${timeInputErrors.start ? styles.timerInputError : ''}`}
                                        />
                                        {timeInputErrors.start && (
                                            <div className={styles.timerValidationError}>{timeInputErrors.start}</div>
                                        )}
                                        {relativeTimeAdjustment.renderPanel('start', localStartTime)}
                                    </div>

                                    {/* DateTime Stop Field */}
                                    <div className={styles.timerFieldContainer}>
                                        <div className={styles.timerLabelRow}>
                                            <label className={styles.timerLabel}>Stop</label>
                                            {isSelected && exercise.time_stop && (
                                                relativeTimeAdjustment.renderToggle('stop')
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="YYYY-MM-DD HH:MM:SS"
                                            value={localStopTime}
                                            onChange={(e) => {
                                                setStopTimeDraft(e.target.value);
                                                setTimeInputErrors((current) => ({ ...current, stop: '' }));
                                            }}
                                            onBlur={(e) => { void handleCommitTimeInput(e, 'stop', 'time_stop', setStopTimeDraft); }}
                                            disabled={!exercise.time_start}
                                            className={`${styles.timerInput} ${!exercise.time_start ? styles.timerInputDisabled : ''} ${timeInputErrors.stop ? styles.timerInputError : ''}`}
                                        />
                                        {timeInputErrors.stop && (
                                            <div className={styles.timerValidationError}>{timeInputErrors.stop}</div>
                                        )}
                                        {relativeTimeAdjustment.renderPanel('stop', localStopTime)}
                                    </div>

                                    {/* Duration Display / Pre-start target input */}
                                    <div className={styles.timerFieldContainer}>
                                        {!exercise.time_start ? (
                                            <>
                                                <label className={styles.timerLabel}>Duration</label>
                                                <input
                                                    type="text"
                                                    placeholder="MM:SS"
                                                    value={targetDurationInput}
                                                    onChange={(e) => {
                                                        setTargetDurationInput(e.target.value);
                                                        setTargetDurationError('');
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className={`${styles.timerInput} ${targetDurationError ? styles.timerInputError : ''}`}
                                                    title="Optional: set a target duration to enable countdown mode"
                                                />
                                                {targetDurationError && (
                                                    <div className={styles.timerValidationError}>{targetDurationError}</div>
                                                )}
                                                {countdownPreview && (
                                                    <div className={styles.timerModeHint}>{countdownPreview}</div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <label className={styles.timerLabel}>{isCountingDown ? 'Remaining' : 'Duration'}</label>
                                                <div
                                                    className={[
                                                        styles.durationDisplay,
                                                        isRunning ? styles.durationActive : styles.durationInactive,
                                                        isCountingDown && countdownRemaining <= 10 ? styles.durationCountdownAlert : '',
                                                    ].join(' ')}
                                                >{isCountingDown ? formatDuration(countdownRemaining) : formatDuration(displayedDuration)}</div>
                                            </>
                                        )}
                                    </div>
                                </SessionItemTimerMeta>

                                <SessionItemTimerActions>
                                    {!exercise.time_start ? (
                                        <>
                                            <Button
                                                unstyled
                                                onClick={(event) => startTimerWithConflict(event, {
                                                    autoCompletedRef, hasTargetDurationInput, parsedTargetDuration, onUpdate,
                                                    setError: setTargetDurationError, setConflict: setTimerConflictExtras,
                                                })}
                                                className={styles.startButton}
                                                title="Start timer"
                                            >
                                                <PlayIcon size={13} />
                                                <span>Start</span>
                                            </Button>
                                            <ActivityCompletionButton
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdate('timer_action', 'complete');
                                                }}
                                                className={styles.timerCompletionButton}
                                                size="sm"
                                                title="Instant complete (0s duration)"
                                            />
                                        </>
                                    ) : (!exercise.time_stop && !exercise.completed) ? (
                                        <>
                                            <Button
                                                unstyled
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    autoCompletedRef.current = false;
                                                    setTargetDurationInput('');
                                                    setTargetDurationError('');
                                                    onUpdate('timer_action', 'reset');
                                                }}
                                                className={styles.resetButton}
                                                title="Reset timer"
                                            >
                                                ↺ Reset
                                            </Button>
                                            <ActivityCompletionButton
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdate('timer_action', 'complete');
                                                }}
                                                className={styles.timerCompletionButton}
                                                size="sm"
                                                title="Complete activity"
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <Button
                                                unstyled
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    autoCompletedRef.current = false;
                                                    setTargetDurationInput('');
                                                    setTargetDurationError('');
                                                    onUpdate('timer_action', 'reset');
                                                }}
                                                className={styles.resetButton}
                                                title="Reset timer"
                                            >
                                                ↺ Reset
                                            </Button>
                                            <ActivityCompletionButton
                                                completed
                                                asStatus
                                                className={styles.timerCompletionButton}
                                                size="sm"
                                                title={exercise.time_stop
                                                    ? `Completed at ${formatForInput(exercise.time_stop, timezone)}`
                                                    : 'Completed'}
                                            />
                                        </>
                                    )}
                                </SessionItemTimerActions>
                            </SessionItemTimerControls>
                            {!exercise.time_start && (
                                <TimerConflictAction
                                    conflict={timerConflictExtras}
                                    onUpdate={onUpdate}
                                    onResolved={() => setTimerConflictExtras(null)}
                                />
                            )}
                        </div>
                    )}
                </SessionItemHeaderRight>

                {/* Delete Button */}
                {!quickMode && (
                    <RemoveButton
                        onClick={onDelete}
                        className={styles.deleteButton}
                        aria-label="Delete activity"
                    />
                )}
            </SessionItemHeader>

            {/* Content Area */}
            <div className={styles.contentArea}>

                {/* SETS VIEW */}
                {hasSets ? (
                    <div>
                        <div className={styles.setsContainer}>
                            {exercise.sets?.map((set, setIdx) => (
                                <div
                                    key={set.id || set.instance_id || `set-${setIdx}`}
                                    onClick={(e) => {
                                        e.stopPropagation(); // Prevent card click from firing
                                        const newSetIndex = selectedSetIndex === setIdx ? null : setIdx;
                                        setSelectedSetIndex(newSetIndex);
                                        // Notify parent of set selection change
                                        if (onFocus) onFocus(exercise, newSetIndex);
                                    }}
                                    className={`${styles.setRow} ${selectedSetIndex === setIdx ? styles.setRowSelected : ''} ${bestSetIndex === setIdx ? styles.setRowBestSet : ''}`}
                                >
                                    <div className={styles.setNumber}>#{setIdx + 1}</div>

                                    <div className={styles.setMetricsContent}>
                                        {hasMetrics && (
                                            hasSplits ? (
                                                // Render metrics grouped by split
                                                def.split_definitions.map(split => (
                                                    <div key={split.id} className={styles.splitContainer}>
                                                        <span className={styles.splitLabel}>{split.name}</span>
                                                        {def.metric_definitions.map(m => (
                                                            <div key={m.id} className={styles.metricInputContainer}>
                                                                <label className={styles.metricLabel}>{m.name}</label>
                                                                {renderMetricEditor({
                                                                    metricDef: m,
                                                                    value: getSetMetricDisplayValue(setIdx, set.metrics, m.id, split.id),
                                                                    isDraft: hasSetMetricDraft(setIdx, m.id, split.id),
                                                                    inputClassName: `${styles.metricInput} ${styles.metricInputSmall}`,
                                                                    metaClassName: styles.metricMeta,
                                                                    unitClassName: styles.metricUnit,
                                                                    onDraftChange: (value) => handleSetMetricDraftChange(setIdx, m.id, value, split.id),
                                                                    onCommit: (value) => commitSetMetricInput(setIdx, m, split.id, value),
                                                                    progress: renderMetricProgress(m.id, { setIndex: setIdx }),
                                                                })}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))
                                            ) : (
                                                // Render metrics without splits (original behavior)
                                                def.metric_definitions.map(m => (
                                                    <div key={m.id} className={styles.metricInputContainer}>
                                                        <label className={styles.metricLabelLarge}>{m.name}</label>
                                                        {renderMetricEditor({
                                                            metricDef: m,
                                                            value: getSetMetricDisplayValue(setIdx, set.metrics, m.id),
                                                            isDraft: hasSetMetricDraft(setIdx, m.id),
                                                            inputClassName: `${styles.metricInput} ${styles.metricInputLarge}`,
                                                            metaClassName: `${styles.metricMeta} ${styles.metricMetaLarge}`,
                                                            unitClassName: styles.metricUnitLarge,
                                                            onDraftChange: (value) => handleSetMetricDraftChange(setIdx, m.id, value),
                                                            onCommit: (value) => commitSetMetricInput(setIdx, m, null, value),
                                                            progress: renderMetricProgress(m.id, { setIndex: setIdx }),
                                                        })}
                                                    </div>
                                                ))
                                            )
                                        )}

                                        {/* Cascade Buttons Container */}
                                        {setIdx < exercise.sets.length - 1 && (
                                            <div className={styles.cascadeButtonsContainer}>
                                                {(() => {
                                                    const buttons = [];
                                                    const checkAndAddButton = (m, splitId = null) => {
                                                        const val = getMetricValue(set.metrics, m.id, splitId);
                                                        if (!isMetricValueEmpty(val) && isNextSetEmpty(setIdx, m.id, splitId)) {
                                                            const key = splitId ? `${splitId}-${m.id}` : m.id;
                                                            buttons.push(
                                                                <MetricCascadeButton
                                                                    key={key}
                                                                    value={val}
                                                                    unit={m.unit}
                                                                    destinationLabel="sets"
                                                                    onClick={() => handleCascade(m.id, val, splitId, setIdx)}
                                                                />
                                                            );
                                                        }
                                                    };
                                                    if (hasSplits) {
                                                        def.split_definitions.forEach(split => {
                                                            def.metric_definitions.forEach(m => checkAndAddButton(m, split.id));
                                                        });
                                                    } else {
                                                        def.metric_definitions.forEach(m => checkAndAddButton(m));
                                                    }
                                                    if (buttons.length === 0) return null;
                                                    return buttons;
                                                })()}
                                            </div>
                                        )}

                                    </div>

                                    {(yieldBySetIndex?.[setIdx] != null || (!quickMode && activityDefinition?.id && set.id)) && (
                                        <div className={styles.setTrailingControls}>
                                            {yieldBySetIndex?.[setIdx] != null && (
                                                <span className={styles.setYield}>
                                                    Yield: {formatAggValue(yieldBySetIndex[setIdx])}
                                                    {!activeProgress?.is_first_instance && prevYieldBySetIndex?.[setIdx] != null && (
                                                        <SummaryDelta
                                                            current={yieldBySetIndex[setIdx]}
                                                            previous={prevYieldBySetIndex[setIdx]}
                                                            higherIsBetter
                                                            styles={styles}
                                                            displayMode={deltaDisplayMode}
                                                        />
                                                    )}
                                                </span>
                                            )}

                                            {!quickMode && activityDefinition?.id && set.id ? (
                                                <div className={styles.setTagsSlot}>
                                                    <ActivityTagEditor
                                                        rootId={rootId}
                                                        activityId={activityDefinition.id}
                                                        setId={set.id}
                                                        assignmentVersion={set.tag_assignment_version}
                                                        availableTags={activityDefinition.tags || []}
                                                        tags={set.tags || []}
                                                        inheritedTags={set.inherited_tags ?? exercise.tags ?? []}
                                                        editable={isSelected && selectedSetIndex === setIdx}
                                                    />
                                                </div>
                                            ) : null}
                                        </div>
                                    )}

                                    <button onClick={() => handleRemoveSet(setIdx)} className={styles.removeSetButton} aria-label="Remove set">
                                        <CloseIcon size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleAddSet}
                            className={styles.addSetButton}
                        >
                            + Add Set
                        </Button>
                        <SessionActivityProgressSummary
                            sets={exercise.sets}
                            metricDefs={def.metric_definitions}
                            activeProgress={activeProgress}
                            displayMode={deltaDisplayMode}
                        />
                    </div>
                ) : (
                    /* SINGLE VIEW (NO SETS) */
                    hasMetrics ? (
                        hasSplits ? (
                            // Render metrics grouped by split in a grid
                            <div className={styles.singleMetricsContainerColumn}>
                                {def.split_definitions.map(split => (
                                    <div key={split.id} className={styles.singleMetricGroup}>
                                        <div className={styles.singleMetricGroupTitle}>{split.name}</div>
                                        <div className={styles.singleMetricGroupContent}>
                                            {def.metric_definitions.map(m => (
                                                <div key={m.id} className={styles.metricInputContainer}>
                                                    <label className={styles.metricLabelLarge}>{m.name}</label>
                                                    {renderMetricEditor({
                                                        metricDef: m,
                                                        value: getSingleMetricDisplayValue(exercise.metrics, m.id, split.id),
                                                        isDraft: hasSingleMetricDraft(m.id, split.id),
                                                        inputClassName: `${styles.metricInput} ${styles.metricInputLarge}`,
                                                        metaClassName: `${styles.metricMeta} ${styles.metricMetaLarge}`,
                                                        unitClassName: styles.metricUnitLarge,
                                                        onDraftChange: (value) => handleSingleMetricDraftChange(m.id, value, split.id),
                                                        onCommit: (value) => commitSingleMetricInput(m, split.id, value),
                                                        progress: renderMetricProgress(m.id),
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            // Render metrics without splits (original behavior)
                            <div className={styles.singleMetricsContainer}>
                                {def.metric_definitions.map(m => (
                                    <div key={m.id} className={styles.metricInputContainer}>
                                        <label className={styles.metricLabelLarge}>{m.name}</label>
                                        {renderMetricEditor({
                                            metricDef: m,
                                            value: getSingleMetricDisplayValue(exercise.metrics, m.id),
                                            isDraft: hasSingleMetricDraft(m.id),
                                            inputClassName: `${styles.metricInput} ${styles.metricInputLarge}`,
                                            metaClassName: `${styles.metricMeta} ${styles.metricMetaLarge}`,
                                            unitClassName: styles.metricUnitLarge,
                                            onDraftChange: (value) => handleSingleMetricDraftChange(m.id, value),
                                            onCommit: (value) => commitSingleMetricInput(m, null, value),
                                            progress: renderMetricProgress(m.id),
                                        })}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        <div className={styles.noMetricsMessage}>
                            {quickMode ? 'Mark this activity complete when finished.' : 'Track activity based on completion checkbox above.'}
                        </div>
                    )
                )}

                {!hasSets && (
                    <SessionActivityProgressSummary
                        sets={[]}
                        metricDefs={def.metric_definitions}
                        activeProgress={activeProgress}
                        displayMode={deltaDisplayMode}
                    />
                )}

                {/* Quick Note Add */}
                {/* Notes Section - Timeline + Quick Add */}
                {!quickMode && (
                    <div className={styles.notesSection}>
                        {activityNotes.length > 0 && (
                            <div className={styles.notesTimelineContainer}>
                                <NoteTimeline
                                    notes={activityNotes}
                                    onUpdate={onUpdateNote}
                                    onDelete={onDeleteNote}
                                    compact={false}
                                />
                            </div>
                        )}
                        <NoteQuickAdd
                            onSubmit={handleAddNote}
                            placeholder={selectedSetIndex !== null
                                ? `Note for Set #${selectedSetIndex + 1}...`
                                : "Add a note about this activity..."
                            }
                        />
                    </div>
                )}
            </div>

        </SessionItemCard>
    );
}

export default SessionActivityItemView;
