import React from 'react';

import GoalIcon from '../atoms/GoalIcon';
import { getProgramDayStateMeta, getProgramDayStatusSymbol } from '../../utils/programDayState';
import ProgramDayStatusMark from './ProgramDayStatusMark';
import styles from './ProgramCalendarView.module.css';

function activateGoalEvent(eventInfo, onGoalActivate, jsEvent) {
    if (!onGoalActivate) return;
    jsEvent.preventDefault();
    jsEvent.stopPropagation();
    onGoalActivate({ ...eventInfo, jsEvent: jsEvent.nativeEvent || jsEvent });
}

export default function renderProgramCalendarEventContent(eventInfo, onGoalActivate, dayState, { ownsDate = false } = {}) {
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
                {ownsDate && dayState?.status_source === 'period' ? (
                    <span className={styles.dayStatusAssistive}>(protected by an event)</span>
                ) : null}
                {ownsDate && dayState?.scheduled ? (
                    <ProgramDayStatusMark
                        status={getProgramDayStatusSymbol({
                            state: dayState.state, manualStatus: dayState.manual_status, closed: dayState.closed,
                        })}
                        size="sm"
                        decorative
                        className={styles.ribbonStatusMark}
                    />
                ) : null}
                {statusLabel ? <span className={styles.dayStatusAssistive}>{title}: {statusLabel}</span> : null}
            </div>
        );
    }

    if (type === 'calendar_period') {
        const { kindLabel, period } = eventInfo.event.extendedProps;
        const protects = period?.protects_streaks;
        return (
            <div className={`${styles.eventPill} ${styles.eventPillCalendarPeriod}`}>
                <span className={styles.eventPillText}>
                    <span className={styles.calendarPeriodKind}>{kindLabel}</span> · {title}
                </span>
                <span className={styles.dayStatusAssistive}>
                    {protects ? ', protecting streaks' : ', streaks not protected'}
                </span>
            </div>
        );
    }

    if (type === 'completed_session') {
        return (
            <div className={`${styles.eventPill} ${styles.eventPillCompletedSession}`}>
                <span className={styles.eventPillText}>{title}</span>
                <span className={styles.dayStatusAssistive}>Completed session: {title}</span>
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
