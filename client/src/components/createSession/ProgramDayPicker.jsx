import React, { useMemo } from 'react';
import StepHeader from './StepHeader';
import styles from './ProgramDayPicker.module.css';

/**
 * Step 1 (Program Mode): Select a Day from Your Program
 * Shows available program days grouped by block
 */
function ProgramDayPicker({
    programDays,
    selectedProgramDay,
    selectedProgramSession,
    hasTemplates,
    onSelectProgramDay,
    onSelectProgramSession,
    onSwitchToTemplate
}) {
    // Group days by block
    const groupedDays = useMemo(() => {
        const groups = {};
        const order = [];

        programDays.forEach(day => {
            if (!groups[day.block_id]) {
                groups[day.block_id] = {
                    block_id: day.block_id,
                    program_name: day.program_name,
                    block_name: day.block_name,
                    block_color: day.block_color,
                    days: []
                };
                order.push(day.block_id);
            }
            groups[day.block_id].days.push(day);
        });

        return order.map(blockId => groups[blockId]);
    }, [programDays]);

    if (programDays.length === 0) {
        return (
            <div className={styles.container}>
                <StepHeader stepNumber={1} title="Select a Day from Your Program" />
                <div className={styles.emptyStateContent}>
                    <p className={styles.emptyStateText}>No active program days available for today</p>
                    {hasTemplates && (
                        <button
                            onClick={onSwitchToTemplate}
                            className={styles.activeButton}
                        >
                            Select Template Instead
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <StepHeader
                stepNumber={1}
                title={groupedDays.length === 1
                    ? `Select a Program Day from ${groupedDays[0].block_name}`
                    : "Select a Program Day from Your Program"
                }
            />

            <div className={styles.blockGroupList}>
                {groupedDays.map(group => (
                    <BlockGroup
                        key={group.block_id}
                        group={group}
                        selectedProgramDay={selectedProgramDay}
                        selectedProgramSession={selectedProgramSession}
                        onSelectProgramDay={onSelectProgramDay}
                        onSelectProgramSession={onSelectProgramSession}
                    />
                ))}
            </div>
        </div>
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
                    style={{ background: group.block_color || '#2196f3' }}
                />
                <div className={styles.blockTitle}>
                    {group.program_name} - {group.block_name}
                </div>
            </div>

            {/* Days List */}
            <div className={styles.programDaysList}>
                {group.days.map((programDay, index) => {
                    const isSelected = selectedProgramDay?.day_id === programDay.day_id;
                    const hasMultipleSessions = programDay.sessions.length > 1;
                    const isLast = index === group.days.length - 1;

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
                                    blockColor={programDay.block_color}
                                    onSelectSession={onSelectProgramSession}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}

function ProgramDayRow({ programDay, isSelected, hasMultipleSessions, onClick, isLast }) {
    return (
        <div
            onClick={onClick}
            className={`${styles.programDayRow} ${isSelected ? styles.programDayRowSelected : ''} ${!isLast ? styles.programDayRowBorderBottom : ''}`}
        >
            <div className={styles.programDayContent}>
                <div className={styles.programDayInfo}>
                    <div className={styles.programDayName}>
                        {programDay.day_name}
                    </div>
                    <div className={styles.programDayMeta}>
                        Day {programDay.day_number}
                        {hasMultipleSessions && (
                            <span className={styles.sessionCountBadge}>
                                • {programDay.sessions.length} sessions
                            </span>
                        )}
                    </div>
                </div>

                {!hasMultipleSessions && (
                    <div className={styles.templateNameBadge}>
                        {programDay.sessions[0].template_name}
                    </div>
                )}

                {isSelected && !hasMultipleSessions && (
                    <div className={styles.checkIcon}>
                        ✓
                    </div>
                )}
            </div>
        </div>
    );
}

function SessionList({ sessions, selectedSession, blockColor, onSelectSession }) {
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
                                <div className={`${styles.sessionRowTitle} ${isSessionSelected ? styles.sessionRowTitleSelected : ''}`}>
                                    {session.template_name}
                                </div>
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
