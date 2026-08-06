import React from 'react';

import Button from '../atoms/Button';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import styles from './CreateSessionActions.module.css';

function CreateSessionActions({
    selectedTemplate,
    selectedProgramDay,
    creating,
    onCreateSession,
    scopeReady = true,
    footerMode = false,
    headerMode = false,
}) {
    const isDisabled = !selectedTemplate || creating || !scopeReady;

    return (
        <StepContainer className={`${styles.container} ${footerMode ? styles.footerContainer : ''} ${headerMode ? styles.headerContainer : ''}`}>
            {!headerMode && !footerMode && <StepHeader stepNumber={2} title="Create Session" />}
            {footerMode && <h2 className={styles.footerTitle}>Create Session</h2>}

            {selectedTemplate ? (
                <SessionSummary
                    selectedTemplate={selectedTemplate}
                    selectedProgramDay={selectedProgramDay}
                    compact={footerMode}
                />
            ) : null}

            <Button
                onClick={onCreateSession}
                disabled={isDisabled}
                isLoading={creating}
                variant="success"
                size={headerMode || footerMode ? 'md' : 'lg'}
                className={styles.button}
            >
                {creating ? 'Creating...' : 'Create Session'}
            </Button>
        </StepContainer>
    );
}

function SessionSummary({ selectedTemplate, selectedProgramDay, compact = false }) {
    return (
        <div className={styles.summary}>
            <div className={styles.summaryLine}>
                <span>Creating:</span>
                <SessionTemplateNameBadge entity={selectedTemplate} size={compact ? 'sm' : 'md'} wrap />
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
