import React from 'react';

import styles from './ProgramCalendarView.module.css';

/** Multi-day selection toggle, current selection label, and Add Block action. */
export function ProgramCalendarBlockControls({
    selectionModeButtonRef,
    blockCreationMode,
    setBlockCreationMode,
    isMobile,
    selectedRangeLabel,
    showAddBlockButton,
    onAddBlockClick,
}) {
    return (
        <div className={styles.headerActions}>
            <button
                type="button"
                ref={selectionModeButtonRef}
                onClick={() => setBlockCreationMode(!blockCreationMode)}
                className={`${styles.customBtn} ${styles.createModeBtn} ${blockCreationMode ? styles.createModeBtnActive : ''}`}
                aria-pressed={blockCreationMode}
            >
                {blockCreationMode ? 'Selecting Multiple Days' : (isMobile ? 'Select Days' : 'Select Multiple Days')}
            </button>
            {selectedRangeLabel ? (
                <span className={styles.selectionLabel}>{selectedRangeLabel}</span>
            ) : null}
            {showAddBlockButton ? (
                <button
                    type="button"
                    onClick={onAddBlockClick}
                    className={`${styles.customBtn} ${styles.addBlockBtn}`}
                >
                    + Add Block
                </button>
            ) : null}
        </div>
    );
}

/** The page calendar's single toolbar: ‹ › Today, Continuous, title, and actions. */
export default function ProgramCalendarToolbar({
    title,
    continuous,
    onPrevious,
    onNext,
    onToday,
    onContinuousToggle,
    actions,
}) {
    return (
        <div className={styles.pageToolbar}>
            <div className={styles.toolbarNavigation} aria-label="Calendar navigation" role="group">
                <button type="button" className={styles.toolbarButton} aria-label="Previous month" onClick={onPrevious}>
                    ‹
                </button>
                <button type="button" className={styles.toolbarButton} aria-label="Next month" onClick={onNext}>
                    ›
                </button>
                <button type="button" className={styles.toolbarButton} onClick={onToday}>
                    Today
                </button>
                {onContinuousToggle ? (
                    <label className={styles.continuousToggle}>
                        <input type="checkbox" checked={continuous} onChange={onContinuousToggle} />
                        <span>Continuous</span>
                    </label>
                ) : null}
            </div>
            <h2 className={styles.toolbarTitle} aria-live="polite">{title}</h2>
            {actions}
        </div>
    );
}
