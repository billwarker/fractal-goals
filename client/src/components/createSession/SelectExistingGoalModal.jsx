import React, { useState } from 'react';

import Button from '../atoms/Button';
import EmptyState from '../common/EmptyState';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import styles from './SelectExistingGoalModal.module.css';

function SelectExistingGoalModal({
    isOpen,
    existingImmediateGoals,
    alreadyAddedGoalIds,
    onClose,
    onConfirm,
}) {
    const [tempSelectedGoals, setTempSelectedGoals] = useState([]);

    const handleConfirm = () => {
        onConfirm(tempSelectedGoals);
        setTempSelectedGoals([]);
    };

    const handleClose = () => {
        setTempSelectedGoals([]);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Select Existing Immediate Goal(s)"
            size="md"
        >
            <ModalBody>
                <h2 className={styles.heading}>Existing Immediate Goals</h2>

                {existingImmediateGoals.length === 0 ? (
                    <EmptyState description="No existing immediate goals found." />
                ) : (
                    <div className={styles.goalList}>
                        {existingImmediateGoals.map((goal) => {
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
                                            setTempSelectedGoals((prev) => (
                                                prev.includes(goal.id)
                                                    ? prev.filter((id) => id !== goal.id)
                                                    : [...prev, goal.id]
                                            ));
                                        }
                                    }}
                                />
                            );
                        })}
                    </div>
                )}
            </ModalBody>

            <ModalFooter>
                <Button type="button" onClick={handleClose} variant="secondary">
                    Cancel
                </Button>
                <Button
                    type="button"
                    onClick={handleConfirm}
                    disabled={tempSelectedGoals.length === 0}
                    variant="primary"
                >
                    Add Selected ({tempSelectedGoals.length})
                </Button>
            </ModalFooter>
        </Modal>
    );
}

function GoalSelectionCard({ goal, isSelected, isAlreadyAdded, onToggle }) {
    const { getGoalColor } = useGoalLevels();
    const goalColor = getGoalColor('ImmediateGoal');

    return (
        <button
            type="button"
            onClick={onToggle}
            className={`${styles.goalCard} ${isAlreadyAdded ? styles.goalCardDisabled : ''}`}
            style={{
                '--goal-color': goalColor,
                background: isSelected ? `${goalColor}1A` : undefined,
                borderColor: isSelected ? goalColor : undefined,
            }}
        >
            <div
                className={`${styles.checkbox} ${(isSelected || isAlreadyAdded) ? styles.checkboxSelected : ''}`}
                style={{
                    borderColor: isSelected ? goalColor : undefined,
                    background: isSelected ? goalColor : undefined,
                }}
            >
                {(isSelected || isAlreadyAdded) ? '✓' : null}
            </div>

            <div className={styles.goalContent}>
                <div className={styles.goalName} style={{ color: (isSelected || isAlreadyAdded) ? goalColor : undefined }}>
                    {goal.name}
                    {isAlreadyAdded ? <span className={styles.alreadyAdded}>(Already added)</span> : null}
                </div>
                {goal.description ? <div className={styles.goalDescription}>{goal.description}</div> : null}
                {goal.deadline ? (
                    <div className={styles.goalDeadline}>
                        {new Date(goal.deadline).toLocaleDateString()}
                    </div>
                ) : null}
            </div>
        </button>
    );
}

export default SelectExistingGoalModal;
