import React, { useState, useEffect } from 'react';

/**
 * DayViewModal - Modal for viewing and managing program days on a specific date
 * Shows all program days scheduled for the selected date and allows adding new ones
 */
const DayViewModal = ({ isOpen, onClose, date, program, goals, onSetGoalDeadline }) => {
    const [selectedGoalId, setSelectedGoalId] = useState('');
    const [showGoalSection, setShowGoalSection] = useState(false);

    if (!isOpen || !date || !program) return null;

    // Find all program days that match this date
    const programDaysForDate = [];
    if (program.blocks) {
        program.blocks.forEach(block => {
            if (block.days) {
                block.days.forEach(day => {
                    if (day.date === date) {
                        programDaysForDate.push({
                            ...day,
                            blockName: block.name,
                            blockId: block.id,
                            blockColor: block.color
                        });
                    }
                });
            }
        });
    }

    // Find goals due on this date
    const goalsDueOnDate = goals ? goals.filter(g => {
        if (!g.deadline) return false;
        return g.deadline.split('T')[0] === date;
    }) : [];
    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1100,
                padding: '20px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#1e1e1e',
                    border: '1px solid #444',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '600px',
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '20px', color: 'white', fontWeight: 500 }}>
                            {formatDate(date)}
                        </h2>
                        <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>
                            {programDaysForDate.length} program day{programDaysForDate.length !== 1 ? 's' : ''} scheduled
                            {' • '}
                            <span style={{ color: goalsDueOnDate.length > 0 ? '#FFD700' : '#888' }}>
                                {goalsDueOnDate.length} goal{goalsDueOnDate.length !== 1 ? 's' : ''} due
                            </span>
                        </div>
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

                {/* Content */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px'
                }}>
                    {/* Goals Due Section */}
                    {goalsDueOnDate.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                                Goals Due
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {goalsDueOnDate.map(g => (
                                    <div key={g.id} style={{
                                        background: '#252525',
                                        border: '1px solid #FFD700',
                                        borderRadius: '6px',
                                        padding: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px'
                                    }}>
                                        <div style={{ fontSize: '20px' }}>🎯</div>
                                        <div>
                                            <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>
                                                {g.name}
                                            </div>
                                            <div style={{ color: '#FFD700', fontSize: '11px', marginTop: '2px' }}>
                                                Deadline: Today
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {programDaysForDate.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {programDaysForDate.map(day => (
                                <div
                                    key={day.id}
                                    style={{
                                        background: '#252525',
                                        border: `1px solid ${day.blockColor || '#444'}`,
                                        borderLeft: `4px solid ${day.blockColor || '#3A86FF'}`,
                                        borderRadius: '6px',
                                        padding: '16px'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                                        <div>
                                            <div style={{ color: 'white', fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>
                                                {day.name || 'Unnamed Day'}
                                            </div>
                                            <div style={{ color: '#888', fontSize: '12px' }}>
                                                Block: {day.blockName}
                                            </div>
                                        </div>
                                    </div>
                                    {day.templates && day.templates.length > 0 && (
                                        <div style={{ marginTop: '12px' }}>
                                            <div style={{ color: '#888', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' }}>
                                                Session Templates
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {day.templates.map((template, idx) => (
                                                    <div key={idx} style={{ color: '#ccc', fontSize: '13px' }}>
                                                        • {template.name || 'Unnamed Template'}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: '#666'
                        }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>📅</div>
                            <div style={{ fontSize: '15px' }}>No program days scheduled for this date</div>
                            <div style={{ fontSize: '13px', marginTop: '8px' }}>
                                Add a day to a block to schedule activities
                            </div>
                        </div>
                    )}

                    {/* Add Goal Deadline Section */}
                    <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #333' }}>
                        <button
                            onClick={() => setShowGoalSection(!showGoalSection)}
                            style={{
                                background: 'transparent',
                                border: '1px solid #444',
                                borderRadius: '6px',
                                color: 'white',
                                padding: '10px 16px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 500,
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                        >
                            <span>🎯 Set Goal Deadline for This Date</span>
                            <span>{showGoalSection ? '−' : '+'}</span>
                        </button>

                        {showGoalSection && (
                            <div style={{ marginTop: '12px', padding: '16px', background: '#252525', borderRadius: '6px' }}>
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px', textTransform: 'uppercase' }}>
                                        Select Goal
                                    </label>
                                    <select
                                        value={selectedGoalId}
                                        onChange={(e) => setSelectedGoalId(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            background: '#1e1e1e',
                                            border: '1px solid #444',
                                            borderRadius: '4px',
                                            color: 'white',
                                            fontSize: '14px'
                                        }}
                                    >
                                        <option value="">Choose a goal...</option>
                                        {goals && goals.map(goal => {
                                            const goalType = goal.attributes?.type || goal.type || '';
                                            return (
                                                <option key={goal.id} value={goal.id}>
                                                    {goal.name}{goalType ? ` (${goalType})` : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <button
                                    onClick={() => {
                                        if (selectedGoalId && onSetGoalDeadline) {
                                            onSetGoalDeadline(selectedGoalId, date);
                                            setSelectedGoalId('');
                                            setShowGoalSection(false);
                                        }
                                    }}
                                    disabled={!selectedGoalId}
                                    style={{
                                        padding: '10px 16px',
                                        background: selectedGoalId ? '#3A86FF' : '#333',
                                        border: 'none',
                                        borderRadius: '6px',
                                        color: selectedGoalId ? 'white' : '#666',
                                        cursor: selectedGoalId ? 'pointer' : 'not-allowed',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        width: '100%'
                                    }}
                                >
                                    Set Deadline
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '20px',
                    borderTop: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            background: 'transparent',
                            border: '1px solid #444',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DayViewModal;
