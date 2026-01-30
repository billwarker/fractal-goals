import React, { useState, useEffect } from 'react';
import moment from 'moment';
import notify from '../../utils/notify';
import Modal from '../atoms/Modal';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import { Heading, Text } from '../atoms/Typography';
import styles from './AttachGoalModal.module.css';

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
            notify.error('Please select a goal');
            return;
        }
        if (!deadline) {
            notify.error('Please set a deadline');
            return;
        }
        onSave({ goal_id: selectedGoalId, deadline });
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Attach Goal to ${block?.name || 'Block'}`}
            size="md"
        >
            <div className={styles.section}>
                <Text size="sm" weight="medium" className={styles.label} style={{ marginBottom: '8px', display: 'block' }}>
                    SELECT GOAL
                </Text>

                <div className={styles.goalList}>
                    {goals.length === 0 ? (
                        <div className={styles.emptyState}>
                            No goals available in this program. Add goals to the program first.
                        </div>
                    ) : (
                        goals.map(g => (
                            <label key={g.id} className={styles.goalItem}>
                                <input
                                    type="radio"
                                    name="goal"
                                    checked={selectedGoalId === g.id}
                                    onChange={() => setSelectedGoalId(g.id)}
                                    className={styles.radioInput}
                                />
                                <div className={styles.goalInfo}>
                                    <Text weight="medium">{g.name}</Text>
                                    <span className={styles.goalType}>
                                        {g.attributes?.type?.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                </div>
                            </label>
                        ))
                    )}
                </div>
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

            <div className={styles.footerActions}>
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
            </div>
        </Modal>
    );
};

export default AttachGoalModal;
