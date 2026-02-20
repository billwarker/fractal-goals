import React, { useState, useEffect } from 'react';
import { getTypeDisplayName, getChildType } from '../../utils/goalHelpers';
import { validateDeadline } from '../../utils/goalCharacteristics';
import { useTheme } from '../../contexts/ThemeContext'
import { useGoalLevels } from '../../contexts/GoalLevelsContext';;
import AddTargetModal from '../AddTargetModal';
import Input from '../atoms/Input';
import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import toast from 'react-hot-toast';
import styles from './GoalModal.module.css';

const GoalModal = ({ isOpen, onClose, onSubmit, parent, activityDefinitions = [] }) => {
    const { getGoalColor, getGoalTextColor, getLevelByName, getGoalIcon } = useGoalLevels();
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

        // Validate deadline against configured characteristics
        if (deadline) {
            const validation = validateDeadline(deadline, getLevelByName(goalType));
            if (!validation.isValid) {
                toast.error(validation.message);
                return;
            }
        }

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
            <div className={styles.modalOverlay}>
                <div className={styles.modalContent}>
                    {/* Header */}
                    <div className={styles.header} style={{ borderBottomColor: themeColor }}>
                        <div className={styles.title} style={{ color: themeColor }}>
                            {parent ? `Add ${getTypeDisplayName(goalType)}` : "Create New Fractal"}
                        </div>
                        <button
                            onClick={onClose}
                            className={styles.closeButton}
                        >
                            &times;
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.form}>
                        <div className={styles.formGroup}>
                            <label className={styles.label} style={{ color: themeColor }}>
                                Goal Type
                            </label>
                            {parent ? (
                                <div>
                                    <div
                                        className={styles.readOnlyType}
                                        style={{ background: themeColor, color: textColor, display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        <GoalIcon
                                            shape={getGoalIcon(goalType)}
                                            color={textColor}
                                            size={18}
                                        />
                                        {getTypeDisplayName(goalType)}
                                    </div>
                                </div>
                            ) : (
                                <select
                                    value={goalType}
                                    onChange={e => setGoalType(e.target.value)}
                                    className={styles.select}
                                    style={{ borderLeft: `4px solid ${themeColor}` }}
                                >
                                    <option value="UltimateGoal">Ultimate Goal</option>
                                    <option value="LongTermGoal">Long Term Goal</option>
                                    <option value="MidTermGoal">Mid Term Goal</option>
                                    <option value="ShortTermGoal">Short Term Goal</option>
                                </select>
                            )}
                        </div>

                        <div className={styles.formGroup}>
                            <Input
                                label="Name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                autoFocus
                                placeholder="Enter goal name..."
                                fullWidth
                            // Pass custom style if needed, but atom handles colors best
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label} style={{ color: themeColor }}>
                                Description
                            </label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="What is this goal about?"
                                rows={2}
                                className={styles.textarea}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label} style={{ color: themeColor }}>
                                Relevance (SMART)
                            </label>
                            <div className={styles.descriptionLabel}>
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
                                className={styles.textarea}
                            />
                        </div>

                        {goalType !== 'MicroGoal' && goalType !== 'NanoGoal' && (
                            <div className={styles.formGroup}>
                                <label className={styles.label} style={{ color: themeColor }}>
                                    Deadline
                                </label>
                                <Input
                                    type="date"
                                    value={deadline}
                                    onChange={e => setDeadline(e.target.value)}
                                    fullWidth
                                />
                            </div>
                        )}

                        <div className={styles.footer}>
                            <Button
                                variant="secondary"
                                onClick={onClose}
                                type="button"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                style={{
                                    background: themeColor,
                                    color: textColor,
                                    borderColor: themeColor
                                }}
                            >
                                Create
                            </Button>
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
