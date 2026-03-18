import React from 'react';

import SelectableCard from '../common/SelectableCard';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import styles from './SourceSelector.module.css';

function SourceSelector({ sessionSource, onSelectSource, programName }) {
    return (
        <StepContainer>
            <StepHeader stepNumber={0} title="Choose Session Source" />

            <div className={styles.grid}>
                <SourceCard
                    icon="📅"
                    title={programName ? `From ${programName}` : 'From Active Program'}
                    description="Select a day from your current training program"
                    isSelected={sessionSource === 'program'}
                    onClick={() => onSelectSource('program')}
                />
                <SourceCard
                    icon="📋"
                    title="From Template"
                    description="Choose any template manually"
                    isSelected={sessionSource === 'template'}
                    onClick={() => onSelectSource('template')}
                />
            </div>
        </StepContainer>
    );
}

function SourceCard({ icon, title, description, isSelected, onClick }) {
    return (
        <SelectableCard isSelected={isSelected} onClick={onClick} centered className={styles.card}>
            <div className={styles.icon}>{icon}</div>
            <div className={styles.title}>{title}</div>
            <div className={styles.description}>{description}</div>
            {isSelected ? <div className={styles.selectedState}>✓ Selected</div> : null}
        </SelectableCard>
    );
}

export default SourceSelector;
