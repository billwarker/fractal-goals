import React from 'react';

import GoalIcon from '../atoms/GoalIcon';
import { getProgramDayStateMeta } from '../../utils/programDayState';
import styles from './ProgramCalendarView.module.css';

function activateGoalEvent(eventInfo, onGoalActivate, jsEvent) {
    if (!onGoalActivate) return;
    jsEvent.preventDefault();
    jsEvent.stopPropagation();
    onGoalActivate({ ...eventInfo, jsEvent: jsEvent.nativeEvent || jsEvent });
}

export default function renderProgramCalendarEventContent(eventInfo, onGoalActivate, dayState) {
    const { type, blockColor, isCompleted, goalIcon } = eventInfo.event.extendedProps;
    if (type === 'block_background') return null;
    const title = eventInfo.event.title;

    if (type === 'goal') {
        return (
            <div
                className={`${styles.eventPill} ${styles.eventPillGoal}`}
                style={{ background: 'transparent' }}
                role={onGoalActivate ? 'button' : undefined}
                tabIndex={onGoalActivate ? 0 : undefined}
                aria-label={onGoalActivate ? `Open goal: ${title}` : undefined}
                onClickCapture={onGoalActivate ? (event) => activateGoalEvent(eventInfo, onGoalActivate, event) : undefined}
                onKeyDownCapture={onGoalActivate ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') activateGoalEvent(eventInfo, onGoalActivate, event);
                } : undefined}
            >
                {goalIcon ? (
                    <span className={styles.eventGoalIcon} aria-hidden="true">
                        <GoalIcon {...goalIcon} size={13} />
                    </span>
                ) : null}
                <span className={styles.eventPillText}>{title}</span>
            </div>
        );
    }

    if (type === 'program_day') {
        const color = blockColor || 'var(--color-brand-primary)';
        const isRest = dayState?.state === 'rest';
        const statusLabel = getProgramDayStateMeta(dayState?.state)?.label
            || (isCompleted ? 'requirements met' : null);
        return (
            <div
                className={`${styles.eventPill} ${styles.eventPillProgramDay}`}
                style={{ '--program-day-pill-bg': `color-mix(in srgb, ${color} 13%, var(--color-bg-card))` }}
            >
                <span className={styles.eventPillText}>{title}</span>
                {isRest ? <span className={styles.restStatusLabel}>Rest</span> : null}
                {statusLabel ? <span className={styles.dayStatusAssistive}>{title}: {statusLabel}</span> : null}
            </div>
        );
    }

    if (type === 'template' || type === 'session') {
        const stateClass = type === 'template'
            ? (isCompleted ? styles.eventPillTemplateCompleted : styles.eventPillTemplate)
            : (isCompleted ? styles.eventPillSessionCompleted : styles.eventPillSession);
        return <div className={`${styles.eventPill} ${stateClass}`}><span className={styles.eventPillText}>{title}</span></div>;
    }

    return <div className={styles.eventPill}><span className={styles.eventPillText}>{title}</span></div>;
}
