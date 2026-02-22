import React, { useState, useEffect } from 'react';
import { getTypeDisplayName, getChildType } from '../../utils/goalHelpers';
import { validateDeadlineRange, getDurationInDays } from '../../utils/goalCharacteristics';
import { useTheme } from '../../contexts/ThemeContext'
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import AddTargetModal from '../AddTargetModal';
import Input from '../atoms/Input';
import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import toast from 'react-hot-toast';
import styles from './GoalModal.module.css';

const GoalModal = ({ isOpen, onClose, onSubmit, parent, activityDefinitions = [] }) => {
    const { getGoalColor, getGoalTextColor, getLevelByName, getGoalIcon, getDeadlineConstraints, getLevelCharacteristics } = useGoalLevels();
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

    // Handle initial deadline auto-filling and characteristics sync
    const chars = getLevelCharacteristics(goalType);
    const descriptionRequired = chars?.description_required || false;

    // Auto-fill deadline from level defaults when modal first opens with a new goalType
    const hasAutoFilledRef = React.useRef(false);
    useEffect(() => {
        if (!isOpen) {
            hasAutoFilledRef.current = false;
            return;
        }
        if (hasAutoFilledRef.current) return;
        if (chars?.default_deadline_offset_value && chars?.default_deadline_offset_unit) {
            const offsetDays = getDurationInDays(chars.default_deadline_offset_value, chars.default_deadline_offset_unit);
            if (offsetDays) {
                const newDeadline = new Date();
                newDeadline.setDate(newDeadline.getDate() + Math.ceil(offsetDays));
                setDeadline(newDeadline.toISOString().split('T')[0]);
            }
            hasAutoFilledRef.current = true;
        }
    }, [isOpen, goalType, chars?.default_deadline_offset_value, chars?.default_deadline_offset_unit]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();

        // Validate deadline against DB-driven level constraints (value + unit)
        if (deadline) {
            const { minValue, minUnit, maxValue, maxUnit } = getDeadlineConstraints(goalType);
            const minDays = (minValue != null && minUnit) ? getDurationInDays(minValue, minUnit) : null;
            const maxDays = (maxValue != null && maxUnit) ? getDurationInDays(maxValue, maxUnit) : null;
            const validation = validateDeadlineRange(deadline, minDays, maxDays);
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
                                Description {descriptionRequired && <span style={{ color: 'red' }}>*</span>}
                            </label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="What is this goal about?"
                                rows={2}
                                className={styles.textarea}
                                required={descriptionRequired}
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
