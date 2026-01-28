import React, { useState, useEffect } from 'react';


function GoalCompletionModal({
    goal,
    goalType,
    programs = [],
    treeData,
    targets = [],
    activityDefinitions = [],
    onConfirm,
    onCancel
}) {
    const completionDate = new Date();

    // Find programs this goal belongs to (traverse up the tree to find program)
    const findProgramsForGoal = () => {
        if (!treeData) return [];

        // For now, the root of the tree is typically the program
        // We'll show the root as the associated program
        const foundPrograms = [];
        if (programs && programs.length > 0) {
            foundPrograms.push(...programs);
        } else if (treeData) {
            // Fallback: use the root node name as the program
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
                borderBottom: '1px solid #4caf50'
            }}>
                <button
                    onClick={onCancel}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#888',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '0 4px'
                    }}
                >
                    ←
                </button>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#4caf50' }}>
                    ✓ Confirm Goal Completion
                </h3>
            </div>

            {/* Goal Name */}
            <div style={{
                padding: '14px',
                background: '#2a3a2a',
                border: '1px solid #4caf50',
                borderRadius: '6px'
            }}>
                <div style={{ fontSize: '11px', color: '#4caf50', marginBottom: '4px' }}>
                    Completing Goal:
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'white' }}>
                    {goal.name}
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                    Type: {goalType}
                </div>
            </div>

            {/* Completion Date */}
            <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                    Will be marked as completed:
                </label>
                <div style={{
                    padding: '12px',
                    background: '#2a2a2a',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    fontSize: '14px',
                    color: 'white'
                }}>
                    📅 {completionDate.toLocaleDateString()} at {completionDate.toLocaleTimeString()}
                </div>
            </div>

            {/* Associated Programs */}
            <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                    Programs that will log this completion:
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
                                background: '#252525',
                                border: '1px solid #555',
                                borderRadius: '4px',
                                fontSize: '13px',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ color: '#66bb6a' }}>📁</span>
                                {program.name}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Associated Targets */}
            <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#aaa' }}>
                    Targets associated with this goal ({targets.length}):
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
                                    background: '#252525',
                                    border: '1px solid #555',
                                    borderRadius: '4px'
                                }}>
                                    <div style={{ fontSize: '13px', fontWeight: '500', color: 'white' }}>
                                        🎯 {target.name || activity?.name || 'Target'}
                                    </div>
                                    {target.metrics && target.metrics.length > 0 && (
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                            {target.metrics.map(metric => {
                                                const metricDef = activity?.metric_definitions?.find(m => m.id === metric.metric_id);
                                                return (
                                                    <span key={metric.metric_id} style={{
                                                        padding: '2px 8px',
                                                        background: '#333',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        color: '#ccc'
                                                    }}>
                                                        {metricDef?.name || 'Metric'}: {metric.value} {metricDef?.unit || ''}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', borderTop: '1px solid #333' }}>
                <button
                    onClick={onCancel}
                    style={{
                        flex: 1,
                        padding: '12px',
                        background: 'transparent',
                        border: '1px solid #666',
                        borderRadius: '4px',
                        color: '#ccc',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    Cancel
                </button>
                <button
                    onClick={() => onConfirm(completionDate)}
                    style={{
                        flex: 1,
                        padding: '12px',
                        background: '#4caf50',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}
                >
                    ✓ Complete Goal
                </button>
            </div>
        </div>
    );
}

export default GoalCompletionModal;
