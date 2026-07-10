import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { flattenGoals } from '../../utils/goalHelpers';
import { useFractalTree } from '../../hooks/useGoalQueries';
import { getWeeksSpanned } from '../../utils/dateUtils';
import { PROGRAM_COLORS } from '../../utils/programViewModel';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import GoalHierarchySelectionModal from '../goals/GoalHierarchySelectionModal';
import Hint from '../onboarding/Hint';
import styles from './ProgramBuilder.module.css';

function buildInitialProgramData(initialData, initialStartDate = '', initialEndDate = '') {
    if (!initialData) {
        return {
            name: '',
            description: '',
            color: PROGRAM_COLORS[0],
            selectedGoals: [],
            startDate: initialStartDate,
            endDate: initialEndDate,
        };
    }

    return {
        name: initialData.name || '',
        description: initialData.description || '',
        color: initialData.color || PROGRAM_COLORS[0],
        selectedGoals: initialData.goal_ids || [],
        startDate: initialData.start_date ? initialData.start_date.split('T')[0] : '',
        endDate: initialData.end_date ? initialData.end_date.split('T')[0] : '',
    };
}

/**
 * ProgramBuilder Modal - Program creation/editing (Metadata only)
 */
function ProgramBuilderInner({
    onClose,
    onSave,
    initialData = null,
    initialStartDate = '',
    initialEndDate = '',
    title,
    submitLabel,
}) {
    const { rootId } = useParams();
    const [errors, setErrors] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isGoalPickerOpen, setIsGoalPickerOpen] = useState(false);

    const [programData, setProgramData] = useState(() => buildInitialProgramData(initialData, initialStartDate, initialEndDate));

    // Calculate number of weeks between dates
    const calculateWeeks = () => {
        if (!programData.startDate || !programData.endDate) return 0;
        const weeks = getWeeksSpanned(programData.startDate, programData.endDate);
        return weeks > 0 ? weeks : 0;
    };

    const goalsTreeQuery = useFractalTree(rootId);

    const goals = useMemo(() => {
        if (!goalsTreeQuery.data) {
            return [];
        }

        return flattenGoals([goalsTreeQuery.data]);
    }, [goalsTreeQuery.data]);

    const handleSelectedGoalsChange = (selectedGoals) => {
        setProgramData({
            ...programData,
            selectedGoals,
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

    const handleSave = async () => {
        if (validateForm()) {
            try {
                setIsSaving(true);
                await onSave(programData);
                handleClose();
            } catch (error) {
                setErrors((currentErrors) => ({
                    ...currentErrors,
                    form: error?.response?.data?.error || error?.message || 'Failed to save program',
                }));
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleClose = () => {
        if (isGoalPickerOpen) {
            setIsGoalPickerOpen(false);
            return;
        }
        onClose();
    };

    const selectedGoalNames = useMemo(() => {
        const goalById = new Map(goals.map((goal) => [goal.id || goal.attributes?.id, goal.name || goal.attributes?.name]));
        return programData.selectedGoals
            .map((goalId) => goalById.get(goalId))
            .filter(Boolean);
    }, [goals, programData.selectedGoals]);

    return (
        <>
            <Modal
                isOpen={true}
                onClose={handleClose}
                title={title || (initialData ? 'Edit Program' : 'Create Program')}
                size="md"
                closeOnEsc={!isGoalPickerOpen}
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

                        <Hint id="program-goals-rhythm" title="Connect a goal and a rhythm" description="Select the goal this program supports, then choose the date window. You can shape individual days after creation.">
                        <div className={styles.field}>
                            <label className={styles.label}>Target Goals * (Select at least one)</label>
                            <div className={styles.goalPickerSummary}>
                                <div className={styles.goalPickerSummaryText}>
                                    <span className={styles.goalPickerCount}>
                                        {programData.selectedGoals.length} / {goals.length} selected
                                    </span>
                                    {selectedGoalNames.length > 0 ? (
                                        <span className={styles.goalPickerNames}>
                                            {selectedGoalNames.slice(0, 3).join(', ')}
                                            {selectedGoalNames.length > 3 ? ` +${selectedGoalNames.length - 3} more` : ''}
                                        </span>
                                    ) : (
                                        <span className={styles.goalPickerNames}>No target goals selected</span>
                                    )}
                                </div>
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsGoalPickerOpen(true)}
                                    disabled={goals.length === 0}
                                >
                                    Select Goals
                                </Button>
                            </div>
                            {goals.length === 0 && (
                                <div className={styles.emptyGoals}>
                                    No eligible goals found
                                </div>
                            )}
                            {errors.goals && <div className={styles.errorText}>{errors.goals}</div>}
                        </div>
                        </Hint>

                    <div className={styles.field}>
                        <label className={styles.colorLabel}>
                            Color Code
                        </label>
                        <div className={styles.colorRow}>
                            <input
                                type="color"
                                className={styles.colorInput}
                                value={programData.color}
                                onChange={(event) => setProgramData({ ...programData, color: event.target.value })}
                                aria-label="Program color"
                            />
                            <span className={styles.colorValue}>{programData.color}</span>
                        </div>
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
                    {errors.form && <div className={styles.errorText}>{errors.form}</div>}
                    </div>
                </ModalBody>

                <ModalFooter>
                    <Button variant="secondary" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : (submitLabel || (initialData ? 'Save Changes' : 'Create Program'))}
                    </Button>
                </ModalFooter>
            </Modal>

            <GoalHierarchySelectionModal
                isOpen={isGoalPickerOpen}
                onClose={() => setIsGoalPickerOpen(false)}
                title="Select Target Goals"
                goals={goals}
                selectedGoalIds={programData.selectedGoals}
                selectionMode="multiple"
                searchPlaceholder="Search target goals..."
                emptyState="No goals available."
                highlightSelectionAncestors
                connectorHighlightMode="lineage"
                showGoalHighlightHalo
                onConfirm={handleSelectedGoalsChange}
            />
        </>
    );
}

function ProgramBuilder({
    isOpen,
    onClose,
    onSave,
    initialData = null,
    initialStartDate = '',
    initialEndDate = '',
    title,
    submitLabel,
}) {
    if (!isOpen) {
        return null;
    }

    const modalKey = `${initialData?.id || 'new-program'}-${initialStartDate}-${initialEndDate}-${title || ''}`;
    return (
        <ProgramBuilderInner
            key={modalKey}
            onClose={onClose}
            onSave={onSave}
            initialData={initialData}
            initialStartDate={initialStartDate}
            initialEndDate={initialEndDate}
            title={title}
            submitLabel={submitLabel}
        />
    );
}

export default ProgramBuilder;
