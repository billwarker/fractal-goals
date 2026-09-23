import React from 'react';
import { Link } from 'react-router-dom';

import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import { formatLiteralDate } from '../../utils/dateUtils';
import ProgramDayPeriodBanner from './ProgramDayPeriodBanner';
import ProgramDayStatusMark from './ProgramDayStatusMark';
import ProgramDaySessionRow from './ProgramDaySessionRow';
import ProgramDayStatusMenu from './ProgramDayStatusMenu';
import styles from './ProgramSidePane.module.css';

function ProgramDayPlanCard({ date, blocks, scheduledDayIds, onScheduleDay, onCreateDay }) {
    const activeBlocks = blocks.filter((block) => (
        (!block.start_date || date >= block.start_date)
        && (!block.end_date || date <= block.end_date)
    ));
    return (
        <section className={styles.card}>
            <h3>Plan this day</h3>
            <p className={styles.explainer}>Add a dated definition or schedule one of this program’s reusable day definitions.</p>
            <div className={styles.actionList}>
                {activeBlocks.flatMap((block) => (block.days || [])
                    .filter((day) => !day.date && !scheduledDayIds.has(String(day.id)))
                    .map((day) => (
                        <button key={`${block.id}:${day.id}`} type="button" onClick={() => onScheduleDay?.(block.id, date, day)}>
                            Schedule {day.name} · {block.name}
                        </button>
                    )))}
                {activeBlocks.map((block) => (
                    <button key={`new:${block.id}`} type="button" onClick={() => onCreateDay?.(block.id, date)}>
                        New day in {block.name}
                    </button>
                ))}
            </div>
        </section>
    );
}

function StartActions({ rootId, program, occurrence, date, sessionsById }) {
    const outstandingTemplates = occurrence.templates.filter((template) => template.status !== 'completed');
    if (!outstandingTemplates.length) return null;
    return (
        <div className={styles.startList}>
            {outstandingTemplates.map((template) => {
                const activeCredit = occurrence.credits.find((credit) => (
                    String(credit.template_id) === String(template.id)
                    && sessionsById.get(String(credit.session_id))?.completed === false
                ));
                return (
                    <Link
                        className={styles.startAction}
                        key={template.id}
                        aria-label={`${activeCredit ? 'Continue' : 'Start'} ${template.name}`}
                        to={activeCredit
                            ? `/${rootId}/session/${activeCredit.session_id}`
                            : `/${rootId}/create-session?program_id=${encodeURIComponent(program.id)}&program_day_id=${encodeURIComponent(occurrence.program_day_id)}&date=${date}&template_id=${encodeURIComponent(template.id)}`}
                    >
                        <span className={styles.startVerb}>{activeCredit ? 'Continue' : 'Start'}</span>
                        <SessionTemplateNameBadge name={template.name} color={template.color} size="sm" wrap />
                    </Link>
                );
            })}
        </div>
    );
}

export default function ProgramDayPane({
    rootId, date, today, query, program, blocks = [],
    onScheduleDay, onUnscheduleDay, onCreateDay,
    goals = [], onGoalClick, getGoalIcon, getGoalColor, getGoalSecondaryColor,
    timezone = 'UTC',
    onSetDayStatus,
    dayStatusUpdating = false,
    onSetSessionCredit,
    sessionCreditUpdating = false,
    onEditPeriod,
}) {
    const detail = query.data?.detail;
    if (query.isLoading && !detail) return <div className={styles.state} aria-busy="true">Loading day details…</div>;
    if (query.error) return <div className={styles.state} role="alert">Day details could not be loaded. <button onClick={() => query.refetch()}>Retry</button></div>;
    if (!detail) return <div className={styles.state}>No program schedule on {formatLiteralDate(date)}.</div>;

    const observed = date <= today;
    const sessions = detail.sessions || [];
    const sessionsById = new Map(sessions.map((session) => [String(session.id), session]));
    const creditedSessionIds = new Set(sessions
        .filter((session) => session.relation === 'credited')
        .map((session) => String(session.id)));
    const uncreditedSessions = sessions.filter((session) => !creditedSessionIds.has(String(session.id)));
    const dayRequirements = detail.requirements;
    const periods = query.data?.periods || [];
    const excusingPeriod = detail.status_source === 'period'
        ? periods.find((period) => period.id === query.data?.days?.[0]?.period_id) || null
        : null;
    const renderSession = (session) => (
        <ProgramDaySessionRow
            key={session.id}
            rootId={rootId}
            session={session}
            timezone={timezone}
            canEditCredits={detail.can_edit_credits}
            pending={sessionCreditUpdating}
            onSetCredit={(target, disposition, templateId) => onSetSessionCredit?.(target, disposition, templateId)}
        />
    );

    return (
        <div className={styles.scopedContent}>
            {periods.map((period) => (
                <ProgramDayPeriodBanner
                    key={period.id}
                    period={period}
                    excused={period.id === excusingPeriod?.id}
                    metWhileAway={detail.state === 'scheduled_met' && detail.scheduled}
                    onEdit={onEditPeriod}
                />
            ))}
            {detail.occurrences.map((occurrence, index) => {
                const requirements = occurrence.requirements;
                const occurrenceSessionIds = [...new Set(occurrence.credits.map((credit) => String(credit.session_id)))];
                const occurrenceSessions = occurrenceSessionIds
                    .map((sessionId) => sessionsById.get(sessionId))
                    .filter(Boolean);
                const occurrenceGoalIds = new Set(occurrence.goal_ids.map(String));
                const occurrenceGoals = goals.filter((goal) => occurrenceGoalIds.has(String(goal.id)));
                return (
                    <section className={styles.card} key={occurrence.occurrence_key}>
                        <div className={styles.cardHeading}>
                            <div className={styles.cardTitle}>
                                <small style={{ color: occurrence.block.color || undefined }}>{occurrence.block.name}</small>
                                <div className={styles.programDayTitleLine}>
                                    <h3>{occurrence.name}</h3>
                                    {index === 0 && detail.scheduled ? (
                                        <ProgramDayStatusMenu
                                            periodName={excusingPeriod?.name}
                                            name={occurrence.name}
                                            date={date}
                                            today={today}
                                            state={detail.state}
                                            manualStatus={detail.manual_status}
                                            occurrenceCount={detail.occurrences.length}
                                            pending={dayStatusUpdating}
                                            onSetStatus={onSetDayStatus}
                                        />
                                    ) : null}
                                    {index > 0 && (requirements.requirements_met || (date < today && !detail.manual_status)) ? (
                                        <ProgramDayStatusMark
                                            status={requirements.requirements_met ? 'complete' : 'missed'}
                                            label={`${occurrence.name}: ${requirements.requirements_met ? 'requirements met' : 'missed'}`}
                                        />
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <p className={styles.explainer}>
                            {requirements.completed_template_ids.length} of this definition’s templates completed.
                        </p>
                        {index === 0 && dayRequirements ? (
                            <p className={styles.explainer}>
                                {dayRequirements.completed_template_ids.length} completed; {dayRequirements.required_template_ids.length} required
                                {dayRequirements.completion_min_templates ? `; ${dayRequirements.completion_min_templates} needed to meet this day` : ''}.
                            </p>
                        ) : null}
                        {!requirements.requirements_met && date === today ? (
                            <StartActions
                                rootId={rootId}
                                program={program}
                                occurrence={occurrence}
                                date={date}
                                sessionsById={sessionsById}
                            />
                        ) : null}
                        {observed && occurrenceSessions.length ? (
                            <div className={styles.sessionList} aria-label={`Sessions counted toward ${occurrence.name}`}>
                                {occurrenceSessions.map(renderSession)}
                            </div>
                        ) : null}
                        {index === 0 && observed && uncreditedSessions.length ? (
                            <div className={styles.offPlanGroup} role="group" aria-labelledby={`${occurrence.occurrence_key}-off-plan`}>
                                <h4 id={`${occurrence.occurrence_key}-off-plan`}>Off-plan sessions</h4>
                                <p className={styles.explainer}>
                                    These don’t count toward this day unless you count them as a scheduled template.
                                </p>
                                <div className={styles.sessionList}>{uncreditedSessions.map(renderSession)}</div>
                            </div>
                        ) : null}
                        {occurrence.definition_note ? <p className={styles.note}><strong>Schedule note:</strong> {occurrence.definition_note}</p> : null}
                        {occurrence.scheduled_explicitly && date > today ? (
                            <button
                                type="button"
                                className={styles.quietAction}
                                onClick={() => onUnscheduleDay?.(occurrence.block.id, occurrence.program_day_id, date)}
                            >Remove from this date</button>
                        ) : null}
                        {occurrenceGoals.length ? (
                            <div className={styles.goalList} aria-label="Goals for this day">
                                {occurrenceGoals.map((goal) => {
                                    const type = goal.type || goal.attributes?.type;
                                    return (
                                        <button key={goal.id} type="button" onClick={() => onGoalClick?.(goal)}>
                                            <GoalIcon
                                                shape={getGoalIcon?.(type) || 'circle'}
                                                color={getGoalColor?.(type) || 'var(--color-brand-primary)'}
                                                secondaryColor={getGoalSecondaryColor?.(type)}
                                                size={18}
                                            />
                                            <span>{goal.name || goal.attributes?.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </section>
                );
            })}
            {observed && !detail.occurrences.length && uncreditedSessions.length ? (
                <section className={styles.card}>
                    <h3>Sessions</h3>
                    <div className={styles.sessionList}>{uncreditedSessions.map(renderSession)}</div>
                </section>
            ) : null}
            {date < today && !detail.occurrences.length && !sessions.length ? (
                <p className={styles.state}>No sessions logged on this day.</p>
            ) : null}
            {date >= today ? (
                <ProgramDayPlanCard
                    date={date}
                    blocks={blocks}
                    scheduledDayIds={new Set(detail.occurrences.map((occurrence) => String(occurrence.program_day_id)))}
                    onScheduleDay={onScheduleDay}
                    onCreateDay={onCreateDay}
                />
            ) : null}
            {detail.sessions_page?.has_more ? (
                <Button
                    unstyled
                    className={styles.primaryAction}
                    disabled={query.isFetchingNextPage}
                    onClick={() => query.fetchNextPage()}
                >
                    {query.isFetchingNextPage ? 'Loading…' : 'Load more sessions'}
                </Button>
            ) : null}
        </div>
    );
}
