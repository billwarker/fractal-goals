// Practice Session Modal Component
// This is the JSX for the practice session creation modal

{
    showPracticeSessionModal && (
        <div className="modal-overlay" onClick={() => setShowPracticeSessionModal(false)}>
            <div className="modal practice-session-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Create Practice Session</h2>

                <div className="modal-content-scroll">
                    {/* Auto-generated name preview */}
                    <div className="session-name-preview">
                        <strong>Session Name:</strong>
                        <p>Practice Session {(() => {
                            const selectedRoot = roots.find(r => r.id === selectedRootId);
                            return selectedRoot ? countPracticeSessions(selectedRoot) + 1 : 1;
                        })()} - {new Date().toLocaleDateString()}</p>
                    </div>

                    {/* Select Short-Term Goals */}
                    <div className="form-section">
                        <label><strong>Select Short-Term Goals (Required - at least one):</strong></label>
                        <div className="checkbox-list">
                            {(() => {
                                const selectedRoot = roots.find(r => r.id === selectedRootId);
                                const shortTermGoals = selectedRoot ? collectShortTermGoals(selectedRoot) : [];

                                if (shortTermGoals.length === 0) {
                                    return <p className="no-goals-message">No short-term goals available. Please create short-term goals first.</p>;
                                }

                                return shortTermGoals.map(goal => (
                                    <label key={goal.id} className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={selectedShortTermGoals.includes(goal.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedShortTermGoals([...selectedShortTermGoals, goal.id]);
                                                } else {
                                                    setSelectedShortTermGoals(selectedShortTermGoals.filter(id => id !== goal.id));
                                                }
                                            }}
                                        />
                                        <span>{goal.name}</span>
                                    </label>
                                ));
                            })()}
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
                        onClick={async () => {
                            // Validation
                            if (selectedShortTermGoals.length === 0) {
                                alert('Please select at least one short-term goal');
                                return;
                            }

                            const validImmediateGoals = immediateGoals.filter(g => g.name.trim() !== '');
                            if (validImmediateGoals.length === 0) {
                                alert('Please add at least one immediate goal with a name');
                                return;
                            }

                            try {
                                // Generate practice session name
                                const selectedRoot = roots.find(r => r.id === selectedRootId);
                                const sessionIndex = selectedRoot ? countPracticeSessions(selectedRoot) + 1 : 1;
                                const sessionName = `Practice Session ${sessionIndex} - ${new Date().toLocaleDateString()}`;

                                // Create practice session with immediate goals
                                // Note: This will require backend changes to support multiple parents
                                const payload = {
                                    name: sessionName,
                                    description: `Practice session with ${validImmediateGoals.length} immediate goal(s)`,
                                    type: 'PracticeSession',
                                    parent_ids: selectedShortTermGoals, // Multiple parents
                                    immediate_goals: validImmediateGoals
                                };

                                const res = await axios.post(`${API_URL}/practice-session`, payload);

                                setShowPracticeSessionModal(false);
                                await fetchGoals();

                            } catch (err) {
                                alert('Error creating practice session: ' + err.message);
                            }
                        }}
                    >
                        Create Practice Session
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowPracticeSessionModal(false)}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
