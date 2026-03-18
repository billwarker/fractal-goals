import React from 'react';

import Button from '../atoms/Button';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import styles from './CreateSessionActions.module.css';

function CreateSessionActions({
    selectedTemplate,
    selectedProgramDay,
    creating,
    quickMode = false,
    onCreateSession,
}) {
    const isDisabled = !selectedTemplate || creating;

    return (
        <StepContainer className={styles.container}>
            <StepHeader stepNumber={2} title="Create Session" />

            <Button
                onClick={onCreateSession}
                disabled={isDisabled}
                isLoading={creating}
                variant="success"
                size="lg"
                className={styles.button}
            >
                {creating ? 'Creating...' : quickMode ? 'Start Quick Session' : 'Create Session'}
            </Button>

            {selectedTemplate ? (
                <SessionSummary
                    selectedTemplate={selectedTemplate}
                    selectedProgramDay={selectedProgramDay}
                />
            ) : null}
        </StepContainer>
    );
}

function SessionSummary({ selectedTemplate, selectedProgramDay }) {
    return (
        <div className={styles.summary}>
            <div className={styles.summaryLine}>
                Creating: <strong className={styles.primaryText}>{selectedTemplate.name}</strong>
                {selectedProgramDay ? (
                    <span>
                        {' '}from <strong className={styles.accentText}>{selectedProgramDay.program_name}</strong>
                    </span>
                ) : null}
            </div>
        </div>
    );
}

export default CreateSessionActions;
