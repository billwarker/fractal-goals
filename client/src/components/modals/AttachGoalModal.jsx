import React, { useState, useEffect } from 'react';
import moment from 'moment';

const AttachGoalModal = ({ isOpen, onClose, onSave, goals = [], block }) => {
    const [selectedGoalId, setSelectedGoalId] = useState('');
    const [deadline, setDeadline] = useState('');

    useEffect(() => {
        if (isOpen) {
            setSelectedGoalId('');
            setDeadline('');
        }
    }, [isOpen]);

    const handleSubmit = () => {
        if (!selectedGoalId) {
            alert('Please select a goal');
            return;
        }
        if (!deadline) {
            alert('Please set a deadline');
            return;
        }
        onSave({ goal_id: selectedGoalId, deadline });
    };

    // Filter goals? The user said "showing the goals associated with the program".
    // We expect 'goals' prop to be only those associated.

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', width: '500px', border: '1px solid #333', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                <h2 style={{ color: 'white', marginTop: 0, marginBottom: '20px', fontSize: '18px' }}>
                    Attach Goal to {block?.name}
                </h2>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ color: '#ccc', display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 500 }}>Select Goal</label>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #333', borderRadius: '4px', background: '#252525' }}>
                        {goals.length === 0 ? (
                            <div style={{ padding: '15px', color: '#888', fontStyle: 'italic', fontSize: '13px' }}>
                                No goals available in this program. Add goals to the program first.
                            </div>
                        ) : (
                            goals.map(g => (
                                <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderBottom: '1px solid #333', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="goal"
                                        checked={selectedGoalId === g.id}
                                        onChange={() => setSelectedGoalId(g.id)}
                                    />
                                    <div>
                                        <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>{g.name}</div>
                                        <div style={{ fontSize: '11px', color: '#3A86FF' }}>{g.attributes?.type?.replace(/([A-Z])/g, ' $1').trim()}</div>
                                    </div>
                                </label>
                            ))
                        )}
                    </div>
                </div>

                {selectedGoalId && block && (
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ color: '#ccc', display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 500 }}>
                            Set Deadline (Block Range: {moment(block.start_date).format('MMM D')} - {moment(block.end_date).format('MMM D')})
                        </label>
                        <input
                            type="date"
                            value={deadline}
                            onChange={e => setDeadline(e.target.value)}
                            min={block.start_date}
                            max={block.end_date}
                            style={{ width: '100%', padding: '10px', background: '#333', border: '1px solid #444', color: 'white', borderRadius: '4px', fontSize: '14px' }}
                        />
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                            This matches the deadline of the goal to the selected date.
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                    <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #444', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    <button
                        onClick={handleSubmit}
                        style={{
                            background: (!selectedGoalId || !deadline) ? '#444' : '#3A86FF',
                            border: 'none',
                            color: 'white',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: (!selectedGoalId || !deadline) ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            opacity: (!selectedGoalId || !deadline) ? 0.7 : 1
                        }}
                        disabled={!selectedGoalId || !deadline}
                    >
                        Attach Goal
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AttachGoalModal;
