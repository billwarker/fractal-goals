import React, { useState } from 'react';
import { getTypeDisplayName, getChildType } from '../../utils/goalHelpers';
import { validateDeadlineRange, getDurationInDays } from '../../utils/goalCharacteristics';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Input from '../atoms/Input';
import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import toast from 'react-hot-toast';
import styles from './GoalModal.module.css';

function getDefaultDeadline(getLevelCharacteristics, levelType) {
    const levelChars = getLevelCharacteristics(levelType);
    if (!levelChars?.default_deadline_offset_value || !levelChars?.default_deadline_offset_unit) {
        return '';
    }

    const offsetDays = getDurationInDays(
        levelChars.default_deadline_offset_value,
        levelChars.default_deadline_offset_unit
    );
    if (!offsetDays) {
        return '';
    }

    const nextDeadline = new Date();
    nextDeadline.setDate(nextDeadline.getDate() + Math.ceil(offsetDays));
    return nextDeadline.toISOString().split('T')[0];
}

function buildInitialModalState(parent, getLevelCharacteristics) {
    if (!parent) {
        return {
            goalType: 'UltimateGoal',
            deadline: getDefaultDeadline(getLevelCharacteristics, 'UltimateGoal'),
        };
    }

    const parentType = parent.attributes?.type || parent.type;
    const childType = getChildType(parentType) || 'UltimateGoal';
    const parentDeadline = parent.attributes?.deadline || parent.deadline;

    return {
        goalType: childType,
        deadline: parentDeadline ? parentDeadline.split('T')[0] : getDefaultDeadline(getLevelCharacteristics, childType),
    };
}

function GoalModalInner({ onClose, onSubmit, parent }) {
    const { getGoalColor, getGoalTextColor, getGoalIcon, getDeadlineConstraints, getLevelCharacteristics } = useGoalLevels();
    const initialState = buildInitialModalState(parent, getLevelCharacteristics);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [relevanceStatement, setRelevanceStatement] = useState('');
    const [deadline, setDeadline] = useState(initialState.deadline);
    const [goalType, setGoalType] = useState(initialState.goalType);
    const [targets] = useState([]);

    // Handle initial deadline auto-filling and characteristics sync
    const chars = getLevelCharacteristics(goalType);
    const descriptionRequired = chars?.description_required || false;

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

    const themeColor = getGoalColor(goalType);
    const textColor = getGoalTextColor(goalType);
    const modalTitle = parent ? `Add ${getTypeDisplayName(goalType)}` : 'Create New Fractal';

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={modalTitle}
            size="md"
        >
            <form onSubmit={handleSubmit} className={styles.form}>
                <ModalBody>
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
                                max={parent?.attributes?.deadline?.split('T')[0] || parent?.deadline?.split('T')[0]}
                                fullWidth
                            />
                        </div>
                    )}
                </ModalBody>

                <ModalFooter>
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
                </ModalFooter>
            </form>
        </Modal>
    );
};

const GoalModal = ({ isOpen, onClose, onSubmit, parent }) => {
    if (!isOpen) {
        return null;
    }

    const modalKey = parent ? (parent.attributes?.id || parent.id || 'parent-goal') : 'fractal-root';
    return (
        <GoalModalInner
            key={modalKey}
            onClose={onClose}
            onSubmit={onSubmit}
            parent={parent}
        />
    );
};

export default GoalModal;
