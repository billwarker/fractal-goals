import React from 'react';
import PropTypes from 'prop-types';

import { useActivityModes } from '../../hooks/useActivityQueries';
import styles from './ActivityModeSelector.module.css';

function isLightColor(color) {
    if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return false;
    }
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 160;
}

function ActivityModeSelector({
    rootId,
    selectedModeIds = [],
    onChange,
    disabled = false,
    showAllOption = false,
    allLabel = 'All',
    className = '',
}) {
    const { activityModes = [] } = useActivityModes(rootId);
    const selectedIds = Array.isArray(selectedModeIds) ? selectedModeIds : [];

    if (!activityModes.length && !showAllOption) {
        return null;
    }

    const handleToggle = (modeId) => {
        if (disabled) return;
        const isSelected = selectedIds.includes(modeId);
        onChange(isSelected
            ? selectedIds.filter((id) => id !== modeId)
            : [...selectedIds, modeId]);
    };

    return (
        <div className={`${styles.selector} ${className}`.trim()}>
            {showAllOption ? (
                <button
                    type="button"
                    disabled={disabled}
                    className={`${styles.modePill} ${selectedIds.length === 0 ? styles.modePillSelected : ''}`}
                    onClick={() => onChange([])}
                >
                    {allLabel}
                </button>
            ) : null}

            {activityModes.map((mode) => {
                const isSelected = selectedIds.includes(mode.id);
                const backgroundColor = mode.color || 'var(--color-bg-secondary)';
                const textColor = isSelected && mode.color && isLightColor(mode.color)
                    ? '#1A1A1A'
                    : undefined;

                return (
                    <button
                        key={mode.id}
                        type="button"
                        disabled={disabled}
                        className={`${styles.modePill} ${isSelected ? styles.modePillSelected : ''}`}
                        style={isSelected ? { backgroundColor, color: textColor, borderColor: mode.color || undefined } : undefined}
                        onClick={() => handleToggle(mode.id)}
                        title={mode.description || mode.name}
                    >
                        {mode.color ? <span className={styles.colorDot} style={{ backgroundColor: mode.color }} /> : null}
                        <span>{mode.name}</span>
                    </button>
                );
            })}
        </div>
    );
}

ActivityModeSelector.propTypes = {
    rootId: PropTypes.string.isRequired,
    selectedModeIds: PropTypes.arrayOf(PropTypes.string),
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    showAllOption: PropTypes.bool,
    allLabel: PropTypes.string,
    className: PropTypes.string,
};

export default ActivityModeSelector;
