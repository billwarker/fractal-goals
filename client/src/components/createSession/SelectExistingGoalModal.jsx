import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext'
import { useGoalLevels } from '../../contexts/GoalLevelsContext';;

/**
 * Modal for selecting existing immediate goals to attach to session
 */
function SelectExistingGoalModal({
    isOpen,
    existingImmediateGoals,
    alreadyAddedGoalIds,
    onClose,
    onConfirm
}) {
    const { getGoalColor } = useGoalLevels();;
    const [tempSelectedGoals, setTempSelectedGoals] = useState([]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm(tempSelectedGoals);
        setTempSelectedGoals([]);
    };

    const handleClose = () => {
        setTempSelectedGoals([]);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <h2 style={{ borderBottom: '1px solid #444', paddingBottom: '16px', marginBottom: '16px' }}>
                    Select Existing Immediate Goal(s)
                </h2>

                {existingImmediateGoals.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                        <p>No existing immediate goals found.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto', marginBottom: '20px' }}>
                        {existingImmediateGoals.map(goal => {
                            const isAlreadyAdded = alreadyAddedGoalIds.includes(goal.id);
                            const isSelected = tempSelectedGoals.includes(goal.id);

                            return (
                                <GoalSelectionCard
                                    key={goal.id}
                                    goal={goal}
                                    isSelected={isSelected}
                                    isAlreadyAdded={isAlreadyAdded}
                                    onToggle={() => {
                                        if (!isAlreadyAdded) {
                                            setTempSelectedGoals(prev =>
                                                prev.includes(goal.id)
                                                    ? prev.filter(id => id !== goal.id)
                                                    : [...prev, goal.id]
                                            );
                                        }
                                    }}
                                />
                            );
                        })}
                    </div>
                )}

                <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        type="button"
                        onClick={handleClose}
                        style={{
                            padding: '10px 20px',
                            background: 'transparent',
                            border: '1px solid #666',
                            color: '#ccc',
                            borderRadius: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={tempSelectedGoals.length === 0}
                        style={{
                            padding: '10px 20px',
                            background: tempSelectedGoals.length === 0 ? '#444' : getGoalColor('ImmediateGoal'),
                            border: 'none',
                            borderRadius: '6px',
                            color: tempSelectedGoals.length === 0 ? '#888' : '#1a1a1a',
                            fontWeight: 'bold',
                            cursor: tempSelectedGoals.length === 0 ? 'not-allowed' : 'pointer'
                        }}
                    >
                        Add Selected ({tempSelectedGoals.length})
                    </button>
                </div>
            </div>
        </div>
    );
}

function GoalSelectionCard({ goal, isSelected, isAlreadyAdded, onToggle }) {
    const { getGoalColor } = useGoalLevels();;
    return (
        <div
            onClick={onToggle}
            style={{
                background: isSelected ? '#2a4a2a' : '#1e1e1e',
                border: `2px solid ${isSelected ? getGoalColor('ImmediateGoal') : (isAlreadyAdded ? '#333' : '#444')}`,
                borderRadius: '6px',
                padding: '12px 16px',
                cursor: isAlreadyAdded ? 'not-allowed' : 'pointer',
                opacity: isAlreadyAdded ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
                if (!isAlreadyAdded && !isSelected) {
                    e.currentTarget.style.borderColor = getGoalColor('ImmediateGoal');
                }
            }}
            onMouseLeave={(e) => {
                if (!isAlreadyAdded && !isSelected) {
                    e.currentTarget.style.borderColor = '#444';
                }
            }}
        >
            <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: `2px solid ${isSelected ? getGoalColor('ImmediateGoal') : '#666'}`,
                background: isSelected ? getGoalColor('ImmediateGoal') : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: 'bold',
                flexShrink: 0
            }}>
                {(isSelected || isAlreadyAdded) && '✓'}
            </div>

            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: '15px', color: isSelected || isAlreadyAdded ? getGoalColor('ImmediateGoal') : '#ccc' }}>
                    {goal.name}
                    {isAlreadyAdded && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#666' }}>(Already added)</span>}
                </div>
                {goal.description && (
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                        {goal.description}
                    </div>
                )}
                {goal.deadline && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        📅 {new Date(goal.deadline).toLocaleDateString()}
                    </div>
                )}
            </div>
        </div>
    );
}

export default SelectExistingGoalModal;
