import React from 'react';

import Button from '../atoms/Button';
import ProgramName from '../atoms/ProgramName';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import StepContainer from '../common/StepContainer';
import StepHeader from './StepHeader';
import styles from './CreateSessionActions.module.css';

function CreateSessionActions({
    selectedTemplate,
    selectedProgramDay,
    creating,
    onCreateSession,
    ready = true,
    footerMode = false,
    headerMode = false,
    // A number while a quick session is being logged: it is completed here, not created.
    quickActivityCount = null,
}) {
    const quick = quickActivityCount !== null;
    const actionTitle = quick ? 'Complete Session' : 'Create Session';
    const isDisabled = creating || (quick ? quickActivityCount === 0 : !selectedTemplate || !ready);
    const pendingLabel = quick ? 'Completing...' : 'Creating...';

    return (
        <StepContainer className={`${styles.container} ${footerMode ? styles.footerContainer : ''} ${headerMode ? styles.headerContainer : ''}`}>
            {!headerMode && !footerMode && <StepHeader stepNumber={quick ? 3 : 4} title={actionTitle} />}
            {footerMode && <h2 className={styles.footerTitle}>{actionTitle}</h2>}

            {quick ? (
                <div className={styles.summary}>
                    <div className={styles.summaryLine}>
                        {quickActivityCount === 0
                            ? 'Add an activity to complete'
                            : `Quick session · ${quickActivityCount} ${quickActivityCount === 1 ? 'activity' : 'activities'}`}
                    </div>
                </div>
            ) : selectedTemplate ? (
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
                {creating ? pendingLabel : actionTitle}
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
                        {' '}from{' '}
                        <strong><ProgramName
                            name={selectedProgramDay.program_name}
                            color={selectedProgramDay.program_color}
                        /></strong>
                        {selectedProgramDay.block_name ? (
                            <> · <strong
                                className={styles.blockName}
                                style={{ color: selectedProgramDay.block_color || 'var(--color-brand-primary)' }}
                            >{selectedProgramDay.block_name}</strong></>
                        ) : null}
                        {selectedProgramDay.day_name ? <> · <strong>{selectedProgramDay.day_name}</strong></> : null}
                    </span>
                ) : null}
            </div>
        </div>
    );
}

export default CreateSessionActions;
