import React, { useMemo, useState } from 'react';
import moment from 'moment';
import notify from '../../utils/notify';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import { Text } from '../atoms/Typography';
import GoalAssociationPicker from '../goals/GoalAssociationPicker';
import styles from './AttachGoalModal.module.css';

function normalizeDateValue(value) {
    if (!value) {
        return '';
    }
    return String(value).slice(0, 10);
}

const AttachGoalModalInner = ({ onClose, onSave, goals = [], block, associatedGoalIds = [] }) => {
    const [selectedGoalId, setSelectedGoalId] = useState('');
    const [deadline, setDeadline] = useState('');
    const associatedGoalIdSet = useMemo(() => new Set(associatedGoalIds), [associatedGoalIds]);

    const handleSubmit = () => {
        if (!selectedGoalId) {
            notify.error('Please select a goal');
            return;
        }
        if (!deadline) {
            notify.error('Please set a deadline');
            return;
        }
        onSave({ goal_id: selectedGoalId, deadline });
    };

    const handleGoalSelect = (goal) => {
        setSelectedGoalId(goal.id);
        if (associatedGoalIdSet.has(goal.id)) {
            setDeadline(normalizeDateValue(goal.deadline));
            return;
        }
        setDeadline('');
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={`Attach Goal to ${block?.name || 'Block'}`}
            size="md"
        >
            <ModalBody>
                <div className={styles.section}>
                    <Text size="sm" weight="medium" className={styles.label} style={{ marginBottom: '8px', display: 'block' }}>
                        SELECT GOAL
                    </Text>

                    <GoalAssociationPicker
                        goals={goals}
                        selectedGoalId={selectedGoalId}
                        onSelectGoal={handleGoalSelect}
                        associatedGoalIds={associatedGoalIds}
                        associationLabel="Attached"
                        getAssociationMeta={(goal) => (
                            normalizeDateValue(goal.deadline)
                                ? `Current deadline: ${moment(goal.deadline).format('MMM D, YYYY')}`
                                : null
                        )}
                        emptyState="No goals available in this program. Add goals to the program first."
                        inputName="attach-goal"
                    />
                </div>

                {selectedGoalId && block && (
                    <div className={styles.section}>
                        <Text size="sm" weight="medium" style={{ marginBottom: '8px', display: 'block' }}>
                            SET DEADLINE (Range: {moment(block.start_date).format('MMM D')} - {moment(block.end_date).format('MMM D')})
                        </Text>
                        <Input
                            type="date"
                            value={deadline}
                            onChange={e => setDeadline(e.target.value)}
                            min={block.start_date}
                            max={block.end_date}
                            fullWidth
                        />
                        <Text size="xs" color="muted" style={{ marginTop: '4px' }}>
                            This matches the deadline of the goal to the selected date.
                        </Text>
                    </div>
                )}
            </ModalBody>

            <ModalFooter>
                <Button variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={!selectedGoalId || !deadline}
                >
                    Attach Goal
                </Button>
            </ModalFooter>
        </Modal>
    );
};

const AttachGoalModal = ({ isOpen, onClose, onSave, goals = [], block, associatedGoalIds = [] }) => {
    if (!isOpen) {
        return null;
    }

    const modalKey = block?.id || 'attach-goal';
    return (
        <AttachGoalModalInner
            key={modalKey}
            onClose={onClose}
            onSave={onSave}
            goals={goals}
            block={block}
            associatedGoalIds={associatedGoalIds}
        />
    );
};

export default AttachGoalModal;
