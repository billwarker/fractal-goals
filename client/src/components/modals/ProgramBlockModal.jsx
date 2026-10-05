import React, { useState } from 'react';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import { calendarConflictMessage, findBlockOverlap } from '../../utils/programCalendarConflicts';
import { formatLiteralDate } from '../../utils/dateUtils';
import { DEFAULT_WEEK_START_DAY } from '../../utils/programBlockWeeks';
import BlockLengthField from './BlockLengthField';
import BlockWeekTrackingField from './BlockWeekTrackingField';
import styles from './ProgramBlockModal.module.css';

function buildInitialBlockFormData(initialData) {
    if (!initialData) {
        return {
            name: '',
            startDate: '',
            endDate: '',
            color: '#3A86FF',
            trackWeeks: false,
            weekStartDay: DEFAULT_WEEK_START_DAY,
        };
    }

    return {
        id: initialData.id,
        name: initialData.name || '',
        startDate: initialData.startDate || initialData.start_date || '',
        endDate: initialData.endDate || initialData.end_date || '',
        color: initialData.color || '#3A86FF',
        trackWeeks: Boolean(initialData.track_weeks ?? initialData.trackWeeks),
        weekStartDay: initialData.week_start_day ?? initialData.weekStartDay ?? DEFAULT_WEEK_START_DAY,
    };
}

function getDatePart(value) {
    return value ? String(value).split('T')[0] : '';
}

function clampDateToRange(value, min, max) {
    if (!value) return '';
    if (min && value < min) return min;
    if (max && value > max) return max;
    return value;
}

const ProgramBlockModalInner = ({ onClose, onSave, initialData = null, programDates = {}, siblingBlocks = [] }) => {
    const programStart = getDatePart(programDates.start);
    const programEnd = getDatePart(programDates.end);
    const [formData, setFormData] = useState(() => {
        const initialFormData = buildInitialBlockFormData(initialData);
        const isNewBlock = !initialData?.id;
        const startDate = clampDateToRange(
            getDatePart(initialFormData.startDate) || (isNewBlock ? programStart : ''),
            programStart,
            programEnd
        );
        const endDate = clampDateToRange(
            getDatePart(initialFormData.endDate) || (isNewBlock ? programEnd : ''),
            startDate || programStart,
            programEnd
        );

        return {
            ...initialFormData,
            startDate,
            endDate,
        };
    });
    const [errors, setErrors] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [serverError, setServerError] = useState('');
    const overlap = findBlockOverlap(siblingBlocks, formData);
    const overlapMessage = overlap
        ? `Overlaps ${overlap.name} (${formatLiteralDate(overlap.start_date, { year: undefined })} – ${formatLiteralDate(overlap.end_date, { year: undefined })}). Blocks can't overlap.`
        : '';

    const validate = () => {
        const newErrors = {};
        if (!formData.name.trim()) newErrors.name = 'Name is required';
        if (!formData.startDate) newErrors.startDate = 'Start date is required';
        if (!formData.endDate) newErrors.endDate = 'End date is required';

        if (programStart && formData.startDate && formData.startDate < programStart) {
            newErrors.startDate = 'Start date must be within the program dates';
        }

        if (programEnd && formData.startDate && formData.startDate > programEnd) {
            newErrors.startDate = 'Start date must be within the program dates';
        }

        if (programStart && formData.endDate && formData.endDate < programStart) {
            newErrors.endDate = 'End date must be within the program dates';
        }

        if (programEnd && formData.endDate && formData.endDate > programEnd) {
            newErrors.endDate = 'End date must be within the program dates';
        }

        if (formData.startDate && formData.endDate) {
            if (new Date(formData.endDate) < new Date(formData.startDate)) {
                newErrors.dateRange = 'End date cannot be before start date';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (!validate() || isSaving || overlap) {
            return;
        }

        setIsSaving(true);
        setServerError('');
        try {
            await onSave({
                ...formData,
                track_weeks: formData.trackWeeks,
                week_start_day: formData.weekStartDay,
            });
        } catch (error) {
            // Other failures are already reported by a toast.
            setServerError(calendarConflictMessage(error) || '');
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartDateChange = (event) => {
        const nextStartDate = clampDateToRange(event.target.value, programStart, programEnd);
        const nextEndDate = formData.endDate && formData.endDate < nextStartDate
            ? nextStartDate
            : clampDateToRange(formData.endDate, nextStartDate || programStart, programEnd);

        setServerError('');
        setFormData({
            ...formData,
            startDate: nextStartDate,
            endDate: nextEndDate,
        });
    };

    const handleEndDateChange = (event) => {
        const minEndDate = formData.startDate || programStart;
        setServerError('');
        setFormData({
            ...formData,
            endDate: clampDateToRange(event.target.value, minEndDate, programEnd),
        });
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={initialData?.id ? 'Edit Program Block' : 'Add Program Block'}
        >
            <ModalBody>
                <div className={styles.formContainer}>
                    <Input
                        label="Block Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Base Build Phase 1"
                        autoFocus
                        fullWidth
                        error={errors.name}
                        required
                    />

                    <div className={styles.dateRow}>
                        <Input
                            type="date"
                            label="Start Date"
                            value={formData.startDate}
                            onChange={handleStartDateChange}
                            min={programStart}
                            max={programEnd}
                            fullWidth
                            error={errors.startDate}
                            required
                        />
                        <Input
                            type="date"
                            label="End Date"
                            value={formData.endDate}
                            onChange={handleEndDateChange}
                            min={formData.startDate || programStart}
                            max={programEnd}
                            fullWidth
                            error={errors.endDate}
                            required
                        />
                    </div>

                    <BlockLengthField
                        startDate={formData.startDate}
                        endDate={formData.endDate}
                        programEnd={programEnd}
                        onEndDateChange={(endDate) => {
                            setServerError('');
                            setFormData({ ...formData, endDate });
                        }}
                    />

                    {programStart && programEnd && (
                        <div className={styles.dateHint}>
                            Blocks must stay between {programStart} and {programEnd}.
                        </div>
                    )}

                    <BlockWeekTrackingField
                        startDate={formData.startDate}
                        endDate={formData.endDate}
                        trackWeeks={formData.trackWeeks}
                        weekStartDay={formData.weekStartDay}
                        onChange={({ trackWeeks, weekStartDay }) => {
                            setServerError('');
                            setFormData({ ...formData, trackWeeks, weekStartDay });
                        }}
                    />

                    {errors.dateRange && (
                        <div className={styles.error}>{errors.dateRange}</div>
                    )}

                    {(overlapMessage || serverError) && (
                        <div className={styles.error} role="alert">{overlapMessage || serverError}</div>
                    )}

                    <div className={styles.field}>
                        <label className={styles.colorLabel}>
                            Color Code
                        </label>
                        <div className={styles.colorRow}>
                            <input
                                type="color"
                                value={formData.color}
                                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                className={styles.colorInput}
                            />
                            <span className={styles.colorValue}>{formData.color}</span>
                        </div>
                    </div>
                </div>
            </ModalBody>

            <ModalFooter>
                <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                    Cancel
                </Button>
                <Button variant="primary" onClick={handleSave} isLoading={isSaving} disabled={Boolean(overlap)}>
                    Save Block
                </Button>
            </ModalFooter>
        </Modal>
    );
};

const ProgramBlockModal = ({ isOpen, onClose, onSave, initialData = null, programDates = {}, siblingBlocks = [] }) => {
    if (!isOpen) {
        return null;
    }

    const modalKey = initialData?.id || 'new-program-block';
    return (
        <ProgramBlockModalInner
            key={modalKey}
            onClose={onClose}
            onSave={onSave}
            initialData={initialData}
            programDates={programDates}
            siblingBlocks={siblingBlocks}
        />
    );
};

export default ProgramBlockModal;
