import React from 'react';

import Button from '../atoms/Button';
import CloseButton from '../atoms/CloseButton';
import styles from './ActivityPicker.module.css';


export default function ActivityPickerHeader({
    headerLeading,
    displayTitle,
    subtitle,
    isCopyMode,
    copyModeDescription = 'select an existing activity definition to duplicate into a new one.',
    showBackButton,
    onBack,
    showCloseButton,
    onClose,
}) {
    return (
        <div className={styles.header}>
            <div className={styles.headerMain}>
                {headerLeading}
                {(displayTitle || subtitle || isCopyMode) && (
                    <div className={styles.titleBlock}>
                        {displayTitle && <h3 className={styles.title}>{displayTitle}</h3>}
                        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
                        {isCopyMode && (
                            <div className={styles.subtitle}>
                                Copy mode: {copyModeDescription}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className={styles.headerActions}>
                {showBackButton && (
                    <Button type="button" size="sm" variant="secondary" onClick={onBack}>
                        ← Back
                    </Button>
                )}
                {showCloseButton && onClose && (
                    <CloseButton
                        className={styles.closeButton}
                        onClick={onClose}
                        aria-label="Close activity picker"
                        size={14}
                    />
                )}
            </div>
        </div>
    );
}
