import React, { useState, useEffect } from 'react';
import { getTypeDisplayName, getChildType } from '../../utils/goalHelpers';

const GoalModal = ({ isOpen, onClose, onSubmit, parent }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [deadline, setDeadline] = useState('');
    const [goalType, setGoalType] = useState('UltimateGoal');

    // Reset and Initialize state when modal opens or parent changes
    useEffect(() => {
        if (isOpen) {
            setName('');
            setDescription('');
            setDeadline('');

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
            deadline: deadline || null,
            type: goalType,
            parent_id: parent ? (parent.attributes?.id || parent.id) : null
        });
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
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

                    <label>Deadline:</label>
                    <input
                        type="date"
                        value={deadline}
                        onChange={e => setDeadline(e.target.value)}
                    />

                    <div className="actions">
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button type="submit">Create</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default GoalModal;
