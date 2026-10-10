import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import { useActivityGroups, useActivities } from '../../hooks/useActivityQueries';
import { useSessionTemplates } from '../../hooks/useSessionTemplateQueries';
import { useCircuits, useCreateCircuitDefinition } from '../../hooks/useCircuitQueries';
import { formatLiteralDate, getDatePart } from '../../utils/dateUtils';
import TemplateBuilderModal from './TemplateBuilderModal';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import Select from '../atoms/Select';
import styles from './ProgramDayModal.module.css';
import { isQuickSession } from '../../utils/sessionRuntime';

import DeleteConfirmModal from './DeleteConfirmModal';
import { logError } from '../../utils/logger';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import { buildTemplateActivityCatalogue } from './templateBuilderItems';
import ProgramDayScheduleField, { SCHEDULE_MODES } from './ProgramDayScheduleField';
import FocusGoalsField from '../programs/FocusGoalsField';
import { focusError, goalsInScope } from '../../utils/programFocus';
import {
    calendarConflictMessage,
    findDraftDayConflicts,
    occupiedProgramDates,
    takenWeekdays,
} from '../../utils/programCalendarConflicts';

import { buildInitialProgramDayState } from './programDayModalState';

const ProgramDayModalInner = ({ onClose, onSave, onDuplicate, onDelete, rootId, program, initialData, goals = [], focusScope = null }) => {
    const queryClient = useQueryClient();
    const initialState = buildInitialProgramDayState(initialData);
    const [name, setName] = useState(initialState.name);
    const [selectedTemplates, setSelectedTemplates] = useState(initialState.selectedTemplates);
    const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState(initialState.selectedDaysOfWeek);
    const [scheduleMode, setScheduleMode] = useState(initialState.scheduleMode);
    const [specificDates, setSpecificDates] = useState(initialState.specificDates);

    const [completionMinTemplates, setCompletionMinTemplates] = useState(initialState.completionMinTemplates);
    const [goalIds, setGoalIds] = useState(initialState.goalIds);
    const focusGoals = focusScope ? goalsInScope(goals, focusScope) : goals;
    const [isDuplicating, setIsDuplicating] = useState(false);

    // Template builder modal state
    const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const isEdit = Boolean(initialData?.id);
    const programStart = getDatePart(program?.start_date) || '';
    const programEnd = getDatePart(program?.end_date) || '';
    const isDatesMode = scheduleMode === SCHEDULE_MODES.dates;
    const [serverError, setServerError] = useState('');
    // A date holds one program day: show which dates the program's other days already hold.
    const occupiedDates = useMemo(
        () => occupiedProgramDates(program, { excludeDayId: initialData?.id }),
        [program, initialData?.id],
    );
    const weekdayOwners = useMemo(() => takenWeekdays(occupiedDates), [occupiedDates]);
    const [firstConflict] = findDraftDayConflicts(program, occupiedDates, {
        weekdays: isDatesMode ? [] : selectedDaysOfWeek,
        dates: specificDates,
        excludedDates: initialData?.excluded_dates || [],
    });
    const saveBlockedReason = !name.trim()
        ? 'Give the day a name to save it.'
        : isDatesMode && !specificDates.length
            ? 'Add at least one date to save a specific-dates day.'
            : firstConflict
                ? `${formatLiteralDate(firstConflict.date, { weekday: 'short', year: undefined })} already has ${firstConflict.dayName}. A date can hold only one program day.`
                : '';

    const { sessionTemplates = [] } = useSessionTemplates(rootId);
    const availableProgramTemplates = sessionTemplates.filter((template) => !isQuickSession(template));

    const { activities = [] } = useActivities(rootId);
    const { activityGroups = [] } = useActivityGroups(rootId);
    const { data: circuits = [] } = useCircuits(rootId);
    const createCircuitDefinition = useCreateCircuitDefinition(rootId);
    const templateActivities = useMemo(
        () => buildTemplateActivityCatalogue(activities, circuits),
        [activities, circuits],
    );

    const saveTemplateMutation = useMutation({
        mutationFn: async ({ payload, templateId }) => {
            if (templateId) {
                await fractalApi.updateSessionTemplate(rootId, templateId, payload);
                return null;
            }

            const response = await fractalApi.createSessionTemplate(rootId, payload);
            return response.data;
        },
        onSuccess: async (savedTemplate) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sessionTemplates(rootId) });
            if (savedTemplate?.id) {
                setSelectedTemplates((current) => [
                    ...current,
                    { templateId: savedTemplate.id, isRequired: true, order: current.length },
                ]);
            }
            setShowTemplateBuilder(false);
        },
    });

    const handleSave = async () => {
        if (saveBlockedReason) return;
        setServerError('');
        const templateConfigs = selectedTemplates.map((entry, index) => ({
            template_id: entry.templateId,
            is_required: entry.isRequired !== false,
            order: index,
        }));
        const parsedMinTemplates = completionMinTemplates === ''
            ? null
            : Math.max(1, Math.min(Number(completionMinTemplates) || 1, templateConfigs.length || 1));

        try {
            await onSave({
                name,
                template_ids: templateConfigs.map((entry) => entry.template_id),
                template_configs: templateConfigs,
                // Weekdays repeat across the whole program; specific dates are explicit rows.
                day_of_week: isDatesMode ? [] : selectedDaysOfWeek,
                scheduled_dates: specificDates,
                completion_min_templates: parsedMinTemplates,
                goal_ids: goalIds,
            });
        } catch (error) {
            // Other failures are already reported by a toast; the modal stays open.
            setServerError(calendarConflictMessage(error) || focusError(error)?.message || '');
        }
    };

    const handleToggleDay = (day) => {
        setSelectedDaysOfWeek(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const handleAddDate = (value) => {
        setSpecificDates((current) => (current.includes(value) ? current : [...current, value].sort()));
    };

    const handleRemoveDate = (value) => {
        setSpecificDates((current) => current.filter((entry) => entry !== value));
    };

    // The copy keeps templates, goals and notes but starts unscheduled, so it never
    // takes a date from this day.
    const handleDuplicate = async () => {
        if (!onDuplicate || isDuplicating) return;
        setIsDuplicating(true);
        try {
            await onDuplicate(initialData.id);
            onClose();
        } catch {
            // The failure is reported by a toast; the modal stays open.
        } finally {
            setIsDuplicating(false);
        }
    };

    const handleDelete = () => {
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = () => {
        onDelete(initialData.id);
        setShowDeleteConfirm(false);
    };

    const handleAddTemplate = (e) => {
        const val = e.target.value;
        if (val && !selectedTemplates.some((entry) => entry.templateId === val)) {
            setSelectedTemplates([
                ...selectedTemplates,
                { templateId: val, isRequired: true, order: selectedTemplates.length },
            ]);
        }
    };

    const handleRemoveTemplate = (indexToRemove) => {
        setSelectedTemplates((current) => {
            const nextTemplates = current.filter((_, index) => index !== indexToRemove);
            if (completionMinTemplates !== '' && Number(completionMinTemplates) > nextTemplates.length) {
                setCompletionMinTemplates(nextTemplates.length > 0 ? String(nextTemplates.length) : '');
            }
            return nextTemplates;
        });
    };

    const handleToggleRequired = (indexToToggle) => {
        setSelectedTemplates((current) => current.map((entry, index) => (
            index === indexToToggle
                ? { ...entry, isRequired: entry.isRequired === false }
                : entry
        )));
    };

    const requiredTemplateCount = selectedTemplates.filter((entry) => entry.isRequired !== false).length;
    const completionSummaryParts = [];
    if (requiredTemplateCount > 0) {
        completionSummaryParts.push(`Requires ${requiredTemplateCount} required session${requiredTemplateCount === 1 ? '' : 's'}`);
    }
    if (completionMinTemplates !== '') {
        completionSummaryParts.push(`at least ${completionMinTemplates} total`);
    }
    const completionSummary = completionSummaryParts.length > 0
        ? completionSummaryParts.join(' and ')
        : 'Completes after any selected session is completed';

    const handleTemplateBuilderSave = async (payload, templateId) => {
        try {
            await saveTemplateMutation.mutateAsync({ payload, templateId });
        } catch (err) {
            logError("Failed to save template", err);
            notify.error(`Failed to save template: ${formatError(err)}`);
        }
    };

    return (
        <>
            <Modal
                isOpen={true}
                onClose={onClose}
                title={isEdit ? 'Edit Program Day' : 'New Program Day'}
                size="md"
            >
                <ModalBody>
                    <div className={styles.content}>
                        <Input
                            label="Day Name *"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g., Leg Day or Day 1"
                            fullWidth
                        />

                        <FocusGoalsField
                            label="Day goals"
                            goals={focusGoals}
                            selectedGoalIds={goalIds}
                            onChange={setGoalIds}
                            required={false}
                            pickerTitle="Select the goals this day serves"
                            emptyMessage="Add goals to the program to focus its days."
                            hint="Optional. Sessions started from this day are scoped to these goals, otherwise to the program's goals."
                        />

                        <ProgramDayScheduleField
                            mode={scheduleMode}
                            onModeChange={setScheduleMode}
                            weekdays={selectedDaysOfWeek}
                            onToggleWeekday={handleToggleDay}
                            dates={specificDates}
                            onAddDate={handleAddDate}
                            onRemoveDate={handleRemoveDate}
                            minDate={programStart}
                            maxDate={programEnd}
                            takenWeekdays={weekdayOwners}
                            occupiedDates={occupiedDates}
                        />

                        <div className={styles.field}>
                            <label className={styles.label}>Sessions</label>
                            <div className={styles.sessionList}>
                                {selectedTemplates.map((entry, idx) => {
                                    const t = sessionTemplates.find(st => st.id === entry.templateId);
                                    return (
                                        <div key={entry.templateId} className={styles.sessionItem}>
                                            <span className={styles.sessionName}>{t ? t.name : 'Unknown Template'}</span>
                                            <label className={styles.requiredCheckboxLabel}>
                                                <input
                                                    type="checkbox"
                                                    checked={entry.isRequired !== false}
                                                    onChange={() => handleToggleRequired(idx)}
                                                    className={styles.checkbox}
                                                    aria-label={`Mark ${t ? t.name : 'template'} required`}
                                                />
                                                <span>Required</span>
                                            </label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveTemplate(idx)}
                                                className={styles.removeSessionBtn}
                                                aria-label="Remove Template"
                                            >
                                                &times;
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className={styles.sessionActions}>
                                <Select
                                    value=""
                                    onChange={handleAddTemplate}
                                    className={styles.templateSelect}
                                    fullWidth
                                >
                                    <option value="">+ Add Session Template</option>
                                    {availableProgramTemplates.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </Select>
                                <Button
                                    onClick={() => setShowTemplateBuilder(true)}
                                    size="sm"
                                    variant="secondary"
                                >
                                    + New
                                </Button>
                            </div>
                            {selectedTemplates.length > 0 && (
                                <div className={styles.completionRuleRow}>
                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={completionMinTemplates !== ''}
                                            onChange={(event) => setCompletionMinTemplates(event.target.checked ? String(Math.min(1, selectedTemplates.length)) : '')}
                                            className={styles.checkbox}
                                        />
                                        <span>At least</span>
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={selectedTemplates.length}
                                        disabled={completionMinTemplates === ''}
                                        value={completionMinTemplates}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            if (value === '') {
                                                setCompletionMinTemplates('');
                                                return;
                                            }
                                            setCompletionMinTemplates(String(Math.max(1, Math.min(Number(value) || 1, selectedTemplates.length))));
                                        }}
                                        className={styles.minTemplatesInput}
                                        aria-label="Minimum completed sessions"
                                    />
                                    <span className={styles.completionRuleText}>completed</span>
                                </div>
                            )}
                            {selectedTemplates.length > 0 && (
                                <div className={styles.hint}>{completionSummary}.</div>
                            )}
                        </div>

                        {isEdit && onDuplicate && (
                            <div className={styles.copyArea}>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleDuplicate}
                                    isLoading={isDuplicating}
                                    fullWidth
                                >
                                    Duplicate day
                                </Button>
                                <div className={styles.hint}>
                                    Makes an unscheduled copy with the same sessions and goals.
                                </div>
                            </div>
                        )}
                    </div>
                </ModalBody>

                <ModalFooter>
                    {isEdit ? (
                        <Button variant="danger" onClick={handleDelete}>
                            Delete Day
                        </Button>
                    ) : <div />}

                    <div className={styles.rightActions} style={{ display: 'flex', gap: '8px' }}>
                        {saveBlockedReason ? (
                            <span id="program-day-save-blocked" className={styles.saveBlockedReason}>{saveBlockedReason}</span>
                        ) : serverError ? (
                            <span className={styles.saveBlockedReason} role="alert">{serverError}</span>
                        ) : null}
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSave}
                            disabled={Boolean(saveBlockedReason)}
                            aria-describedby={saveBlockedReason ? 'program-day-save-blocked' : undefined}
                        >
                            {isEdit ? 'Save Changes' : 'Create Day'}
                        </Button>
                    </div>
                </ModalFooter>
            </Modal>

            <TemplateBuilderModal
                isOpen={showTemplateBuilder}
                onClose={() => setShowTemplateBuilder(false)}
                onSave={handleTemplateBuilderSave}
                editingTemplate={null}
                activities={templateActivities}
                activityGroups={activityGroups}
                rootId={rootId}
                stackLevel={1}
                onCreateCircuitDefinition={createCircuitDefinition}
            />

            <DeleteConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleConfirmDelete}
                title="Delete Program Day"
                message={`Are you sure you want to delete "${name}"? This will remove all scheduled sessions for this day.`}
            />
        </>
    );
};

const ProgramDayModal = ({ isOpen, onClose, onSave, onDuplicate, onDelete, rootId, program = null, initialData, goals = [], focusScope = null }) => {
    if (!isOpen) {
        return null;
    }

    const modalKey = initialData?.id || `new-day:${(initialData?.scheduled_dates || []).join(',') || 'blank'}`;
    return (
        <ProgramDayModalInner
            key={modalKey}
            onClose={onClose}
            onSave={onSave}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            rootId={rootId}
            program={program}
            initialData={initialData}
            goals={goals}
            focusScope={focusScope}
        />
    );
};

export default ProgramDayModal;
