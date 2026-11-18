import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGuardedLogout } from '../../offline/OutboxContext';
import { LEGAL_DOCUMENTS } from '../../content/legal/legalContent';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../content/legal/legalVersions';
import { authApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import LegalDocument from '../legal/LegalDocument';
import Modal from '../atoms/Modal';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Checkbox from '../atoms/Checkbox';
import styles from './LegalAcceptanceModal.module.css';

// Within this many pixels of the end counts as having reached it.
const END_TOLERANCE_PX = 16;

const hasReachedEnd = (element) => (
    element.scrollHeight > 0
    && element.scrollTop + element.clientHeight >= element.scrollHeight - END_TOLERANCE_PX
);

/** Blocking review for accounts with missing or outdated legal acceptance. Each document counts as read once scrolled to its end. */
function LegalAcceptanceModal() {
    const { setUser } = useAuth();
    const logout = useGuardedLogout();
    const idPrefix = useId();
    const readerRef = useRef(null);
    const scrollPositions = useRef({});
    const [activeId, setActiveId] = useState(LEGAL_DOCUMENTS[0].id);
    const [readIds, setReadIds] = useState(() => new Set());
    const [accepted, setAccepted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const activeDocument = LEGAL_DOCUMENTS.find((document) => document.id === activeId);
    const allRead = LEGAL_DOCUMENTS.every((document) => readIds.has(document.id));
    const nextUnread = LEGAL_DOCUMENTS.find((document) => document.id !== activeId && !readIds.has(document.id));
    const tabId = (id) => `${idPrefix}-tab-${id}`;

    const markReadIfAtEnd = useCallback(() => {
        const reader = readerRef.current;
        if (!reader || !hasReachedEnd(reader)) return;
        setReadIds((previous) => (previous.has(activeId) ? previous : new Set(previous).add(activeId)));
    }, [activeId]);

    // Each document reopens where the reader left it; a document shorter than the pane is read on sight.
    useLayoutEffect(() => {
        if (readerRef.current) readerRef.current.scrollTop = scrollPositions.current[activeId] || 0;
        markReadIfAtEnd();
    }, [activeId, markReadIfAtEnd]);

    useEffect(() => {
        if (typeof ResizeObserver === 'undefined' || !readerRef.current) return undefined;
        const observer = new ResizeObserver(markReadIfAtEnd);
        observer.observe(readerRef.current);
        return () => observer.disconnect();
    }, [markReadIfAtEnd]);

    const openDocument = (id) => {
        if (id === activeId) return;
        if (readerRef.current) scrollPositions.current[activeId] = readerRef.current.scrollTop;
        setActiveId(id);
    };

    const handleTabKeyDown = (event) => {
        const index = LEGAL_DOCUMENTS.findIndex((document) => document.id === activeId);
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        const next = LEGAL_DOCUMENTS[(index + step + LEGAL_DOCUMENTS.length) % LEGAL_DOCUMENTS.length];
        openDocument(next.id);
        document.getElementById(tabId(next.id))?.focus();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!allRead || !accepted || isSubmitting) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const response = await authApi.acceptLegalDocuments({
                accepted_terms: true,
                terms_version: TERMS_VERSION,
                privacy_version: PRIVACY_VERSION,
            });
            setUser(response.data);
            notify.success('Legal documents accepted.');
        } catch (err) {
            setError(formatError(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={() => {}}
            title="Review Our Updated Terms"
            size="xl"
            mobilePresentation="fullscreen"
            className={styles.modal}
            bodyClassName={styles.body}
            showCloseButton={false}
            closeOnEsc={false}
            closeOnBackdrop={false}
        >
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.layout}>
                    <div className={styles.summary}>
                        <p className={styles.intro}>
                            We have updated our Terms of Service and Privacy Policy. Read each one
                            to the end, then accept them to keep using Fractal Goals.
                        </p>
                        <div
                            role="tablist"
                            aria-label="Legal documents"
                            aria-orientation="vertical"
                            className={styles.documents}
                            onKeyDown={handleTabKeyDown}
                        >
                            {LEGAL_DOCUMENTS.map((document) => {
                                const isRead = readIds.has(document.id);
                                const isActive = document.id === activeId;
                                return (
                                    <button
                                        key={document.id}
                                        id={tabId(document.id)}
                                        type="button"
                                        role="tab"
                                        aria-selected={isActive}
                                        aria-controls={`${idPrefix}-reader`}
                                        tabIndex={isActive ? 0 : -1}
                                        className={styles.documentTab}
                                        onClick={() => openDocument(document.id)}
                                    >
                                        <span className={styles.documentTitle}>{document.title}</span>
                                        <span className={`${styles.documentStatus} ${isRead ? styles.read : ''}`}>
                                            {isRead ? '✓ Read' : 'Not read yet'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <Checkbox
                            checked={accepted}
                            onChange={(event) => setAccepted(event.target.checked)}
                            disabled={!allRead}
                            aria-describedby={allRead ? undefined : `${idPrefix}-hint`}
                            label="I am 16 or older and I agree to the Terms of Service and Privacy Policy."
                        />
                        {!allRead && (
                            <p id={`${idPrefix}-hint`} className={styles.hint}>
                                Scroll to the end of both documents to accept.
                            </p>
                        )}
                        {error && <div className={styles.errorMessage} role="alert">{error}</div>}
                    </div>
                    <div
                        ref={readerRef}
                        id={`${idPrefix}-reader`}
                        role="tabpanel"
                        aria-labelledby={tabId(activeId)}
                        tabIndex={0}
                        className={styles.reader}
                        onScroll={markReadIfAtEnd}
                    >
                        <LegalDocument document={activeDocument} />
                        {nextUnread && readIds.has(activeId) && (
                            <div className={styles.readerNext}>
                                <Button type="button" variant="secondary" onClick={() => openDocument(nextUnread.id)}>
                                    Continue to the {nextUnread.title}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
                <ModalFooter>
                    <Button type="button" variant="secondary" onClick={logout} disabled={isSubmitting}>
                        Log Out
                    </Button>
                    <Button type="submit" disabled={!allRead || !accepted || isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Accept and Continue'}
                    </Button>
                </ModalFooter>
            </form>
        </Modal>
    );
}

export default LegalAcceptanceModal;
