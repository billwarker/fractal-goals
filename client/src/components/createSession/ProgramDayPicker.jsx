import React, { useMemo } from 'react';
import { formatLiteralDate } from '../../utils/dateUtils';
import ProgramName from '../atoms/ProgramName';
import EmptyState from '../common/EmptyState';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import StepContainer from '../common/StepContainer';
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
    onSwitchToTemplate
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
                />
            </div>
        </section>
    ) : null;

    if (programDays.length === 0) {
        if (previousSection) {
            return (
                <StepContainer>
                    <StepHeader stepNumber={1} title="Select a Previous Program Day" />
                    <p className={styles.previousHint}>Nothing is scheduled today.</p>
                    {previousSection}
                </StepContainer>
            );
        }
        return (
            <StepContainer>
                <StepHeader stepNumber={1} title="Select a Day from Your Program" />
                <EmptyState
                    description={previousDaysLoading ? 'Loading previous program days…' : 'No program days today, and none before today.'}
                    actionLabel={hasTemplates ? 'Select Template Instead' : undefined}
                    onAction={hasTemplates ? onSwitchToTemplate : undefined}
                />
            </StepContainer>
        );
    }

    return (
        <StepContainer>
            <StepHeader
                stepNumber={1}
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
    onSelectProgramSession
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
                />
            </div>
        </div>
    );
}

function DayRows({ days, selectedProgramDay, selectedProgramSession, onSelectProgramDay, onSelectProgramSession }) {
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

function ProgramDayRow({ programDay, isSelected, hasMultipleSessions, onClick, isLast }) {
    // Its templates were deleted since: nothing left to start from.
    const unavailable = programDay.sessions.length === 0;
    return (
        <div
            onClick={unavailable ? undefined : onClick}
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
                </div>

                {!hasMultipleSessions && !unavailable && (
                    <div className={styles.templateNameBadge}>
                        <SessionTemplateNameBadge
                            entity={programDay.sessions[0]}
                            name={programDay.sessions[0].template_name}
                            size="sm"
                        />
                    </div>
                )}

                {isSelected && !hasMultipleSessions && !unavailable && (
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
