import React, { useMemo } from 'react';
import { formatLiteralDate } from '../../utils/dateUtils';
import ProgramName from '../atoms/ProgramName';
import Button from '../atoms/Button';
import EmptyState from '../common/EmptyState';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import StepContainer from '../common/StepContainer';
import LoadingState from '../common/LoadingState';
import StepHeader from './StepHeader';
import styles from './ProgramDayPicker.module.css';

/**
 * Step 1 (Program Mode): Select a Day from Your Program
 * Shows available program days grouped by block
 */
function ProgramDayPicker({
    programDays,
    previousDays = [],
    previousDaysLoading = false,
    selectedProgramDay,
    selectedProgramSession,
    hasTemplates,
    onSelectProgramDay,
    onSelectProgramSession,
    onSwitchToTemplate,
    onLogActivities,
}) {
    // Group days by program and the block covering the date (none when outside every block).
    const groupedDays = useMemo(() => {
        const groups = {};
        const order = [];

        programDays.forEach(day => {
            const key = `${day.program_id}:${day.block_id ?? 'none'}`;
            if (!groups[key]) {
                groups[key] = {
                    key,
                    block_id: day.block_id,
                    program_name: day.program_name,
                    program_color: day.program_color,
                    block_name: day.block_name,
                    block_color: day.block_color,
                    days: []
                };
                order.push(key);
            }
            groups[key].days.push(day);
        });

        return order.map(key => groups[key]);
    }, [programDays]);

    const previousSection = previousDays.length > 0 ? (
        <section className={styles.previousDays} aria-label="Previous program days">
            <div className={styles.sectionTitle}>Previous days</div>
            <p className={styles.previousHint}>Use another program day today, then pick one of its dated plans. Past dates' status doesn't change.</p>
            <div className={`${styles.blockGroupContainer} ${styles.programDaysList}`}>
                <DayRows
                    days={previousDays}
                    selectedProgramDay={selectedProgramDay}
                    selectedProgramSession={selectedProgramSession}
                    onSelectProgramDay={onSelectProgramDay}
                    onSelectProgramSession={onSelectProgramSession}
                    onLogActivities={onLogActivities}
                />
            </div>
        </section>
    ) : null;

    if (programDays.length === 0) {
        if (previousSection) {
            return (
                <StepContainer>
                    <StepHeader stepNumber={2} title="Select a Previous Program Day" />
                    <p className={styles.previousHint}>Nothing is scheduled today.</p>
                    {previousSection}
                </StepContainer>
            );
        }
        return (
            <StepContainer>
                <StepHeader stepNumber={2} title="Select a Day from Your Program" />
                {previousDaysLoading ? (
                    <LoadingState label="Loading previous program days…" />
                ) : (
                    <EmptyState
                        description="No program days today, and none before today."
                        actionLabel={hasTemplates ? 'Select Template Instead' : undefined}
                        onAction={hasTemplates ? onSwitchToTemplate : undefined}
                    />
                )}
            </StepContainer>
        );
    }

    return (
        <StepContainer>
            <StepHeader
                stepNumber={2}
                title={groupedDays.length === 1 && groupedDays[0].block_name
                    ? <>Select a Program Day from <span
                        className={styles.blockName}
                        style={{ color: groupedDays[0].block_color || 'var(--color-brand-primary)' }}
                    >{groupedDays[0].block_name}</span></>
                    : "Select a Program Day from Your Program"
                }
            />

            <div className={styles.blockGroupList}>
                {groupedDays.map(group => (
                    <BlockGroup
                        key={group.key}
                        group={group}
                        selectedProgramDay={selectedProgramDay}
                        selectedProgramSession={selectedProgramSession}
                        onSelectProgramDay={onSelectProgramDay}
                        onSelectProgramSession={onSelectProgramSession}
                        onLogActivities={onLogActivities}
                    />
                ))}
            </div>
            {previousSection}
        </StepContainer>
    );
}

function BlockGroup({
    group,
    selectedProgramDay,
    selectedProgramSession,
    onSelectProgramDay,
    onSelectProgramSession,
    onLogActivities,
}) {
    return (
        <div className={styles.blockGroupContainer}>
            {/* Block Header */}
            <div className={styles.blockHeader}>
                <div
                    className={styles.blockColorIndicator}
                    style={{ background: group.block_color || group.program_color || '#2196f3' }}
                />
                <div className={styles.blockTitle}>
                    <ProgramName name={group.program_name} color={group.program_color} />
                    {group.block_name ? (
                        <>
                            <span aria-hidden="true"> — </span>
                            <span
                                className={styles.blockName}
                                style={{ color: group.block_color || 'var(--color-brand-primary)' }}
                            >
                                {group.block_name}
                            </span>
                        </>
                    ) : null}
                </div>
            </div>

            {/* Days List */}
            <div className={styles.programDaysList}>
                <DayRows
                    days={group.days}
                    selectedProgramDay={selectedProgramDay}
                    selectedProgramSession={selectedProgramSession}
                    onSelectProgramDay={onSelectProgramDay}
                    onSelectProgramSession={onSelectProgramSession}
                    onLogActivities={onLogActivities}
                />
            </div>
        </div>
    );
}

function DayRows({ days, selectedProgramDay, selectedProgramSession, onSelectProgramDay, onSelectProgramSession, onLogActivities }) {
    return days.map((programDay, index) => {
        const isSelected = selectedProgramDay?.day_id === programDay.day_id;
        const hasMultipleSessions = programDay.sessions.length > 1;
        const isLast = index === days.length - 1;

        return (
            <React.Fragment key={programDay.day_id}>
                <ProgramDayRow
                    programDay={programDay}
                    isSelected={isSelected}
                    hasMultipleSessions={hasMultipleSessions}
                    onClick={() => onSelectProgramDay(programDay)}
                    onLogActivities={onLogActivities}
                    isLast={isLast}
                />

                {/* Show session selection for multi-session days */}
                {isSelected && hasMultipleSessions && (
                    <SessionList
                        sessions={programDay.sessions}
                        selectedSession={selectedProgramSession}
                        onSelectSession={onSelectProgramSession}
                    />
                )}
            </React.Fragment>
        );
    });
}

function ProgramDayRow({ programDay, isSelected, hasMultipleSessions, onClick, onLogActivities, isLast }) {
    const activities = (programDay.activity_conditions || []).filter((activity) => !activity.activity_deleted);
    // A day that asks only for activities is logged with a quick session.
    const activitiesOnly = programDay.sessions.length === 0 && activities.length > 0 && Boolean(onLogActivities);
    const logActivities = () => onLogActivities(activities
        .filter((activity) => !activity.completed)
        .map((activity) => activity.activity_definition_id));
    // Its templates were deleted since: nothing left to start from.
    const unavailable = programDay.sessions.length === 0 && !activitiesOnly;
    let handleClick = onClick;
    if (unavailable) handleClick = undefined;
    else if (activitiesOnly) handleClick = logActivities;
    return (
        <div
            onClick={handleClick}
            aria-disabled={unavailable || undefined}
            className={`${styles.programDayRow} ${isSelected ? styles.programDayRowSelected : ''} ${!isLast ? styles.programDayRowBorderBottom : ''} ${unavailable ? styles.programDayRowUnavailable : ''}`}
        >
            <div className={styles.programDayContent}>
                <div className={styles.programDayInfo}>
                    <div className={styles.programDayName}>
                        {programDay.day_name}
                    </div>
                    <div className={styles.programDayMeta}>
                        {programDay.is_previous
                            ? `Last: ${formatLiteralDate(programDay.last_date, { weekday: 'short', month: 'short', day: 'numeric', year: undefined })} · ${unavailable ? 'Template no longer available' : programDay.last_status_label}`
                            : `Day ${programDay.day_number}`}
                        {hasMultipleSessions && (
                            <span className={styles.sessionCountBadge}>
                                • {programDay.sessions.length} sessions
                            </span>
                        )}
                    </div>
                    {activities.length ? (
                        <ul className={styles.programDayActivities} aria-label={`Activities for ${programDay.day_name}`}>
                            {activities.map((activity) => (
                                <li key={activity.id}>
                                    {activity.completed ? <span aria-label="done">✓ </span> : null}
                                    {activity.activity_name}
                                    {activity.tags?.length ? ` (${activity.tags.map((tag) => tag.name).join(', ')})` : ''}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>

                {activitiesOnly ? (
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={(event) => { event.stopPropagation(); logActivities(); }}
                    >
                        Log with a Quick Session
                    </Button>
                ) : null}

                {!hasMultipleSessions && !unavailable && !activitiesOnly && (
                    <div className={styles.templateNameBadge}>
                        <SessionTemplateNameBadge
                            entity={programDay.sessions[0]}
                            name={programDay.sessions[0].template_name}
                            size="sm"
                        />
                    </div>
                )}

                {isSelected && !hasMultipleSessions && !unavailable && !activitiesOnly && (
                    <div className={styles.checkIcon}>
                        ✓
                    </div>
                )}
            </div>
        </div>
    );
}

function SessionList({ sessions, selectedSession, onSelectSession }) {
    return (
        <div className={styles.sessionListContainer}>
            <div className={styles.sessionListTitle}>
                Select a session:
            </div>
            <div className={styles.sessionsWrapper}>
                {sessions.map((session) => {
                    const isSessionSelected = selectedSession?.template_id === session.template_id;

                    return (
                        <div
                            key={session.template_id}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectSession(session);
                            }}
                            className={`${styles.sessionRow} ${isSessionSelected ? styles.sessionRowSelected : ''}`}
                        >
                            <div>
                                <SessionTemplateNameBadge
                                    entity={session}
                                    name={session.template_name}
                                    size="sm"
                                    className={styles.sessionRowTitle}
                                />
                                {session.template_description && (
                                    <div className={styles.sessionRowDescription}>
                                        {session.template_description}
                                    </div>
                                )}
                            </div>

                            {isSessionSelected && (
                                <div className={styles.sessionRowCheck}>
                                    ✓
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default ProgramDayPicker;
