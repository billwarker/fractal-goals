/**
 * Portal loading overlay shown while the graph profile modal lazy-loads.
 * Extracted from GoalDetailModal.jsx (audit P1-6) — no behavior change.
 */
import React from 'react';
import { createPortal } from 'react-dom';

import CloseButton from '../atoms/CloseButton';
import ModalBackdrop from '../atoms/ModalBackdrop';
import styles from '../GoalDetailModal.module.css';

function GraphProfileLoadingFallback({ title, color, onClose }) {
    return createPortal(
        <ModalBackdrop
            className={styles.graphProfileLoadingOverlay}
            onClose={onClose}
        >
            <section
                className={styles.graphProfileLoadingContainer}
                onClick={(event) => event.stopPropagation()}
                aria-label="Loading graph"
            >
                <header className={styles.graphProfileLoadingHeader}>
                    <div className={styles.graphProfileLoadingTitleGroup}>
                        <div
                            className={styles.graphProfileLoadingDot}
                            style={{ '--graph-accent': color || 'var(--color-brand-primary)' }}
                            aria-hidden="true"
                        />
                        <div>
                            <h2 className={styles.graphProfileLoadingTitle}>{title || 'Time Spent'}</h2>
                            <div className={styles.graphProfileLoadingSubtitle}>
                                Daily time spent from goal evidence
                            </div>
                        </div>
                    </div>
                    <CloseButton
                        onClick={onClose}
                        className={styles.graphProfileLoadingClose}
                        size={28}
                    />
                </header>
                <div className={styles.graphProfileLoadingFrame}>Loading graph...</div>
            </section>
        </ModalBackdrop>,
        document.body
    );
}

export default GraphProfileLoadingFallback;
