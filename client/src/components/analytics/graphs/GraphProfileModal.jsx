import React from 'react';
import { createPortal } from 'react-dom';

import ModalBackdrop from '../../atoms/ModalBackdrop';
import CloseButton from '../../atoms/CloseButton';
import { getGraphProfile } from './registry';
import styles from './GraphProfileModal.module.css';

export default function GraphProfileModal({
    profileId,
    title,
    data,
    isLoading = false,
    isError = false,
    onClose,
}) {
    const profile = getGraphProfile(profileId);
    const Chart = profile?.Chart;

    const modal = (
        <ModalBackdrop
            className={styles.overlay}
            onClose={onClose}
        >
            <section
                className={styles.container}
                onClick={(event) => event.stopPropagation()}
                aria-label={profile?.name || title || 'Graph'}
            >
                <header className={styles.header}>
                    <div className={styles.titleGroup}>
                        <div
                            className={styles.goalDot}
                            style={{ '--graph-accent': data?.goal?.color || 'var(--color-brand-primary)' }}
                            aria-hidden="true"
                        />
                        <div>
                            <h2 className={styles.title}>{title || profile?.name || 'Graph'}</h2>
                            {profile?.description && (
                                <div className={styles.subtitle}>{profile.description}</div>
                            )}
                        </div>
                    </div>
                    <CloseButton
                        className={styles.closeButton}
                        onClick={onClose}
                    />
                </header>

                <div className={styles.chartFrame}>
                    {isLoading ? (
                        <div className={styles.state}>Loading graph...</div>
                    ) : isError ? (
                        <div className={styles.state}>Graph could not be loaded.</div>
                    ) : Chart ? (
                        <Chart data={data} />
                    ) : (
                        <div className={styles.state}>Graph profile not found.</div>
                    )}
                </div>
            </section>
        </ModalBackdrop>
    );

    return createPortal(modal, document.body);
}
