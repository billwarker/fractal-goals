import React, { useState, useEffect } from 'react';
import { getTypeDisplayName, getChildType } from '../../utils/goalHelpers';
import AddTargetModal from '../AddTargetModal';

const GoalModal = ({ isOpen, onClose, onSubmit, parent, activityDefinitions = [] }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [relevanceStatement, setRelevanceStatement] = useState('');
    const [deadline, setDeadline] = useState('');
    const [goalType, setGoalType] = useState('UltimateGoal');
    const [targets, setTargets] = useState([]);
    const [showTargetModal, setShowTargetModal] = useState(false);
    const [editingTarget, setEditingTarget] = useState(null);

    // Reset and Initialize state when modal opens or parent changes
    useEffect(() => {
        if (isOpen) {
            setName('');
            setDescription('');
            setRelevanceStatement('');
            setDeadline('');
            setTargets([]);

            if (!parent) {
                setGoalType('UltimateGoal');
            } else {
                const parentType = parent.attributes?.type || parent.type;
                const childType = getChildType(parentType);
                if (childType) {
                    setGoalType(childType);
                }
            }
        }
    }, [isOpen, parent]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({
            name,
            description,
            relevance_statement: relevanceStatement,
            deadline: deadline || null,
            type: goalType,
            parent_id: parent ? (parent.attributes?.id || parent.id) : null,
            targets
        });
    };

    const handleAddTarget = (target) => {
        setTargets(prev => [...prev, target]);
        setShowTargetModal(false);
        setEditingTarget(null);
    };

    const handleEditTarget = (target) => {
        setEditingTarget(target);
        setShowTargetModal(true);
    };

    const handleUpdateTarget = (updatedTarget) => {
        setTargets(prev => prev.map(t => t.id === updatedTarget.id ? updatedTarget : t));
        setShowTargetModal(false);
        setEditingTarget(null);
    };

    const handleRemoveTarget = (targetId) => {
        setTargets(prev => prev.filter(t => t.id !== targetId));
    };

    return (
        <>
            <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: '600px' }}>
                    <h2>{parent ? `Add ${getTypeDisplayName(goalType)} under "${parent.name}"` : "Create New Fractal"}</h2>
                    <form onSubmit={handleSubmit}>
                        <label>Type:</label>
                        {parent ? (
                            <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '4px', color: '#333', fontWeight: 'bold' }}>
                                {getTypeDisplayName(goalType)}
                            </div>
                        ) : (
                            <select
                                value={goalType}
                                onChange={e => setGoalType(e.target.value)}
                                style={{ padding: '10px', background: '#1e1e1e', border: '1px solid #454545', borderRadius: '6px', color: 'white' }}
                            >
                                <option value="UltimateGoal">Ultimate Goal</option>
                                <option value="LongTermGoal">Long Term Goal</option>
                                <option value="MidTermGoal">Mid Term Goal</option>
                                <option value="ShortTermGoal">Short Term Goal</option>
                            </select>
                        )}

                        <label>Name:</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                            autoFocus
                        />

                        <label>Description:</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />

                        <label>Relevance (SMART):</label>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px', fontStyle: 'italic' }}>
                            {!parent
                                ? `Why does ${name || 'this goal'} matter to you?`
                                : `How does this help achieve "${parent.name}"?`
                            }
                        </div>
                        <textarea
                            value={relevanceStatement}
                            onChange={e => setRelevanceStatement(e.target.value)}
                            placeholder={!parent ? "Explain the deep significance of this goal..." : "Explain how this contributes to the parent goal..."}
                        />

                        <label>Deadline:</label>
                        <input
                            type="date"
                            value={deadline}
                            onChange={e => setDeadline(e.target.value)}
                        />

                        {/* Targets Section */}
                        {activityDefinitions.length > 0 && (
                            <div style={{ marginTop: '16px' }}>
                                <label>Targets (Optional):</label>

                                {targets.length > 0 && (
                                    <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {targets.map(target => {
                                            const activity = activityDefinitions.find(a => a.id === target.activity_id);
                                            return (
                                                <div
                                                    key={target.id}
                                                    style={{
                                                        background: '#2a2a2a',
                                                        border: '1px solid #4caf50',
                                                        borderRadius: '4px',
                                                        padding: '10px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '10px'
                                                    }}
                                                >
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4caf50' }}>
                                                            {target.name}
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>
                                                            {activity?.name} - {target.metrics.map(m => {
                                                                const metric = activity?.metric_definitions?.find(md => md.id === m.metric_id);
                                                                return `${m.value} ${metric?.unit || ''}`;
                                                            }).join(', ')}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditTarget(target)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            background: '#2196f3',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            color: 'white',
                                                            cursor: 'pointer',
                                                            fontSize: '12px'
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveTarget(target.id)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            background: '#d32f2f',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            color: 'white',
                                                            cursor: 'pointer',
                                                            fontSize: '12px'
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingTarget(null);
                                        setShowTargetModal(true);
                                    }}
                                    style={{
                                        padding: '8px 16px',
                                        background: '#4caf50',
                                        border: 'none',
                                        borderRadius: '4px',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        width: '100%'
                                    }}
                                >
                                    + Add Target
                                </button>
                            </div>
                        )}

                        <div className="actions">
                            <button type="button" onClick={onClose}>Cancel</button>
                            <button type="submit">Create</button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Target Modal */}
            <AddTargetModal
                isOpen={showTargetModal}
                onClose={() => {
                    setShowTargetModal(false);
                    setEditingTarget(null);
                }}
                onSave={editingTarget ? handleUpdateTarget : handleAddTarget}
                activityDefinitions={activityDefinitions}
                existingTarget={editingTarget}
            />
        </>
    );
};

export default GoalModal;
