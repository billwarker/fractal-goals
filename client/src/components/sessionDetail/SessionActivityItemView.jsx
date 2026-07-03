import { logError } from '../../utils/logger';
import { formatForInput, localToISO } from '../../utils/dateUtils';
import { formatAggValue } from '../../utils/progressAggregations';
import { formatDuration } from '../../utils/sessionActivityMetrics';
import ActivityCompletionButton from '../common/ActivityCompletionButton';
import Linkify from '../atoms/Linkify';
import CloseIcon from '../atoms/CloseIcon';
import { DeletedBadge } from '../ui/DeletedEntityFallback';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import SessionActivityProgressSummary, { SummaryDelta } from './SessionActivityProgressSummary';
import styles from './SessionActivityItem.module.css';

function SessionActivityItemView({
    handleActivityCardClick,
    isSelected,
    isDragging,
    showReorderButtons,
    onReorder,
    canMoveUp,
    canMoveDown,
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
    return (
        <div
            onClick={handleActivityCardClick}
            className={`${styles.activityCard} ${isSelected ? styles.activityCardSelected : ''} ${isDragging ? styles.activityCardDragging : ''}`}
        >
            <div className={styles.activityHeader}>
                <div className={styles.activityHeaderLeft}>
                    {/* Reorder Buttons */}
                    {showReorderButtons && (
                        <div className={styles.reorderButtons}>
                            <button
                                onClick={() => onReorder('up')}
                                disabled={!canMoveUp}
                                className={`${styles.reorderButton} ${!canMoveUp ? styles.reorderButtonDisabled : ''}`}
                                title="Move up"
                            >
                                ▲
                            </button>
                            <button
                                onClick={() => onReorder('down')}
                                disabled={!canMoveDown}
                                className={`${styles.reorderButton} ${!canMoveDown ? styles.reorderButtonDisabled : ''}`}
                                title="Move down"
                            >
                                ▼
                            </button>
                        </div>
                    )}
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            // Clicking on activity name/header clears set selection
                            setSelectedSetIndex(null);
                            if (onFocus) onFocus(exercise, null);
                        }}
                        className={styles.activityNameContainer}
                    >
                        <div className={`${styles.activityName} ${styles.activityNameFlex}`}>
                            <span className={styles.activityNameFlex}>
                                {def.name}
                                {!activityDefinition && <DeletedBadge />}
                            </span>
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
                                    ✎
                                </button>
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

                <div className={styles.activityHeaderRight}>
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
                            <div className={styles.timerControlsGrid}>
                                <div className={styles.timerMetaColumn}>
                                    {/* DateTime Start Field */}
                                    <div className={styles.timerFieldContainer}>
                                        <label className={styles.timerLabel}>Start</label>
                                        <input
                                            type="text"
                                            placeholder="YYYY-MM-DD HH:MM:SS"
                                            value={localStartTime}
                                            onChange={(e) => setStartTimeDraft(e.target.value)}
                                            onBlur={(e) => {
                                                if (e.target.value) {
                                                    try {
                                                        const isoValue = localToISO(e.target.value, timezone);
                                                        onUpdate('time_start', isoValue);
                                                        setStartTimeDraft(null);
                                                    } catch (err) {
                                                        logError('Invalid date format:', err);
                                                        setStartTimeDraft(null);
                                                    }
                                                } else {
                                                    onUpdate('time_start', null);
                                                    setStartTimeDraft(null);
                                                }
                                            }}
                                            className={styles.timerInput}
                                        />
                                    </div>

                                    {/* DateTime Stop Field */}
                                    <div className={styles.timerFieldContainer}>
                                        <label className={styles.timerLabel}>Stop</label>
                                        <input
                                            type="text"
                                            placeholder="YYYY-MM-DD HH:MM:SS"
                                            value={localStopTime}
                                            onChange={(e) => setStopTimeDraft(e.target.value)}
                                            onBlur={(e) => {
                                                if (e.target.value) {
                                                    try {
                                                        const isoValue = localToISO(e.target.value, timezone);
                                                        onUpdate('time_stop', isoValue);
                                                        setStopTimeDraft(null);
                                                    } catch (err) {
                                                        logError('Invalid date format:', err);
                                                        setStopTimeDraft(null);
                                                    }
                                                } else {
                                                    onUpdate('time_stop', null);
                                                    setStopTimeDraft(null);
                                                }
                                            }}
                                            disabled={!exercise.time_start}
                                            className={`${styles.timerInput} ${!exercise.time_start ? styles.timerInputDisabled : ''}`}
                                        />
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
                                </div>

                                <div className={styles.timerActionColumn}>
                                    {!exercise.time_start ? (
                                        <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    autoCompletedRef.current = false;
                                                    const extras = {};
                                                    if (hasTargetDurationInput && !parsedTargetDuration) {
                                                        setTargetDurationError('Use MM:SS, seconds 00-59');
                                                        return;
                                                    }
                                                    if (parsedTargetDuration) {
                                                        extras.target_duration_seconds = parsedTargetDuration;
                                                    }
                                                    onUpdate('timer_action', 'start', extras);
                                                }}
                                                className={styles.startButton}
                                                title="Start timer"
                                            >
                                                ▶ Start
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdate('timer_action', 'complete');
                                                }}
                                                className={styles.completeButton}
                                                title="Instant complete (0s duration)"
                                            >
                                                ✓ Complete
                                            </button>
                                        </>
                                    ) : !exercise.time_stop ? (
                                        <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdate('timer_action', 'complete');
                                                }}
                                                className={styles.completeButton}
                                                title="Complete activity"
                                            >
                                                ✓ Complete
                                            </button>
                                            <button
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
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className={styles.completedBadge} title={`Completed at ${formatForInput(exercise.time_stop, timezone)}`}>
                                                Completed
                                            </div>
                                            <button
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
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Delete Button */}
                {!quickMode && (
                    <button onClick={onDelete} className={styles.deleteButton} aria-label="Delete activity">
                        <CloseIcon size={14} />
                    </button>
                )}
            </div>

            {/* Content Area */}
            <div className={styles.contentArea}>

                {/* SETS VIEW */}
                {hasSets ? (
                    <div>
                        <div className={styles.setsContainer}>
                            {exercise.sets?.map((set, setIdx) => (
                                <div
                                    key={set.instance_id}
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
                                                        if (val && isNextSetEmpty(setIdx, m.id, splitId)) {
                                                            const key = splitId ? `${splitId}-${m.id}` : m.id;
                                                            buttons.push(
                                                                <button
                                                                    key={key}
                                                                    className={styles.cascadeButton}
                                                                    onClick={() => handleCascade(m.id, val, splitId, setIdx)}
                                                                    title={`Copy ${val} ${m.unit || ''} to subsequent empty sets`}
                                                                >
                                                                    Cascade {m.unit || 'Value'}
                                                                </button>
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

                                    <button onClick={() => handleRemoveSet(setIdx)} className={styles.removeSetButton} aria-label="Remove set">
                                        <CloseIcon size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={handleAddSet}
                            className={styles.addSetButton}
                        >
                            + Add Set
                        </button>
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

        </div>
    );
}

export default SessionActivityItemView;
