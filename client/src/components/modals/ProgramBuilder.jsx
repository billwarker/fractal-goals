import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { fractalApi } from '../../utils/api';
import moment from 'moment';

/**
 * ProgramBuilder Modal - Program creation/editing (Metadata only)
 */
function ProgramBuilder({ isOpen, onClose, onSave, initialData = null }) {
    const { rootId } = useParams();
    const [goals, setGoals] = useState([]);
    const [errors, setErrors] = useState({});

    const [programData, setProgramData] = useState({
        name: '',
        description: '',
        selectedGoals: [],
        startDate: '',
        endDate: '',
    });

    // Calculate number of weeks between dates
    const calculateWeeks = () => {
        if (!programData.startDate || !programData.endDate) return 0;
        const start = moment(programData.startDate);
        const end = moment(programData.endDate);
        const weeks = Math.ceil(end.diff(start, 'weeks', true));
        return weeks > 0 ? weeks : 0;
    };

    useEffect(() => {
        if (isOpen && rootId) {
            fetchGoals();
        }

        if (isOpen && initialData) {
            setProgramData({
                name: initialData.name || '',
                description: initialData.description || '',
                selectedGoals: initialData.goal_ids || [],
                startDate: initialData.start_date ? initialData.start_date.split('T')[0] : '',
                endDate: initialData.end_date ? initialData.end_date.split('T')[0] : '',
            });
        } else if (isOpen) {
            // Reset if creating new
            setProgramData({
                name: '',
                description: '',
                selectedGoals: [],
                startDate: '',
                endDate: '',
            });
        }
    }, [isOpen, rootId, initialData]);

    const fetchGoals = async () => {
        try {
            const res = await fractalApi.getGoal(rootId, rootId);
            const allGoals = collectGoals(res.data);
            const eligibleGoals = allGoals.filter(g =>
                ['ShortTermGoal', 'MidTermGoal', 'LongTermGoal', 'UltimateGoal'].includes(g.attributes?.type)
            );
            setGoals(eligibleGoals);
        } catch (err) {
            console.error('Failed to fetch goals:', err);
        }
    };

    const collectGoals = (goal, collected = []) => {
        if (goal) {
            collected.push(goal);
            if (goal.children && Array.isArray(goal.children)) {
                goal.children.forEach(child => collectGoals(child, collected));
            }
        }
        return collected;
    };

    const toggleGoal = (goalId) => {
        setProgramData({
            ...programData,
            selectedGoals: programData.selectedGoals.includes(goalId)
                ? programData.selectedGoals.filter(id => id !== goalId)
                : [...programData.selectedGoals, goalId]
        });
    };

    const validateForm = () => {
        const newErrors = {};
        if (!programData.name.trim()) {
            newErrors.name = 'Program name is required';
        }
        if (programData.selectedGoals.length === 0) {
            newErrors.goals = 'At least one goal must be selected';
        }
        if (!programData.startDate) {
            newErrors.startDate = 'Start date is required';
        }
        if (!programData.endDate) {
            newErrors.endDate = 'End date is required';
        }
        if (programData.startDate && programData.endDate && new Date(programData.startDate) >= new Date(programData.endDate)) {
            newErrors.dateRange = 'End date must be after start date';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = () => {
        if (validateForm()) {
            onSave(programData);
            handleClose();
        }
    };

    const handleClose = () => {
        setProgramData({
            name: '',
            description: '',
            selectedGoals: [],
            startDate: '',
            endDate: '',
        });
        setErrors({});
        onClose();
    };

    if (!isOpen) return null;

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
                zIndex: 1000,
                padding: '20px'
            }}
            onClick={handleClose}
        >
            <div
                style={{
                    background: '#1e1e1e',
                    border: '1px solid #444',
                    borderRadius: '12px',
                    maxWidth: '600px',
                    width: '100%',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 500 }}>
                            {initialData ? 'Edit Program' : 'Create Program'}
                        </h2>
                        <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>
                            Define program details
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
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
                    padding: '24px'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Program Name */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontWeight: 500 }}>
                                Program Name *
                            </label>
                            <input
                                type="text"
                                value={programData.name}
                                onChange={(e) => setProgramData({ ...programData, name: e.target.value })}
                                placeholder="e.g., Spring Marathon Training"
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    background: '#2a2a2a',
                                    border: errors.name ? '1px solid #f44336' : '1px solid #444',
                                    borderRadius: '6px',
                                    color: 'white',
                                    fontSize: '14px'
                                }}
                            />
                            {errors.name && <div style={{ color: '#f44336', fontSize: '12px', marginTop: '4px' }}>{errors.name}</div>}
                        </div>

                        {/* Program Description */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontWeight: 500 }}>
                                Description
                            </label>
                            <textarea
                                value={programData.description}
                                onChange={(e) => setProgramData({ ...programData, description: e.target.value })}
                                placeholder="What is this program about? (Optional)"
                                rows={3}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '6px',
                                    color: 'white',
                                    fontSize: '14px',
                                    resize: 'vertical',
                                    fontFamily: 'inherit'
                                }}
                            />
                        </div>

                        {/* Goal Selection */}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontWeight: 500 }}>
                                Target Goals * (Select at least one)
                            </label>
                            <div style={{
                                background: '#2a2a2a',
                                border: errors.goals ? '1px solid #f44336' : '1px solid #444',
                                borderRadius: '6px',
                                padding: '12px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}>
                                {goals.length === 0 ? (
                                    <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                                        No eligible goals found
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {['LongTermGoal', 'MidTermGoal', 'ShortTermGoal'].map(goalType => {
                                            const typeGoals = goals.filter(g => g.attributes?.type === goalType);
                                            if (typeGoals.length === 0) return null;

                                            const typeLabel = goalType === 'LongTermGoal' ? 'Long Term Goals' :
                                                goalType === 'MidTermGoal' ? 'Mid Term Goals' :
                                                    'Short Term Goals';
                                            const typeColor = goalType === 'LongTermGoal' ? '#7B5CFF' :
                                                goalType === 'MidTermGoal' ? '#3A86FF' :
                                                    '#4ECDC4';

                                            return (
                                                <div key={goalType} style={{
                                                    background: '#1e1e1e',
                                                    borderRadius: '6px',
                                                    overflow: 'hidden'
                                                }}>
                                                    <div style={{
                                                        padding: '10px 12px',
                                                        background: '#252525',
                                                        borderLeft: `3px solid ${typeColor}`,
                                                        fontWeight: 600,
                                                        fontSize: '13px',
                                                        color: typeColor,
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center'
                                                    }}>
                                                        <span>{typeLabel}</span>
                                                        <span style={{ fontSize: '11px', color: '#888' }}>
                                                            {typeGoals.filter(g => programData.selectedGoals.includes(g.id)).length} / {typeGoals.length} selected
                                                        </span>
                                                    </div>

                                                    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        {typeGoals.map(goal => (
                                                            <div
                                                                key={goal.id}
                                                                onClick={() => toggleGoal(goal.id)}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '8px',
                                                                    padding: '8px',
                                                                    background: programData.selectedGoals.includes(goal.id) ? typeColor + '33' : '#2a2a2a',
                                                                    border: programData.selectedGoals.includes(goal.id) ? `1px solid ${typeColor}` : '1px solid transparent',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    if (!programData.selectedGoals.includes(goal.id)) {
                                                                        e.currentTarget.style.background = '#333';
                                                                    }
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    if (!programData.selectedGoals.includes(goal.id)) {
                                                                        e.currentTarget.style.background = '#2a2a2a';
                                                                    }
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={programData.selectedGoals.includes(goal.id)}
                                                                    onChange={() => { }}
                                                                    style={{
                                                                        cursor: 'pointer',
                                                                        pointerEvents: 'none',
                                                                        accentColor: typeColor
                                                                    }}
                                                                />
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{goal.name}</div>
                                                                    {goal.attributes?.description && (
                                                                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                                                                            {goal.attributes.description.length > 60 ? goal.attributes.description.substring(0, 60) + '...' : goal.attributes.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            {errors.goals && <div style={{ color: '#f44336', fontSize: '12px', marginTop: '4px' }}>{errors.goals}</div>}
                        </div>

                        {/* Date Range */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontWeight: 500 }}>
                                    Start Date *
                                </label>
                                <input
                                    type="date"
                                    value={programData.startDate}
                                    onChange={(e) => setProgramData({ ...programData, startDate: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        background: '#2a2a2a',
                                        border: errors.startDate ? '1px solid #f44336' : '1px solid #444',
                                        borderRadius: '6px',
                                        color: 'white',
                                        fontSize: '14px'
                                    }}
                                />
                                {errors.startDate && <div style={{ color: '#f44336', fontSize: '12px', marginTop: '4px' }}>{errors.startDate}</div>}
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontWeight: 500 }}>
                                    End Date *
                                </label>
                                <input
                                    type="date"
                                    value={programData.endDate}
                                    onChange={(e) => setProgramData({ ...programData, endDate: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        background: '#2a2a2a',
                                        border: errors.endDate ? '1px solid #f44336' : '1px solid #444',
                                        borderRadius: '6px',
                                        color: 'white',
                                        fontSize: '14px'
                                    }}
                                />
                                {errors.endDate && <div style={{ color: '#f44336', fontSize: '12px', marginTop: '4px' }}>{errors.endDate}</div>}
                            </div>
                        </div>
                        {errors.dateRange && <div style={{ color: '#f44336', fontSize: '12px', marginTop: '-16px' }}>{errors.dateRange}</div>}

                        {/* Week Calculation Display */}
                        {programData.startDate && programData.endDate && calculateWeeks() > 0 && (
                            <div style={{
                                background: '#2a2a2a',
                                border: '1px solid #3A86FF',
                                borderRadius: '6px',
                                padding: '16px',
                                marginTop: '8px'
                            }}>
                                <div style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>
                                    Program Duration
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 600, color: '#3A86FF' }}>
                                    {calculateWeeks()} {calculateWeeks() === 1 ? 'Week' : 'Weeks'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '24px',
                    borderTop: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <button
                        onClick={handleClose}
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
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        style={{
                            padding: '10px 20px',
                            background: '#3A86FF',
                            border: 'none',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '14px'
                        }}
                    >
                        {initialData ? 'Save Changes' : 'Create Program'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ProgramBuilder;
