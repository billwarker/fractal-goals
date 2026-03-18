import React from 'react';

/**
 * Step 3: Create Session Button + Summary
 * Final step with submit button and selected template summary
 */
function CreateSessionActions({
    selectedTemplate,
    selectedProgramDay,
    creating,
    quickMode = false,
    onCreateSession,
}) {
    const isDisabled = !selectedTemplate || creating;

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
                }}>2</span>
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
                    transition: 'all 0.2s',
                    marginBottom: '24px'
                }}
            >
                {creating ? 'Creating...' : quickMode ? 'Start Quick Session' : '✓ Create Session'}
            </button>

            {selectedTemplate && (
                <SessionSummary
                    selectedTemplate={selectedTemplate}
                    selectedProgramDay={selectedProgramDay}
                />
            )}
        </div>
    );
}

function SessionSummary({ selectedTemplate, selectedProgramDay }) {
    return (
        <div style={{ marginTop: '24px', fontSize: '15px', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '16px', fontSize: '16px' }}>
                Creating: <strong style={{ color: 'var(--color-text-primary)' }}>{selectedTemplate.name}</strong>
                {selectedProgramDay && (
                    <span> from <strong style={{ color: '#2196f3' }}>{selectedProgramDay.program_name}</strong></span>
                )}
            </div>
        </div>
    );
}

export default CreateSessionActions;
