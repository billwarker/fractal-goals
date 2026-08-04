import React from 'react';

import { ChevronDownIcon, ChevronUpIcon } from '../atoms/AppIcons';
import styles from './SessionActivityItem.module.css';


export function SessionItemCard({ as: Component = 'div', className = '', isSelected = false, isDragging = false, ...props }) {
    return React.createElement(Component, {
        className: `${styles.activityCard} ${isSelected ? styles.activityCardSelected : ''} ${isDragging ? styles.activityCardDragging : ''} ${className}`,
        ...props,
    });
}

export function SessionItemHeader({ className = '', ...props }) {
    return <div className={`${styles.activityHeader} ${className}`} {...props} />;
}

export function SessionItemHeaderLeft({ className = '', ...props }) {
    return <div className={`${styles.activityHeaderLeft} ${className}`} {...props} />;
}

export function SessionItemHeaderRight({ className = '', ...props }) {
    return <div className={`${styles.activityHeaderRight} ${className}`} {...props} />;
}

export function SessionItemOrderRail({
    showReorderButtons = false,
    onReorder,
    canMoveUp = false,
    canMoveDown = false,
    sessionIndex = null,
}) {
    if (!showReorderButtons && sessionIndex == null) return null;

    return (
        <div className={styles.reorderButtons}>
            {showReorderButtons && (
                <>
                    <button
                        type="button"
                        onClick={() => onReorder?.('up')}
                        disabled={!canMoveUp}
                        className={`${styles.reorderButton} ${!canMoveUp ? styles.reorderButtonDisabled : ''}`}
                        title="Move up"
                        aria-label="Move up"
                    >
                        <ChevronUpIcon size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onReorder?.('down')}
                        disabled={!canMoveDown}
                        className={`${styles.reorderButton} ${!canMoveDown ? styles.reorderButtonDisabled : ''}`}
                        title="Move down"
                        aria-label="Move down"
                    >
                        <ChevronDownIcon size={14} />
                    </button>
                </>
            )}
            {sessionIndex != null && (
                <div className={styles.activitySessionIndex} title={`Activity ${sessionIndex} in this session`}>
                    #{sessionIndex}
                </div>
            )}
        </div>
    );
}

export function SessionItemTimerControls({ className = '', ...props }) {
    return <div className={`${styles.timerControlsGrid} ${className}`} {...props} />;
}

export function SessionItemTimerMeta({ className = '', ...props }) {
    return <div className={`${styles.timerMetaColumn} ${className}`} {...props} />;
}

export function SessionItemTimerActions({ className = '', ...props }) {
    return <div className={`${styles.timerActionColumn} ${className}`} {...props} />;
}
