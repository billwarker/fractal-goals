import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { getProgramDayStatusSymbol } from '../../utils/programDayState';
import ProgramDayStatusMark from './ProgramDayStatusMark';
import styles from './ProgramSidePane.module.css';

export default function ProgramDayStatusMenu({
    name, date, today, state, manualStatus, occurrenceCount, pending, onSetStatus, periodName = null,
}) {
    const [open, setOpen] = useState(false);
    const menuId = useId();
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const dropdownRef = useRef(null);
    const statusLabel = manualStatus ? `Manual ${manualStatus}`
        : periodName ? `Rest (${periodName})` : 'Automatic from completed sessions';
    const iconState = getProgramDayStatusSymbol({ state, manualStatus, closed: date < today });

    useLayoutEffect(() => {
        if (!open) return undefined;
        const placeDropdown = () => {
            const trigger = triggerRef.current?.getBoundingClientRect();
            const dropdown = dropdownRef.current?.getBoundingClientRect();
            if (!trigger || !dropdown) return;
            const margin = 12;
            const left = Math.max(margin, Math.min(trigger.left, window.innerWidth - dropdown.width - margin));
            const below = window.innerHeight - trigger.bottom - margin;
            const top = below >= dropdown.height
                ? trigger.bottom + 6
                : Math.max(margin, trigger.top - dropdown.height - 6);
            dropdownRef.current.style.left = `${left}px`;
            dropdownRef.current.style.top = `${top}px`;
        };
        placeDropdown();
        window.addEventListener('resize', placeDropdown);
        window.addEventListener('scroll', placeDropdown, true);
        return () => {
            window.removeEventListener('resize', placeDropdown);
            window.removeEventListener('scroll', placeDropdown, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
            if (!rootRef.current?.contains(event.target)
                && !dropdownRef.current?.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            triggerRef.current?.focus();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const chooseStatus = async (status) => {
        const succeeded = await onSetStatus?.(status);
        if (succeeded) {
            setOpen(false);
            triggerRef.current?.focus();
        }
    };

    return (
        <div className={styles.dayStatusMenuRoot} ref={rootRef}>
            <button
                type="button"
                ref={triggerRef}
                className={styles.dayStatusTrigger}
                aria-label={`Change status for ${name} on ${date}: ${statusLabel}`}
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen((current) => !current)}
            ><ProgramDayStatusMark status={iconState} decorative /></button>
            {open ? createPortal(
                <div id={menuId} ref={dropdownRef} className={styles.dayStatusDropdown} role="group" aria-label="Day status options">
                    <strong>Day status</strong>
                    <span role="status">{statusLabel}</span>
                    {periodName && !manualStatus ? (
                        <p>An event protects this day. Choosing a status here overrides it for this date only.</p>
                    ) : null}
                    {occurrenceCount > 1 ? (
                        <p>This status applies to every scheduled definition on this date.</p>
                    ) : null}
                    <button
                        type="button"
                        disabled={pending || date > today}
                        title={date > today ? 'Future days cannot be marked complete' : undefined}
                        onClick={() => chooseStatus('complete')}
                    >Mark complete</button>
                    <button type="button" disabled={pending} onClick={() => chooseStatus('rest')}>Mark rest</button>
                    {manualStatus ? (
                        <button type="button" disabled={pending} onClick={() => chooseStatus('automatic')}>
                            Use automatic status
                        </button>
                    ) : null}
                </div>,
                document.body,
            ) : null}
        </div>
    );
}
