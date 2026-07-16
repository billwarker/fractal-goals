import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import CloseButton from '../atoms/CloseButton';
import styles from './LandingTakeoverShell.module.css';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Full-viewport takeover for compact landing surfaces (goal explorer and
 * feature previews). Mirrors the canonical Modal behaviors — focus trap,
 * Escape, body scroll lock, focus restore, portal — with a full-bleed layout
 * the Modal's card chrome does not support.
 *
 * `escapeDisabled` lets the parent suppress Escape while a real modal (target
 * manager) is stacked above the takeover, so one keypress cannot close both
 * layers. `onEscape` (default `onClose`) lets Escape step back through nested
 * takeover state (e.g. close the goal-detail sheet first) while the top-bar
 * close button always fully dismisses.
 */
export default function LandingTakeoverShell({
    title,
    onClose,
    onEscape,
    children,
    headerExtras = null,
    escapeDisabled = false,
    ariaLabel,
    className = '',
    bodyClassName = '',
}) {
    const shellRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const onEscapeRef = useRef(onEscape || onClose);
    const escapeDisabledRef = useRef(escapeDisabled);
    useEffect(() => {
        onCloseRef.current = onClose;
        onEscapeRef.current = onEscape || onClose;
        escapeDisabledRef.current = escapeDisabled;
    }, [escapeDisabled, onClose, onEscape]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !escapeDisabledRef.current) {
                onEscapeRef.current();
                return;
            }
            if (event.key !== 'Tab' || !shellRef.current) return;
            if (!shellRef.current.contains(document.activeElement)) return;
            const focusable = [...shellRef.current.querySelectorAll(FOCUSABLE_SELECTOR)];
            if (focusable.length === 0) {
                event.preventDefault();
                shellRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusFrame = window.requestAnimationFrame(() => {
            const firstFocusable = shellRef.current?.querySelector(FOCUSABLE_SELECTOR);
            (firstFocusable || shellRef.current)?.focus();
        });

        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus?.();
        };
    }, []);

    const shell = (
        <div
            ref={shellRef}
            tabIndex={-1}
            className={`${styles.takeover} ${className}`.trim()}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
        >
            <div className={styles.topBar}>
                <div className={styles.topBarTitle}>{title}</div>
                <CloseButton onClick={onClose} />
            </div>
            {headerExtras}
            <div className={`${styles.body} ${bodyClassName}`.trim()}>
                {children}
            </div>
        </div>
    );

    if (typeof document !== 'undefined') {
        return createPortal(shell, document.body);
    }
    return shell;
}
