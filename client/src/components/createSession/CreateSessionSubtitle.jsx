import React from 'react';

import ProgramName from '../atoms/ProgramName';
import styles from '../../pages/CreateSession.module.css';

/** Where a new session stands: the chosen program day (today's or a previous one), or the active program. */
export default function CreateSessionSubtitle({ selectedProgramDay, programContext }) {
    const programName = (source) => <ProgramName name={source.program_name} color={source.program_color} />;
    if (selectedProgramDay?.is_previous) {
        return <>{selectedProgramDay.day_name} · {programName(selectedProgramDay)}</>;
    }
    if (selectedProgramDay) {
        return (
            <>
                Day {selectedProgramDay.day_number || selectedProgramDay.day_name} of{' '}
                <strong
                    className={styles.selectedBlockName}
                    style={{ color: selectedProgramDay.block_color || 'var(--color-brand-primary)' }}
                >{selectedProgramDay.block_name}</strong>
                {' '}· {programName(selectedProgramDay)}
            </>
        );
    }
    if (!programContext) return 'Select a template or program day to begin your session.';
    return (
        <>
            In {programContext.block_name ? (
                <>
                    <strong
                        className={styles.selectedBlockName}
                        style={{ color: programContext.block_color || programContext.program_color }}
                    >{programContext.block_name}</strong>{' '}·{' '}
                </>
            ) : null}{programName(programContext)}
        </>
    );
}
