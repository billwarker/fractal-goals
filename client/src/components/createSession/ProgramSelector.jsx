import React from 'react';

import { CalendarIcon } from '../atoms/AppIcons';
import Button from '../atoms/Button';
import ProgramName from '../atoms/ProgramName';
import SelectableCard from '../common/SelectableCard';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import styles from './ProgramSelector.module.css';

function ProgramSelector({
    programsById,
    selectedProgramId,
    onSelectProgram,
    hasTemplates,
    sessionSource,
    onSelectTemplateSource,
    onSelectQuickSource,
}) {
    const programs = Object.values(programsById);

    return (
        <StepContainer>
            <StepHeader stepNumber={1} title="Choose a Program" />

            <div className={styles.list}>
                {programs.map((program) => {
                    const isSelected = selectedProgramId === String(program.program_id);
                    const dayCount = program.days.length;

                    return (
                        <SelectableCard
                            key={program.program_id}
                            isSelected={isSelected}
                            onClick={() => onSelectProgram(String(program.program_id))}
                            className={styles.card}
                        >
                            <div>
                                <div className={styles.icon}>
                                    <CalendarIcon size={24} />
                                </div>
                                <div className={styles.name}>
                                    <ProgramName name={program.program_name} color={program.program_color} />
                                </div>
                                <div className={styles.meta}>
                                    {dayCount} active day{dayCount !== 1 ? 's' : ''} available
                                </div>
                            </div>

                            {isSelected ? <div className={styles.selectedState}>✓ Selected</div> : null}
                        </SelectableCard>
                    );
                })}
            </div>

            <div className={styles.footer}>
                <div className={styles.orText}>or</div>
                {hasTemplates ? (
                    <Button
                        onClick={onSelectTemplateSource}
                        variant={sessionSource === 'template' ? 'primary' : 'secondary'}
                    >
                        Select Template Manually Instead
                    </Button>
                ) : null}
                {onSelectQuickSource ? (
                    <Button
                        onClick={onSelectQuickSource}
                        variant={sessionSource === 'quick' ? 'primary' : 'secondary'}
                    >
                        Log a Quick Session
                    </Button>
                ) : null}
            </div>
        </StepContainer>
    );
}

export default ProgramSelector;
