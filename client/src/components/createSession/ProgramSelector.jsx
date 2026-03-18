import React from 'react';

import Button from '../atoms/Button';
import SelectableCard from '../common/SelectableCard';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import styles from './ProgramSelector.module.css';

function ProgramSelector({
    programsByName,
    selectedProgram,
    onSelectProgram,
    hasTemplates,
    sessionSource,
    onSelectTemplateSource,
}) {
    const programNames = Object.keys(programsByName);

    return (
        <StepContainer>
            <StepHeader stepNumber={0} title="Choose a Program" />

            <div className={styles.list}>
                {programNames.map((programName) => {
                    const program = programsByName[programName];
                    const isSelected = selectedProgram === programName;
                    const dayCount = program.days.length;

                    return (
                        <SelectableCard
                            key={programName}
                            isSelected={isSelected}
                            onClick={() => onSelectProgram(programName)}
                            className={styles.card}
                        >
                            <div>
                                <div className={styles.icon}>📅</div>
                                <div className={styles.name}>{programName}</div>
                                <div className={styles.meta}>
                                    {dayCount} active day{dayCount !== 1 ? 's' : ''} available
                                </div>
                            </div>

                            {isSelected ? <div className={styles.selectedState}>✓ Selected</div> : null}
                        </SelectableCard>
                    );
                })}
            </div>

            {hasTemplates ? (
                <div className={styles.footer}>
                    <div className={styles.orText}>or</div>
                    <Button
                        onClick={onSelectTemplateSource}
                        variant={sessionSource === 'template' ? 'primary' : 'secondary'}
                    >
                        Select Template Manually Instead
                    </Button>
                </div>
            ) : null}
        </StepContainer>
    );
}

export default ProgramSelector;
