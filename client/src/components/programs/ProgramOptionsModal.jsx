import React, { useMemo, useState } from 'react';

import Modal from '../atoms/Modal';
import EmptyState from '../common/EmptyState';
import { formatLiteralDate } from '../../utils/dateUtils';
import { getProgramStatus } from '../../utils/programGoalWindow';
import { PROGRAM_PICKER_FILTERS, groupProgramsByStatus } from '../../utils/programPicker';
import ProgramStatusBadge from './ProgramStatusBadge';
import styles from './ProgramOptionsModal.module.css';

const PROGRAM_GROUPS = [['active', 'Active Program'], ['upcoming', 'Upcoming'], ['completed', 'Completed']];

function OptionButton({ title, description, danger = false, ...props }) {
    return (
        <button type="button" className={`${styles.optionButton} ${danger ? styles.optionButtonDanger : ''}`} {...props}>
            <span className={styles.optionTitle}>{title}</span>
            <span className={styles.optionDescription}>{description}</span>
        </button>
    );
}

function ProgramPicker({ programs, selectedProgramId, today, onBack, onCreate, onSelect }) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const groups = useMemo(
        () => groupProgramsByStatus(programs, { query, filter, today }),
        [filter, programs, query, today],
    );
    const matchCount = groups.active.length + groups.upcoming.length + groups.completed.length;

    return (
        <div className={styles.programPicker}>
            <button type="button" className={styles.backButton} onClick={onBack}>Back to Options</button>
            {programs.length === 0 ? (
                <EmptyState title="Turn intent into a schedule" description="Programs connect goals, templates, and dates into a practice rhythm you can follow." actionLabel="Create a new program" onAction={onCreate} />
            ) : (
                <>
                    <div className={styles.programPickerControls}>
                        <input
                            className={styles.programPickerSearch}
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search programs"
                            aria-label="Search programs"
                        />
                        <div className={styles.programPickerFilters} aria-label="Filter programs">
                            {PROGRAM_PICKER_FILTERS.map(([value, label]) => (
                                <button
                                    type="button"
                                    key={value}
                                    className={`${styles.programPickerFilterButton} ${filter === value ? styles.programPickerFilterButtonActive : ''}`}
                                    onClick={() => setFilter(value)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {matchCount === 0 ? (
                        <div className={styles.programPickerEmpty}><p>No programs match your filters.</p></div>
                    ) : null}
                    {PROGRAM_GROUPS.map(([key, label]) => (groups[key].length ? (
                        <section className={styles.programPickerGroup} key={key}>
                            <h3 className={styles.programPickerGroupTitle}>{label}</h3>
                            <div className={styles.programPickerList}>
                                {groups[key].map((program) => (
                                    <button
                                        type="button"
                                        key={program.id}
                                        className={`${styles.programPickerRow} ${program.id === selectedProgramId ? styles.programPickerRowSelected : ''}`}
                                        onClick={() => onSelect(program)}
                                    >
                                        <span className={styles.programPickerMain}>
                                            <span className={styles.programPickerName}>{program.name}</span>
                                            <span className={styles.programPickerDates}>
                                                {formatLiteralDate(program.start_date)} - {formatLiteralDate(program.end_date)}
                                            </span>
                                        </span>
                                        <ProgramStatusBadge status={getProgramStatus(program, today)} />
                                    </button>
                                ))}
                            </div>
                        </section>
                    ) : null))}
                </>
            )}
        </div>
    );
}

/**
 * Program Options: actions on the displayed program, plus a searchable picker of
 * every program. Each action closes the modal before it runs.
 */
export default function ProgramOptionsModal({
    isOpen,
    onClose,
    programs,
    displayProgram,
    today,
    onEdit,
    onDelete,
    onDuplicate,
    onPlanEvent,
    onCreate,
    onSelectProgram,
    onShowGoals,
}) {
    const [view, setView] = useState('actions');
    const close = () => {
        setView('actions');
        onClose();
    };
    const closeThen = (action) => () => {
        close();
        action();
    };
    const noProgram = !displayProgram;

    return (
        <Modal
            isOpen={isOpen}
            onClose={close}
            title={view === 'programs' ? 'Other Programs' : 'Program Options'}
            size={view === 'actions' ? 'sm' : 'md'}
        >
            {view === 'programs' ? (
                <ProgramPicker
                    programs={programs}
                    selectedProgramId={displayProgram?.id}
                    today={today}
                    onBack={() => setView('actions')}
                    onCreate={closeThen(onCreate)}
                    onSelect={(program) => { close(); onSelectProgram(program); }}
                />
            ) : (
                <div className={styles.optionsModalBody}>
                    <OptionButton title="Edit Program" description="Update the name, dates, description, and attached goals." onClick={closeThen(onEdit)} disabled={noProgram} />
                    <OptionButton danger title="Delete Program" description="Remove this program and clear its session associations." onClick={closeThen(onDelete)} disabled={noProgram} />
                    <OptionButton title="Duplicate Program" description="Copy this program's goals, blocks, and planned days into a new date range." onClick={closeThen(onDuplicate)} disabled={noProgram} />
                    <OptionButton title="Plan an Event" description="Select days on the calendar, then choose Plan event (e.g. a vacation that protects streaks)." onClick={closeThen(onPlanEvent)} disabled={noProgram} />
                    <OptionButton title="Create a New Program" description="Start another program with its own date range and goals." onClick={closeThen(onCreate)} />
                    <OptionButton title="View Other Programs" description="Browse active, upcoming, and completed programs." onClick={() => setView('programs')} />
                    <OptionButton title="Program Goals" description="View the goals associated with this program and track progress." onClick={closeThen(onShowGoals)} disabled={noProgram} />
                </div>
            )}
        </Modal>
    );
}
