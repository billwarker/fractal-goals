import React from 'react';
import { Link } from 'react-router-dom';

import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import { formatDateValue, formatDurationHuman, formatLiteralDate } from '../../utils/dateUtils';
import ProgramDayCompletionMark from './ProgramDayCompletionMark';
import styles from './ProgramSidePane.module.css';

function SessionSummary({ rootId, session, template, timezone }) {
    const startTime = formatDateValue(session.session_start, 'h:mm A', timezone);
    const endTime = formatDateValue(session.session_end || session.completed_at, 'h:mm A', timezone);
    const resolvedTemplate = session.template || template;

    return (
        <Link to={`/${rootId}/session/${session.id}`} className={styles.sessionRow}>
            <span className={styles.sessionIdentity}>
                <span className={styles.sessionTemplateStatus}>
                    {resolvedTemplate ? (
                        <SessionTemplateNameBadge name={resolvedTemplate.name} color={resolvedTemplate.color} size="sm" wrap />
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
    );
}

export default function ProgramDayPane({
    rootId, date, today, query, program, blocks = [],
    onScheduleDay, onCreateDay,
    goals = [], onGoalClick, getGoalIcon, getGoalColor, getGoalSecondaryColor,
    timezone = 'UTC',
}) {
    const detail = query.data?.detail;
    if (query.isLoading && !detail) return <div className={styles.state} aria-busy="true">Loading day details…</div>;
    if (query.error) return <div className={styles.state} role="alert">Day details could not be loaded. <button onClick={() => query.refetch()}>Retry</button></div>;
    if (!detail) return <div className={styles.state}>No program schedule on {formatLiteralDate(date)}.</div>;
    const activeBlocks = blocks.filter((block) => (
        (!block.start_date || date >= block.start_date)
        && (!block.end_date || date <= block.end_date)
    ));
    const dayRequirements = detail.requirements;

    return (
        <div className={styles.scopedContent}>
            {detail.occurrences.length === 0 ? (
                <section className={styles.card}>
                    <h3>Plan this day</h3>
                    <p className={styles.explainer}>Add a dated definition or schedule one of this program’s reusable day definitions.</p>
                    <div className={styles.actionList}>
                        {activeBlocks.flatMap((block) => (block.days || [])
                            .filter((day) => !day.date)
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
            ) : null}
            {dayRequirements ? (
                <p className={styles.explainer}>
                    {dayRequirements.completed_template_ids.length} completed; {dayRequirements.required_template_ids.length} required
                    {dayRequirements.completion_min_templates ? `; ${dayRequirements.completion_min_templates} needed to meet this day` : ''}.
                </p>
            ) : null}
            {detail.occurrences.map((occurrence) => {
                const requirements = occurrence.requirements;
                const completedSessions = occurrence.sessions.filter((session) => session.completed);
                const outstandingTemplates = occurrence.templates.filter((template) => template.status !== 'completed');
                const occurrenceGoalIds = new Set(occurrence.goal_ids.map(String));
                const occurrenceGoals = goals.filter((goal) => occurrenceGoalIds.has(String(goal.id)));
                return (
                    <section className={styles.card} key={occurrence.occurrence_key}>
                        <div className={styles.cardHeading}>
                            <div className={styles.cardTitle}>
                                <small style={{ color: occurrence.block.color || undefined }}>{occurrence.block.name}</small>
                                <div className={styles.programDayTitleLine}>
                                    <h3>{occurrence.name}</h3>
                                    {requirements.requirements_met || date < today ? (
                                        <ProgramDayCompletionMark
                                            complete={requirements.requirements_met}
                                            label={`${occurrence.name}: ${requirements.requirements_met ? 'requirements met' : 'missed'}`}
                                        />
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <p className={styles.explainer}>
                            {requirements.completed_template_ids.length} of this definition’s templates completed.
                        </p>
                        {!requirements.requirements_met && date === today && outstandingTemplates.length ? (
                            <div className={styles.startList}>
                                {outstandingTemplates.map((template) => {
                                    const activeSession = occurrence.sessions.find((session) => (
                                        !session.completed && String(session.template_id) === String(template.id)
                                    ));
                                    return (
                                        <Link
                                            className={styles.startAction}
                                            key={template.id}
                                            aria-label={`${activeSession ? 'Continue' : 'Start'} ${template.name}`}
                                            to={activeSession
                                                ? `/${rootId}/session/${activeSession.id}`
                                                : `/${rootId}/create-session?program_id=${encodeURIComponent(program.id)}&program_day_id=${encodeURIComponent(occurrence.program_day_id)}&date=${date}&template_id=${encodeURIComponent(template.id)}`}
                                        >
                                            <span className={styles.startVerb}>
                                                {activeSession ? 'Continue' : 'Start'}
                                            </span>
                                            <SessionTemplateNameBadge
                                                name={template.name}
                                                color={template.color}
                                                size="sm"
                                                wrap
                                            />
                                        </Link>
                                    );
                                })}
                            </div>
                        ) : null}
                        {requirements.requirements_met && completedSessions.length ? (
                            <div className={styles.sessionList}>
                                {completedSessions.map((session) => (
                                    <div key={session.id} className={styles.sessionCard}>
                                        <SessionSummary
                                            rootId={rootId}
                                            session={session}
                                            template={occurrence.templates.find((item) => String(item.id) === String(session.template_id))}
                                            timezone={timezone}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        {occurrence.definition_note ? <p className={styles.note}><strong>Schedule note:</strong> {occurrence.definition_note}</p> : null}
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
            {detail.other_sessions.length ? (
                <section className={styles.card}>
                    <h3>Other work</h3>
                    {detail.other_sessions.map((session) => (
                        <div key={session.id} className={styles.sessionCard}>
                            <SessionSummary rootId={rootId} session={session} timezone={timezone} />
                        </div>
                    ))}
                </section>
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
