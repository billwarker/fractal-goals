import React, { useState } from 'react';

import GoalIcon from '../atoms/GoalIcon';
import { getTypeDisplayName } from '../../utils/goalHelpers';
import styles from '../GoalDetailModal.module.css';

// Converts a level's display name (e.g. "Long Term Goal") to the canonical type
// string used by GoalLevelsContext (e.g. "LongTermGoal").
const toCanonicalType = (levelName) => levelName?.replace(/\s+/g, '') ?? null;

/** Options → Convert Level: pick an eligible level, then confirm. */
export default function GoalConvertSubView({
    currentLevelId,
    eligibleLevels,
    loading,
    getGoalColor,
    getGoalSecondaryColor,
    getGoalIcon,
    onBack,
    onSelect,
}) {
    const [pendingLevelId, setPendingLevelId] = useState(null);

    const pendingLevel = pendingLevelId
        ? eligibleLevels.find((l) => l.id === pendingLevelId)
        : null;

    if (pendingLevel) {
        const canonicalType = toCanonicalType(pendingLevel.name);
        const color = getGoalColor(canonicalType);
        const secondaryColor = getGoalSecondaryColor(canonicalType);
        const icon = getGoalIcon(canonicalType);
        return (
            <div className={styles.optionsSubView}>
                <button
                    type="button"
                    onClick={() => setPendingLevelId(null)}
                    className={styles.optionsBackButton}
                >
                    ← Back
                </button>
                <div className={styles.optionsSectionHeader}>Confirm Conversion</div>
                <div className={styles.optionsSectionHint}>
                    This will change the goal&apos;s level. Any children will remain at their current levels.
                </div>
                <div className={styles.levelPickerGrid} style={{ marginTop: 8 }}>
                    <button
                        type="button"
                        disabled
                        className={styles.levelPickerOption}
                        style={{ borderColor: color, color, opacity: 1, cursor: 'default' }}
                    >
                        <GoalIcon shape={icon} color={color} secondaryColor={secondaryColor} size={20} />
                        {getTypeDisplayName(canonicalType)}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => onSelect(pendingLevelId)}
                    disabled={loading}
                    className={styles.btnAction}
                    style={{
                        marginTop: 12,
                        background: color,
                        color: 'white',
                        border: 'none',
                        fontWeight: 'bold',
                        opacity: loading ? 0.6 : 1,
                    }}
                >
                    {loading ? 'Converting...' : 'Confirm Convert'}
                </button>
            </div>
        );
    }

    return (
        <div className={styles.optionsSubView}>
            <button
                type="button"
                onClick={onBack}
                className={styles.optionsBackButton}
            >
                ← Back
            </button>

            <div className={styles.optionsSectionHeader}>Convert Level</div>
            <div className={styles.optionsSectionHint}>
                Compatible levels only. The fractal root tier is excluded.
            </div>

            {eligibleLevels.length === 0 ? (
                <div className={styles.optionsEmptyState}>
                    No compatible level conversions are available right now.
                </div>
            ) : (
                <div className={styles.levelPickerGrid}>
                    {eligibleLevels.map((level) => {
                        const isCurrent = level.id === currentLevelId;
                        const canonicalType = toCanonicalType(level.name);
                        const color = getGoalColor(canonicalType);
                        const secondaryColor = getGoalSecondaryColor(canonicalType);
                        const icon = getGoalIcon(canonicalType);
                        return (
                            <button
                                key={level.id}
                                type="button"
                                onClick={() => setPendingLevelId(level.id)}
                                disabled={loading || isCurrent}
                                className={styles.levelPickerOption}
                                style={{
                                    borderColor: color,
                                    color: color,
                                    opacity: loading || isCurrent ? 0.5 : 1,
                                    cursor: isCurrent ? 'default' : 'pointer',
                                }}
                            >
                                <GoalIcon shape={icon} color={color} secondaryColor={secondaryColor} size={20} />
                                {getTypeDisplayName(canonicalType)}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
