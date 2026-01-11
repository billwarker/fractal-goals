import React, { useState, useEffect } from 'react';

const PracticeSessionModal = ({ isOpen, onClose, onSubmit, shortTermGoals = [] }) => {
    const [selectedShortTermGoals, setSelectedShortTermGoals] = useState([]);
    const [immediateGoals, setImmediateGoals] = useState([{ name: '', description: '' }]);
    const [error, setError] = useState(null);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setSelectedShortTermGoals([]);
            setImmediateGoals([{ name: '', description: '' }]);
            setError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleCreate = () => {
        setError(null);

        // Validation
        if (selectedShortTermGoals.length === 0) {
            setError('Please select at least one short-term goal');
            return;
        }

        const validImmediateGoals = immediateGoals.filter(g => g.name.trim() !== '');
        if (validImmediateGoals.length === 0) {
            setError('Please add at least one immediate goal with a name');
            return;
        }

        onSubmit({
            selectedShortTermGoals,
            immediateGoals: validImmediateGoals
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal session-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Create Session</h2>

                <div className="modal-content-scroll">
                    {/* Auto-generated name preview */}
                    <div className="session-name-preview">
                        <strong>Session Name:</strong>
                        <p>Session # - {new Date().toLocaleDateString()}</p>
                        <p style={{ fontSize: '0.8em', color: '#888', fontStyle: 'italic', marginTop: '5px' }}>
                            (Name will be automatically generated with the next database index)
                        </p>
                    </div>

                    {error && (
                        <div style={{
                            background: 'rgba(211, 47, 47, 0.1)',
                            border: '1px solid #d32f2f',
                            color: '#ff5252',
                            padding: '10px',
                            borderRadius: '4px',
                            marginBottom: '20px'
                        }}>
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Select Short-Term Goals */}
                    <div className="form-section">
                        <label><strong>Select Short-Term Goals (Required - at least one):</strong></label>
                        <div className="checkbox-list">
                            {shortTermGoals.length === 0 ? (
                                <p className="no-goals-message">No short-term goals available. Please create short-term goals first.</p>
                            ) : (
                                shortTermGoals.map(goal => (
                                    <label key={goal.id} className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={selectedShortTermGoals.includes(goal.id)}
                                            onChange={(e) => {
                                                setError(null);
                                                if (e.target.checked) {
                                                    setSelectedShortTermGoals([...selectedShortTermGoals, goal.id]);
                                                } else {
                                                    setSelectedShortTermGoals(selectedShortTermGoals.filter(id => id !== goal.id));
                                                }
                                            }}
                                        />
                                        <span>{goal.name}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Add Immediate Goals */}
                    <div className="form-section">
                        <label><strong>Immediate Goals for this Session:</strong></label>
                        {immediateGoals.map((goal, index) => (
                            <div key={index} className="immediate-goal-item">
                                <input
                                    type="text"
                                    placeholder="Goal name"
                                    value={goal.name}
                                    onChange={(e) => {
                                        setError(null);
                                        const updated = [...immediateGoals];
                                        updated[index].name = e.target.value;
                                        setImmediateGoals(updated);
                                    }}
                                    className="immediate-goal-input"
                                />
                                <textarea
                                    placeholder="Description (optional)"
                                    value={goal.description}
                                    onChange={(e) => {
                                        const updated = [...immediateGoals];
                                        updated[index].description = e.target.value;
                                        setImmediateGoals(updated);
                                    }}
                                    className="immediate-goal-textarea"
                                    rows="2"
                                />
                                {immediateGoals.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setImmediateGoals(immediateGoals.filter((_, i) => i !== index));
                                        }}
                                        className="remove-goal-btn"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                setImmediateGoals([...immediateGoals, { name: '', description: '' }]);
                            }}
                            className="add-goal-btn"
                        >
                            + Add Another Immediate Goal
                        </button>
                    </div>
                </div>

                <div className="modal-actions">
                    <button
                        type="button"
                        className="action-btn primary"
                        onClick={handleCreate}
                    >
                        Create Session
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PracticeSessionModal;
