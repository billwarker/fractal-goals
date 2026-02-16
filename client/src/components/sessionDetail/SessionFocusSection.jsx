import React from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { parseTargets, formatTargetDescription } from '../../utils/goalUtils';
import styles from './GoalsPanel.module.css';

function SessionFocusSection({
    loading,
    microGoals,
    microChars,
    nanoChars,
    completedColor,
    completedSecondaryColor,
    getGoalColor,
    getGoalSecondaryColor,
    handleToggleCompletion,
    onGoalClick,
    achievedTargetIds,
    handleCreateNanoGoal,
    handleCreateMicroGoalWithTarget,
    showIGCreator,
    igName,
    setIGName,
    igParentId,
    setIGParentId,
    allShortTermGoals,
    handleCreateImmediateGoal,
    igCreating,
    setShowIGCreator
}) {
    return (
        <div className={styles.focusSection}>
            <div className={styles.sectionHeader}>Session Focus</div>

            {loading && <div className={styles.loadingText}>Loading...</div>}

            {microGoals.map(micro => {
                const microTargets = parseTargets(micro);
                return (
                    <div key={micro.id} className={styles.microGoalRow}>
                        <div className={styles.microGoalHeader}>
                            <GoalIcon
                                shape={microChars.icon || 'circle'}
                                color={micro.completed ? completedColor : getGoalColor('MicroGoal')}
                                secondaryColor={micro.completed ? completedSecondaryColor : getGoalSecondaryColor('MicroGoal')}
                                isSmart={micro.is_smart}
                                size={18}
                            />
                            <input
                                type="checkbox"
                                className={styles.microGoalCheckbox}
                                checked={micro.completed || false}
                                onChange={(e) => handleToggleCompletion(micro, e.target.checked)}
                            />
                            <span
                                className={`${styles.microGoalName} ${micro.completed ? styles.completedText : ''}`}
                                onClick={() => onGoalClick && onGoalClick(micro)}
                            >
                                {micro.name}
                            </span>
                        </div>

                        {/* Target affordance: show current targets or invite to add */}
                        <div className={styles.microTargetArea}>
                            {microTargets.length > 0 ? (
                                <div className={styles.microTargetList}>
                                    {microTargets.map(t => {
                                        const isAchieved = achievedTargetIds?.has(t.id);
                                        return (
                                            <span key={t.id} className={`${styles.microTargetChip} ${isAchieved ? styles.microTargetDone : ''}`}>
                                                {isAchieved ? '✓' : '○'} {t.name || formatTargetDescription(t)}
                                            </span>
                                        );
                                    })}
                                </div>
                            ) : (
                                <button
                                    className={styles.addTargetLink}
                                    onClick={() => onGoalClick && onGoalClick(micro)}
                                >
                                    + Set target
                                </button>
                            )}
                        </div>

                        {/* Nano Goals */}
                        <div className={styles.nanoGoalsContainer}>
                            {micro.children?.map(nano => (
                                <div key={nano.id} className={styles.nanoGoalRow}>
                                    <GoalIcon
                                        shape={nanoChars.icon || 'star'}
                                        color={nano.completed ? completedColor : getGoalColor('NanoGoal')}
                                        secondaryColor={nano.completed ? completedSecondaryColor : getGoalSecondaryColor('NanoGoal')}
                                        isSmart={false}
                                        size={14}
                                    />
                                    <input
                                        type="checkbox"
                                        className={styles.nanoGoalCheckbox}
                                        checked={nano.completed || false}
                                        onChange={(e) => handleToggleCompletion(nano, e.target.checked)}
                                    />
                                    <span className={`${styles.nanoGoalName} ${nano.completed ? styles.completedText : ''}`}>
                                        {nano.name}
                                    </span>
                                </div>
                            ))}
                            <input
                                type="text"
                                className={styles.nanoQuickAdd}
                                placeholder="Add a cue / sub-step..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.target.value.trim()) {
                                        handleCreateNanoGoal(micro.id, e.target.value.trim());
                                        e.target.value = '';
                                    }
                                }}
                            />
                        </div>
                    </div>
                );
            })}

            <div className={styles.microQuickAddContainer}>
                <input
                    type="text"
                    className={styles.microQuickAdd}
                    placeholder="+ Add session focus..."
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                            handleCreateMicroGoalWithTarget(e.target.value.trim());
                            e.target.value = '';
                        }
                    }}
                />
            </div>

            {/* Inline IG Creator */}
            {showIGCreator && (
                <div className={styles.igCreator}>
                    <div className={styles.igCreatorHeader}>
                        <span>⚠️</span>
                        <span>No Immediate Goal linked. Create one to parent your Micro Goals:</span>
                    </div>
                    <input
                        type="text"
                        className={styles.igCreatorInput}
                        placeholder="Immediate Goal name..."
                        value={igName}
                        onChange={(e) => setIGName(e.target.value)}
                        autoFocus
                    />
                    <div className={styles.igCreatorField}>
                        <label className={styles.igCreatorLabel}>Parent (Short-Term Goal):</label>
                        <select
                            className={styles.igCreatorSelect}
                            value={igParentId}
                            onChange={(e) => setIGParentId(e.target.value)}
                        >
                            <option value="">Select a Short-Term Goal...</option>
                            {allShortTermGoals.map(stg => (
                                <option key={stg.id} value={stg.id}>{stg.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.igCreatorActions}>
                        <button
                            className={styles.igCreatorSubmit}
                            onClick={handleCreateImmediateGoal}
                            disabled={igCreating || !igName.trim() || !igParentId}
                        >
                            {igCreating ? 'Creating...' : 'Create & Continue'}
                        </button>
                        <button
                            className={styles.igCreatorCancel}
                            onClick={() => setShowIGCreator(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SessionFocusSection;
