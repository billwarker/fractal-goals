import React, { useState, useEffect } from 'react';
import { getTypeDisplayName, getChildType } from '../../utils/goalHelpers';
import { getGoalColor, getGoalTextColor } from '../../utils/goalColors';
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

    const themeColor = getGoalColor(goalType);
    const textColor = getGoalTextColor(goalType);

    return (
        <>
            <div className="modal-overlay">
                <div className="modal" style={{ width: '600px', maxWidth: '95vw' }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        paddingBottom: '16px',
                        marginBottom: '16px',
                        borderBottom: `2px solid ${themeColor}`
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: themeColor, textTransform: 'uppercase' }}>
                                {parent ? `Add ${getTypeDisplayName(goalType)}` : "Create New Fractal"}
                            </div>
                            <button
                                onClick={onClose}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#888',
                                    fontSize: '24px',
                                    cursor: 'pointer',
                                    padding: '0',
                                    lineHeight: 1
                                }}
                            >
                                &times;
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: themeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                Goal Type
                            </label>
                            {parent ? (
                                <div style={{
                                    padding: '8px 12px',
                                    background: themeColor,
                                    borderRadius: '4px',
                                    color: textColor,
                                    fontWeight: 'bold',
                                    fontSize: '13px',
                                    display: 'inline-block'
                                }}>
                                    {getTypeDisplayName(goalType)}
                                </div>
                            ) : (
                                <select
                                    value={goalType}
                                    onChange={e => setGoalType(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        background: '#2a2a2a',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        color: 'white',
                                        fontSize: '14px'
                                    }}
                                >
                                    <option value="UltimateGoal">Ultimate Goal</option>
                                    <option value="LongTermGoal">Long Term Goal</option>
                                    <option value="MidTermGoal">Mid Term Goal</option>
                                    <option value="ShortTermGoal">Short Term Goal</option>
                                </select>
                            )}
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: themeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                Name
                            </label>
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                autoFocus
                                placeholder="Enter goal name..."
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '14px'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: themeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                Description
                            </label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="What is this goal about?"
                                rows={2}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '13px'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: themeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                Relevance (SMART)
                            </label>
                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px', fontStyle: 'italic' }}>
                                {!parent
                                    ? `Why does ${name || 'this goal'} matter?`
                                    : `How does this help achieve "${parent.name}"?`
                                }
                            </div>
                            <textarea
                                value={relevanceStatement}
                                onChange={e => setRelevanceStatement(e.target.value)}
                                placeholder={!parent ? "Explain the significance..." : "Explain the contribution..."}
                                rows={2}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '13px'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: themeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                Deadline
                            </label>
                            <input
                                type="date"
                                value={deadline}
                                onChange={e => setDeadline(e.target.value)}
                                style={{
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '13px'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #333', marginTop: '10px' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    padding: '8px 16px',
                                    background: 'transparent',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    color: '#aaa',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                style={{
                                    padding: '8px 24px',
                                    background: themeColor,
                                    color: textColor,
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}
                            >
                                Create
                            </button>
                        </div>
                    </form>
                </div>
            </div>

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
