import React from 'react';

import GoalIcon from '../atoms/GoalIcon';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import { getProgramDayStateMeta, getProgramDayStatusSymbol } from '../../utils/programDayState';
import ProgramDayStatusMark from './ProgramDayStatusMark';
import styles from './ProgramCalendarView.module.css';

function activateGoalEvent(eventInfo, onGoalActivate, jsEvent) {
    if (!onGoalActivate) return;
    jsEvent.preventDefault();
    jsEvent.stopPropagation();
    onGoalActivate({ ...eventInfo, jsEvent: jsEvent.nativeEvent || jsEvent });
}

function renderCompletedSession(title, props, nested = false) {
    const { templateName, templateColor, count = 1 } = props;
    return (
        <div className={`${styles.eventPill} ${styles.eventPillCompletedSession} ${nested ? styles.eventPillNestedSession : ''}`}>
            {templateName ? (
                <span className={styles.completedSessionBadgeGroup}>
                    <SessionTemplateNameBadge
                        name={templateName}
                        color={templateColor}
                        size="sm"
                        className={`${styles.completedSessionTemplateBadge} ${count === 1 && title !== templateName ? styles.completedSessionTemplateBadgeWithName : ''}`}
                    />
                    {count > 1 ? (
                        <span className={styles.completedSessionCount} aria-hidden="true">×{count}</span>
                    ) : null}
                </span>
            ) : null}
            {title && (title !== templateName || !templateName) && count === 1 ? (
                <span className={styles.eventPillText}>{title}</span>
            ) : null}
            {!templateName && count > 1 ? (
                <span className={styles.eventPillText}>{title} ×{count}</span>
            ) : null}
            <span className={styles.dayStatusAssistive}>
                {count} completed {count === 1 ? 'session' : 'sessions'}
                {templateName ? ` using ${templateName}` : `: ${title}`}
            </span>
        </div>
    );
}

export default function renderProgramCalendarEventContent(eventInfo, onGoalActivate, selectedDayState) {
    const {
        type, blockColor, isCompleted, goalIcon,
    } = eventInfo.event.extendedProps;
    // Feed ribbons carry their own program's date fact; other events fall back to
    // the selected program's state for that date.
    const dayState = eventInfo.event.extendedProps.dayState || selectedDayState;
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
        const hasReadModelState = typeof dayState?.scheduled === 'boolean';
        const occurrenceCompleted = isCompleted === true
            || (hasReadModelState && dayState.state === 'scheduled_met');
        let statusLabel;
        if (dayState?.manual_status === 'complete') statusLabel = 'requirements met';
        else if (dayState?.manual_status === 'rest') statusLabel = 'rest day';
        else if (occurrenceCompleted) statusLabel = 'requirements met';
        else if (hasReadModelState && typeof isCompleted !== 'boolean') {
            statusLabel = getProgramDayStateMeta(dayState.state)?.label;
        }
        else if (dayState?.state === 'rest') statusLabel = 'rest day';
        else if (typeof isCompleted === 'boolean') statusLabel = dayState?.closed ? 'missed' : 'pending';
        else statusLabel = getProgramDayStateMeta(dayState?.state)?.label;
        return (
            <div
                className={`${styles.eventPill} ${styles.eventPillProgramDay}`}
                style={{ '--program-day-pill-bg': `color-mix(in srgb, ${color} 13%, var(--color-bg-card))` }}
            >
                <span className={styles.eventPillText}>{title}</span>
                {dayState?.status_source === 'period' ? (
                    <span className={styles.dayStatusAssistive}>(protected by an event)</span>
                ) : null}
                {dayState?.scheduled ? (
                    <ProgramDayStatusMark
                        status={getProgramDayStatusSymbol({
                            state: dayState.state,
                            manualStatus: dayState.manual_status,
                            closed: dayState.closed,
                            programDayCompleted: occurrenceCompleted ? true : isCompleted,
                        })}
                        size="sm"
                        decorative
                        className={styles.ribbonStatusMark}
                    />
                ) : null}
                {eventInfo.event.extendedProps.contributingSessions?.length ? (
                    <div className={styles.programDaySessions}>
                        {eventInfo.event.extendedProps.contributingSessions.map((session) => (
                            <React.Fragment key={session.id}>
                                {renderCompletedSession(session.title, session.extendedProps, true)}
                            </React.Fragment>
                        ))}
                    </div>
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
        return renderCompletedSession(title, eventInfo.event.extendedProps);
    }

    if (type === 'template' || type === 'session') {
        const stateClass = type === 'template'
            ? (isCompleted ? styles.eventPillTemplateCompleted : styles.eventPillTemplate)
            : (isCompleted ? styles.eventPillSessionCompleted : styles.eventPillSession);
        return <div className={`${styles.eventPill} ${stateClass}`}><span className={styles.eventPillText}>{title}</span></div>;
    }

    return <div className={styles.eventPill}><span className={styles.eventPillText}>{title}</span></div>;
}
