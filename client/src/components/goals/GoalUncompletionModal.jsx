import React from 'react';

function GoalUncompletionModal({
    goal,
    goalType,
    programs = [],
    treeData,
    targets = [],
    activityDefinitions = [],
    onConfirm,
    onCancel,
    completedAt
}) {
    // Find programs this goal belongs to
    const findProgramsForGoal = () => {
        if (!treeData) return [];
        const foundPrograms = [];
        if (programs && programs.length > 0) {
            foundPrograms.push(...programs);
        } else if (treeData) {
            foundPrograms.push({ name: treeData.name || 'Current Program', id: treeData.id });
        }
        return foundPrograms;
    };

    const associatedPrograms = findProgramsForGoal();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--color-warning, #ff9800)'
            }}>
                <button
                    onClick={onCancel}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '0 4px'
                    }}
                >
                    ←
                </button>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--color-warning, #ff9800)' }}>
                    ⚠ Confirm Mark as Incomplete
                </h3>
            </div>

            {/* Goal Name */}
            <div style={{
                padding: '14px',
                background: 'var(--color-bg-card-alt)',
                border: '1px solid var(--color-warning, #ff9800)',
                borderRadius: '6px'
            }}>
                <div style={{ fontSize: '11px', color: 'var(--color-warning, #ff9800)', marginBottom: '4px' }}>
                    Marking as Incomplete:
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                    {goal.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    Type: {goalType}
                </div>
            </div>

            {/* Originally Completed Date */}
            {completedAt && (
                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Was completed on:
                    </label>
                    <div style={{
                        padding: '12px',
                        background: 'var(--color-bg-input)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        fontSize: '14px',
                        color: 'var(--color-brand-success, #4caf50)'
                    }}>
                        📅 {new Date(completedAt).toLocaleDateString()} at {new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            )}

            {/* Warning */}
            <div style={{
                padding: '12px',
                background: 'var(--color-bg-card-alt)',
                border: '1px solid var(--color-warning, #ff9800)',
                borderRadius: '4px',
                fontSize: '13px',
                color: 'var(--color-warning, #ffcc80)'
            }}>
                ⚠️ This will remove the completion status and completion date from this goal.
            </div>

            {/* Associated Programs */}
            <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Programs that will update:
                </label>
                {associatedPrograms.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                        No programs found
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {associatedPrograms.map((program, idx) => (
                            <div key={idx} style={{
                                padding: '10px 12px',
                                background: 'var(--color-bg-input)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '4px',
                                fontSize: '13px',
                                color: 'var(--color-text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ color: 'var(--color-warning)' }}>📁</span>
                                {program.name}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Associated Targets */}
            <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Targets that will be marked incomplete ({targets.length}):
                </label>
                {targets.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                        No targets defined for this goal
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {targets.map(target => {
                            const activity = activityDefinitions.find(a => a.id === target.activity_id);
                            return (
                                <div key={target.id} style={{
                                    padding: '10px 12px',
                                    background: 'var(--color-bg-input)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '4px'
                                }}>
                                    <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
                                        🎯 {target.name || activity?.name || 'Target'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                <button
                    onClick={onCancel}
                    style={{
                        flex: 1,
                        padding: '12px',
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    Cancel
                </button>
                <button
                    onClick={onConfirm}
                    style={{
                        flex: 1,
                        padding: '12px',
                        background: 'var(--color-warning, #ff9800)',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}
                >
                    Mark Incomplete
                </button>
            </div>
        </div>
    );
}

export default GoalUncompletionModal;
