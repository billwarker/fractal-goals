import React, { useMemo, useState } from 'react';
import moment from 'moment';
import { useParams } from 'react-router-dom';

import { flattenGoals } from '../../utils/goalHelpers';
import { useFractalTree } from '../../hooks/useGoalQueries';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import styles from './ProgramBuilder.module.css';

function buildInitialProgramData(initialData) {
    if (!initialData) {
        return {
            name: '',
            description: '',
            selectedGoals: [],
            startDate: '',
            endDate: '',
        };
    }

    return {
        name: initialData.name || '',
        description: initialData.description || '',
        selectedGoals: initialData.goal_ids || [],
        startDate: initialData.start_date ? initialData.start_date.split('T')[0] : '',
        endDate: initialData.end_date ? initialData.end_date.split('T')[0] : '',
    };
}

/**
 * ProgramBuilder Modal - Program creation/editing (Metadata only)
 */
function ProgramBuilderInner({ onClose, onSave, initialData = null }) {
    const { rootId } = useParams();
    const [errors, setErrors] = useState({});

    const [programData, setProgramData] = useState(() => buildInitialProgramData(initialData));

    // Calculate number of weeks between dates
    const calculateWeeks = () => {
        if (!programData.startDate || !programData.endDate) return 0;
        const start = moment(programData.startDate);
        const end = moment(programData.endDate);
        const weeks = Math.ceil(end.diff(start, 'weeks', true));
        return weeks > 0 ? weeks : 0;
    };

    const goalsTreeQuery = useFractalTree(rootId);

    const goals = useMemo(() => {
        if (!goalsTreeQuery.data) {
            return [];
        }

        return flattenGoals([goalsTreeQuery.data]).filter((goal) =>
            ['MidTermGoal', 'LongTermGoal'].includes(goal.attributes?.type)
        );
    }, [goalsTreeQuery.data]);

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
        onClose();
    };

    return (
        <Modal
            isOpen={true}
            onClose={handleClose}
            title={initialData ? 'Edit Program' : 'Create Program'}
            size="md"
        >
            <ModalBody>
                <div className={styles.form}>
                    <Input
                        label="Program Name *"
                        value={programData.name}
                        onChange={(e) => setProgramData({ ...programData, name: e.target.value })}
                        placeholder="e.g., Spring Marathon Training"
                        error={errors.name}
                        required
                        fullWidth
                    />

                    <div className={styles.field}>
                        <label htmlFor="program-description" className={styles.label}>Description</label>
                        <textarea
                            id="program-description"
                            className={styles.textarea}
                            value={programData.description}
                            onChange={(e) => setProgramData({ ...programData, description: e.target.value })}
                            placeholder="What is this program about? (Optional)"
                            rows={3}
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>Target Goals * (Select at least one)</label>
                        <div className={styles.goalsContainer}>
                            {goals.length === 0 ? (
                                <div className={styles.emptyGoals}>
                                    No eligible goals found
                                </div>
                            ) : (
                                <div className={styles.goalList}>
                                    {['LongTermGoal', 'MidTermGoal'].map(goalType => {
                                        const typeGoals = goals.filter(g => g.attributes?.type === goalType);
                                        if (typeGoals.length === 0) return null;

                                        const typeLabel = goalType === 'LongTermGoal' ? 'Long Term Goals' :
                                            goalType === 'MidTermGoal' ? 'Mid Term Goals' :
                                                'Short Term Goals';
                                        const typeColor = goalType === 'LongTermGoal' ? '#7B5CFF' :
                                            goalType === 'MidTermGoal' ? '#3A86FF' :
                                                '#4ECDC4';

                                        return (
                                            <div key={goalType} className={styles.goalTypeGroup}>
                                                <div
                                                    className={styles.goalTypeHeader}
                                                    style={{ '--type-color': typeColor }}
                                                >
                                                    <span>{typeLabel}</span>
                                                    <span style={{ fontSize: '11px', opacity: 0.7 }}>
                                                        {typeGoals.filter(g => programData.selectedGoals.includes(g.id)).length} / {typeGoals.length} selected
                                                    </span>
                                                </div>

                                                <div className={styles.goalList}>
                                                    {typeGoals.map(goal => {
                                                        const isSelected = programData.selectedGoals.includes(goal.id);
                                                        return (
                                                            <div
                                                                key={goal.id}
                                                                onClick={() => toggleGoal(goal.id)}
                                                                className={`${styles.goalItem} ${isSelected ? styles.goalItemSelected : ''}`}
                                                                style={{
                                                                    '--selection-bg': typeColor + '22',
                                                                    '--type-color': typeColor
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={() => { }}
                                                                    style={{ accentColor: typeColor }}
                                                                />
                                                                <div className={styles.goalInfo}>
                                                                    <div className={styles.goalName}>{goal.name}</div>
                                                                    {goal.attributes?.description && (
                                                                        <div className={styles.goalDescription}>
                                                                            {goal.attributes.description.length > 60 ? goal.attributes.description.substring(0, 60) + '...' : goal.attributes.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        {errors.goals && <div className={styles.errorText}>{errors.goals}</div>}
                    </div>

                    <div className={styles.dateGrid}>
                        <Input
                            type="date"
                            label="Start Date *"
                            value={programData.startDate}
                            onChange={(e) => setProgramData({ ...programData, startDate: e.target.value })}
                            error={errors.startDate}
                            required
                            fullWidth
                        />
                        <Input
                            type="date"
                            label="End Date *"
                            value={programData.endDate}
                            onChange={(e) => setProgramData({ ...programData, endDate: e.target.value })}
                            error={errors.endDate}
                            required
                            fullWidth
                        />
                    </div>
                    {errors.dateRange && <div className={styles.errorText}>{errors.dateRange}</div>}

                    {programData.startDate && programData.endDate && calculateWeeks() > 0 && (
                        <div className={styles.durationCard}>
                            <div className={styles.durationLabel}>Program Duration</div>
                            <div className={styles.durationValue}>
                                {calculateWeeks()} {calculateWeeks() === 1 ? 'Week' : 'Weeks'}
                            </div>
                        </div>
                    )}
                </div>
            </ModalBody>

            <ModalFooter>
                <Button variant="secondary" onClick={handleClose}>
                    Cancel
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    {initialData ? 'Save Changes' : 'Create Program'}
                </Button>
            </ModalFooter>
        </Modal>
    );
}

function ProgramBuilder({ isOpen, onClose, onSave, initialData = null }) {
    if (!isOpen) {
        return null;
    }

    const modalKey = initialData?.id || 'new-program';
    return (
        <ProgramBuilderInner
            key={modalKey}
            onClose={onClose}
            onSave={onSave}
            initialData={initialData}
        />
    );
}

export default ProgramBuilder;
