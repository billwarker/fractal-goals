import React, { useState, useEffect } from 'react';
import { getGoalColor, getGoalTextColor } from '../utils/goalColors';

/**
 * GoalDetailModal - Display and edit goal details
 */
function GoalDetailModal({ isOpen, onClose, goal, onUpdate }) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [deadline, setDeadline] = useState('');

    // Target editing state
    const [targets, setTargets] = useState([]);
    const [isAddingTarget, setIsAddingTarget] = useState(false);
    const [newTargetName, setNewTargetName] = useState('');
    const [newTargetDesc, setNewTargetDesc] = useState('');
    const [newTargetMetricValue, setNewTargetMetricValue] = useState('');
    const [newTargetMetricUnit, setNewTargetMetricUnit] = useState('');

    useEffect(() => {
        if (goal) {
            setName(goal.name || '');
            setDescription(goal.attributes?.description || goal.description || '');
            setDeadline(goal.attributes?.deadline || goal.deadline || '');

            // Parse targets
            let parsedTargets = [];
            if (goal.attributes?.targets) {
                try {
                    parsedTargets = typeof goal.attributes.targets === 'string'
                        ? JSON.parse(goal.attributes.targets)
                        : goal.attributes.targets;
                } catch (e) {
                    console.error('Error parsing targets:', e);
                    parsedTargets = [];
                }
            }
            setTargets(parsedTargets);
        }
    }, [goal]);

    if (!isOpen || !goal) return null;

    const handleSave = () => {
        onUpdate(goal.id, {
            name,
            description,
            deadline: deadline || null,
            targets: targets
        });
        setIsEditing(false);
        setIsAddingTarget(false);
    };

    const handleCancel = () => {
        // Reset to original values
        if (goal) {
            setName(goal.name || '');
            setDescription(goal.attributes?.description || goal.description || '');
            setDeadline(goal.attributes?.deadline || goal.deadline || '');

            let parsedTargets = [];
            if (goal.attributes?.targets) {
                try {
                    parsedTargets = typeof goal.attributes.targets === 'string'
                        ? JSON.parse(goal.attributes.targets)
                        : goal.attributes.targets;
                } catch (e) {
                    parsedTargets = [];
                }
            }
            setTargets(parsedTargets);
        }
        setIsEditing(false);
        setIsAddingTarget(false);
    };

    const handleAddTarget = () => {
        if (!newTargetName.trim()) return;

        const newTarget = {
            name: newTargetName,
            description: newTargetDesc,
            metrics: newTargetMetricValue ? [{
                value: newTargetMetricValue,
                unit: newTargetMetricUnit
            }] : []
        };

        setTargets([...targets, newTarget]);
        setNewTargetName('');
        setNewTargetDesc('');
        setNewTargetMetricValue('');
        setNewTargetMetricUnit('');
        setIsAddingTarget(false);
    };

    const handleRemoveTarget = (index) => {
        const updatedTargets = [...targets];
        updatedTargets.splice(index, 1);
        setTargets(updatedTargets);
    };

    const goalType = goal.attributes?.type || goal.type;
    const goalColor = getGoalColor(goalType);
    const textColor = getGoalTextColor(goalType);

    return (
        <div
            className="modal-overlay"
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#1e1e1e',
                    border: `2px solid ${goalColor}`,
                    borderRadius: '8px',
                    padding: '24px',
                    maxWidth: '600px',
                    width: '90%',
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    color: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: '16px',
                    borderBottom: `2px solid ${goalColor}`
                }}>
                    <div style={{
                        padding: '6px 16px',
                        background: goalColor,
                        color: textColor,
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: 'bold'
                    }}>
                        {goalType}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            fontSize: '24px',
                            cursor: 'pointer',
                            padding: '0 8px'
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Name */}
                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#aaa' }}>
                        Name:
                    </label>
                    {isEditing ? (
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                background: '#2a2a2a',
                                border: '1px solid #555',
                                borderRadius: '4px',
                                color: 'white',
                                fontSize: '16px',
                                fontWeight: 'bold'
                            }}
                        />
                    ) : (
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: goalColor }}>
                            {goal.name}
                        </div>
                    )}
                </div>

                {/* Description */}
                <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#aaa' }}>
                        Description:
                    </label>
                    {isEditing ? (
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            style={{
                                width: '100%',
                                padding: '8px',
                                background: '#2a2a2a',
                                border: '1px solid #555',
                                borderRadius: '4px',
                                color: 'white',
                                fontSize: '14px',
                                resize: 'vertical'
                            }}
                        />
                    ) : (
                        <div style={{ fontSize: '14px', color: '#ccc', whiteSpace: 'pre-wrap' }}>
                            {goal.attributes?.description || goal.description || <span style={{ fontStyle: 'italic', color: '#666' }}>No description</span>}
                        </div>
                    )}
                </div>

                {/* Deadline */}
                {(isEditing || goal.attributes?.deadline || goal.deadline) && (
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#aaa' }}>
                            Deadline:
                        </label>
                        {isEditing ? (
                            <input
                                type="date"
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
                                style={{
                                    padding: '8px',
                                    background: '#2a2a2a',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '14px'
                                }}
                            />
                        ) : (
                            <div style={{ fontSize: '14px', color: '#ccc' }}>
                                📅 {new Date(goal.attributes?.deadline || goal.deadline).toLocaleDateString()}
                            </div>
                        )}
                    </div>
                )}

                {/* Targets Section */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ fontSize: '13px', color: '#aaa' }}>Targets:</label>
                        {isEditing && !isAddingTarget && (
                            <button
                                onClick={() => setIsAddingTarget(true)}
                                style={{
                                    background: '#333',
                                    border: '1px solid #555',
                                    color: '#ccc',
                                    fontSize: '11px',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                + Add Target
                            </button>
                        )}
                    </div>

                    {/* Target List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {targets.length === 0 && !isAddingTarget ? (
                            <div style={{ fontSize: '13px', color: '#666', fontStyle: 'italic' }}>No targets defined</div>
                        ) : (
                            targets.map((target, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        padding: '10px',
                                        background: '#2a2a2a',
                                        border: '1px solid #4caf50',
                                        borderRadius: '4px',
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4caf50', marginBottom: '4px' }}>
                                        {target.name}
                                    </div>
                                    {target.description && (
                                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                                            {target.description}
                                        </div>
                                    )}
                                    {target.metrics && target.metrics.length > 0 && (
                                        <div style={{ fontSize: '12px', color: '#aaa' }}>
                                            {target.metrics.map((m, i) => (
                                                <span key={i}>
                                                    {m.value} {m.unit || ''}
                                                    {i < target.metrics.length - 1 && ', '}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {isEditing && (
                                        <button
                                            onClick={() => handleRemoveTarget(idx)}
                                            style={{
                                                position: 'absolute',
                                                top: '8px',
                                                right: '8px',
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#f44336',
                                                cursor: 'pointer',
                                                fontSize: '16px'
                                            }}
                                            title="Remove Target"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Add Target Form */}
                    {isEditing && isAddingTarget && (
                        <div style={{
                            marginTop: '12px',
                            padding: '12px',
                            background: '#252525',
                            border: '1px dashed #666',
                            borderRadius: '4px'
                        }}>
                            <div style={{ marginBottom: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Target Name (e.g., Hit 100kg)"
                                    value={newTargetName}
                                    onChange={(e) => setNewTargetName(e.target.value)}
                                    style={{ width: '100%', padding: '6px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px', fontSize: '13px' }}
                                />
                            </div>
                            <div style={{ marginBottom: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Description (Optional)"
                                    value={newTargetDesc}
                                    onChange={(e) => setNewTargetDesc(e.target.value)}
                                    style={{ width: '100%', padding: '6px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px', fontSize: '13px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <input
                                    type="number"
                                    placeholder="Value"
                                    value={newTargetMetricValue}
                                    onChange={(e) => setNewTargetMetricValue(e.target.value)}
                                    style={{ flex: 1, padding: '6px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px', fontSize: '13px' }}
                                />
                                <input
                                    type="text"
                                    placeholder="Unit (kg, min)"
                                    value={newTargetMetricUnit}
                                    onChange={(e) => setNewTargetMetricUnit(e.target.value)}
                                    style={{ flex: 1, padding: '6px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px', fontSize: '13px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => setIsAddingTarget(false)}
                                    style={{ padding: '4px 12px', background: 'transparent', border: '1px solid #666', color: '#ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddTarget}
                                    style={{ padding: '4px 12px', background: '#4caf50', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Created/Updated Info */}
                <div style={{
                    paddingTop: '16px',
                    borderTop: '1px solid #333',
                    fontSize: '12px',
                    color: '#666',
                    display: 'flex',
                    gap: '16px'
                }}>
                    {goal.attributes?.created_at && (
                        <div>Created: {new Date(goal.attributes.created_at).toLocaleDateString()}</div>
                    )}
                    {goal.attributes?.updated_at && (
                        <div>Updated: {new Date(goal.attributes.updated_at).toLocaleDateString()}</div>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    {isEditing ? (
                        <>
                            <button
                                onClick={handleCancel}
                                style={{
                                    padding: '8px 16px',
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
                                onClick={handleSave}
                                style={{
                                    padding: '8px 16px',
                                    background: goalColor,
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: textColor,
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                Save Changes
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={onClose}
                                style={{
                                    padding: '8px 16px',
                                    background: 'transparent',
                                    border: '1px solid #666',
                                    borderRadius: '4px',
                                    color: '#ccc',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                Close
                            </button>
                            <button
                                onClick={() => setIsEditing(true)}
                                style={{
                                    padding: '8px 16px',
                                    background: goalColor,
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: textColor,
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                Edit Goal
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default GoalDetailModal;
