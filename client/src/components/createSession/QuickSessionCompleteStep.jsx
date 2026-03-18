import React from 'react';

import { useActiveSessionActions, useActiveSessionData } from '../../contexts/ActiveSessionContext';
import SessionCompletionButton from '../common/SessionCompletionButton';
import StepHeader from './StepHeader';
import styles from './QuickSessionCompleteStep.module.css';

function QuickSessionCompleteStep({ onComplete, isLoading = false }) {
    const { session } = useActiveSessionData();
    const { toggleSessionComplete } = useActiveSessionActions();

    const completed = Boolean(session?.completed || session?.attributes?.completed);
    const handleComplete = onComplete || toggleSessionComplete;

    if (completed) {
        return null;
    }

    return (
        <div className={styles.card}>
            <StepHeader
                stepNumber={2}
                title="Complete Quick Session"
                subtitle="Record the activity values above, then complete this quick session when you are done."
            />

            <SessionCompletionButton
                onClick={handleComplete}
                className={styles.completeButton}
                pendingLabel="Complete Quick Session"
                isLoading={isLoading}
            />
        </div>
    );
}

export default QuickSessionCompleteStep;
