import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import StepHeader from './StepHeader';

/**
 * Step 3: Create Session Button + Summary
 * Final step with submit button and session summary
 */
function CreateSessionActions({
    selectedTemplate,
    selectedProgramDay,
    selectedGoalIds,
    immediateGoals,
    creating,
    onCreateSession
}) {
    const isDisabled = !selectedTemplate || selectedGoalIds.length === 0 || creating;

    return (
        <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center'
        }}>
            <h2 style={{
                fontSize: '20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
            }}>
                <span style={{
                    background: '#2196f3',
                    color: 'white',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold'
                }}>3</span>
                Create Session
            </h2>

            <button
                onClick={onCreateSession}
                disabled={isDisabled}
                style={{
                    padding: '16px 48px',
                    background: isDisabled ? '#666' : '#4caf50',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.5 : 1,
                    transition: 'all 0.2s'
                }}
            >
                {creating ? 'Creating...' : '✓ Create Session'}
            </button>

            {selectedTemplate && selectedGoalIds.length > 0 && (
                <SessionSummary
                    selectedTemplate={selectedTemplate}
                    selectedProgramDay={selectedProgramDay}
                    selectedGoalIds={selectedGoalIds}
                    immediateGoals={immediateGoals}
                />
            )}
        </div>
    );
}

function SessionSummary({ selectedTemplate, selectedProgramDay, selectedGoalIds, immediateGoals }) {
    const { getGoalColor } = useTheme();
    return (
        <div style={{ marginTop: '16px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Creating: <strong style={{ color: 'var(--color-text-primary)' }}>{selectedTemplate.name}</strong>
            {selectedProgramDay && (
                <span> from <strong style={{ color: '#2196f3' }}>{selectedProgramDay.program_name}</strong></span>
            )}
            <br />
            Associated with{' '}
            <strong style={{ color: getGoalColor('ShortTermGoal') }}>
                {selectedGoalIds.length} short term goal{selectedGoalIds.length !== 1 ? 's' : ''}
            </strong>
            {immediateGoals.length > 0 && (
                <span>
                    {' '}and{' '}
                    <strong style={{ color: getGoalColor('ImmediateGoal') }}>
                        {immediateGoals.length} immediate goal{immediateGoals.length !== 1 ? 's' : ''}
                    </strong>
                </span>
            )}
        </div>
    );
}

export default CreateSessionActions;
