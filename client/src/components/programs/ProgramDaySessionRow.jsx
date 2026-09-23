import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

import CompletionCheckBadge from '../common/CompletionCheckBadge';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import useAnchoredMenuController from '../../hooks/useAnchoredMenuController';
import { formatDateValue, formatDurationHuman } from '../../utils/dateUtils';
import { describeSessionCredit, sessionCreditActions } from '../../utils/programDaySessionCredit';
import ProgramDayAlignmentBar from './ProgramDayAlignmentBar';
import styles from './ProgramSidePane.module.css';

function SessionCreditMenu({ session, actions, pending, onChoose }) {
    const [open, setOpen] = useState(false);
    const menuId = useId();
    const { anchorRef, menuRef } = useAnchoredMenuController({ open, setOpen, maxWidth: 260 });

    const choose = async (action) => {
        const succeeded = await onChoose(action);
        if (succeeded) setOpen(false);
    };

    return (
        <div className={styles.creditMenuRoot} ref={anchorRef}>
            <button
                type="button"
                className={styles.creditMenuTrigger}
                aria-label={`Change how ${session.name} counts toward this day`}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                disabled={pending}
                onClick={() => setOpen((current) => !current)}
            ><span aria-hidden="true">⋯</span></button>
            {open ? createPortal(
                <div id={menuId} ref={menuRef} className={styles.creditMenu} role="menu" aria-label="Session credit">
                    {actions.map((action) => (
                        <button
                            key={action.key}
                            type="button"
                            role="menuitem"
                            disabled={pending}
                            onClick={() => choose(action)}
                        >{action.label}</button>
                    ))}
                </div>,
                document.body,
            ) : null}
        </div>
    );
}

export default function ProgramDaySessionRow({
    rootId, session, timezone, canEditCredits = false, pending = false, onSetCredit,
}) {
    const startTime = formatDateValue(session.session_start, 'h:mm A', timezone);
    const endTime = formatDateValue(session.session_end || session.completed_at, 'h:mm A', timezone);
    const creditLabel = describeSessionCredit(session);
    const actions = sessionCreditActions(session, canEditCredits);
    const alignment = session.alignment;
    const choose = (action) => onSetCredit?.(session, action.disposition, action.templateId);
    const singleCredit = actions.length === 1 && actions[0].disposition === 'credit';

    return (
        <div className={styles.sessionCard}>
            <Link to={`/${rootId}/session/${session.id}`} className={styles.sessionRow}>
                <span className={styles.sessionIdentity}>
                    <span className={styles.sessionTemplateStatus}>
                        {session.template ? (
                            <SessionTemplateNameBadge name={session.template.name} color={session.template.color} size="sm" wrap />
                        ) : <strong>{session.name}</strong>}
                        <CompletionCheckBadge
                            checked={Boolean(session.completed)}
                            inProgress={!session.completed && !session.is_paused}
                            paused={Boolean(session.is_paused)}
                            label={`${session.name}: ${session.completed ? 'completed' : session.is_paused ? 'paused' : 'in progress'}`}
                        />
                    </span>
                    <span className={styles.sessionDuration}>{formatDurationHuman(session.total_duration_seconds)}</span>
                </span>
                <span className={styles.sessionMetadata}>
                    <span>Start <time dateTime={session.session_start}>{startTime || '—'}</time></span>
                    <span>End <time dateTime={session.session_end || session.completed_at}>{endTime || '—'}</time></span>
                </span>
            </Link>
            {creditLabel || alignment?.activity_count || actions.length ? (
                <div className={styles.sessionFooter}>
                    {creditLabel ? <span className={styles.creditLabel}>{creditLabel}</span> : null}
                    {alignment?.activity_count ? (
                        <ProgramDayAlignmentBar alignment={alignment} />
                    ) : null}
                    {singleCredit ? (
                        <button
                            type="button"
                            className={styles.creditInlineAction}
                            disabled={pending}
                            onClick={() => choose(actions[0])}
                        >{actions[0].label}</button>
                    ) : actions.length ? (
                        <SessionCreditMenu session={session} actions={actions} pending={pending} onChoose={choose} />
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
