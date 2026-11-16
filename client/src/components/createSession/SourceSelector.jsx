import React from 'react';

import { CalendarIcon, ClipboardIcon, LightningIcon } from '../atoms/AppIcons';
import ProgramName from '../atoms/ProgramName';
import SelectableCard from '../common/SelectableCard';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import styles from './SourceSelector.module.css';

function SourceSelector({ sessionSource, onSelectSource, programName, programColor, showProgram = true }) {
    return (
        <StepContainer>
            <StepHeader stepNumber={1} title="Choose Session Source" />

            <div className={styles.grid}>
                {showProgram && (
                    <SourceCard
                        icon={<CalendarIcon size={24} />}
                        title={programName ? <>From <ProgramName name={programName} color={programColor} /></> : 'From Active Program'}
                        description="Select a day from your current training program"
                        isSelected={sessionSource === 'program'}
                        onClick={() => onSelectSource('program')}
                    />
                )}
                <SourceCard
                    icon={<ClipboardIcon size={24} />}
                    title="From Template"
                    description="Choose any template manually"
                    isSelected={sessionSource === 'template'}
                    onClick={() => onSelectSource('template')}
                />
                <SourceCard
                    icon={<LightningIcon size={24} />}
                    title="Quick Session"
                    description="Log activities you've done, no template needed"
                    isSelected={sessionSource === 'quick'}
                    onClick={() => onSelectSource('quick')}
                />
            </div>
        </StepContainer>
    );
}

function SourceCard({ icon, title, description, isSelected, onClick }) {
    return (
        <SelectableCard isSelected={isSelected} onClick={onClick} className={styles.card}>
            <div className={styles.icon}>{icon}</div>
            <div className={styles.copy}>
                <div className={styles.title}>{title}</div>
                <div className={styles.description}>{description}</div>
            </div>
            {isSelected ? <div className={styles.selectedState}>✓ Selected</div> : null}
        </SelectableCard>
    );
}

export default SourceSelector;
