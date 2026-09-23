import React, { useState } from 'react';

import Button from '../atoms/Button';
import Checkbox from '../atoms/Checkbox';
import Input from '../atoms/Input';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Select from '../atoms/Select';
import TextArea from '../atoms/TextArea';
import styles from './CalendarPeriodModal.module.css';

const KIND_OPTIONS = { vacation: 'Vacation', travel: 'Travel', illness: 'Illness', other: 'Other' };
const MAX_SPAN_DAYS = 366;

function validate(values) {
    const errors = {};
    if (!values.name.trim()) errors.name = 'Give this event a name.';
    if (!values.start_date) errors.start_date = 'Choose a start date.';
    if (!values.end_date) errors.end_date = 'Choose an end date.';
    if (values.start_date && values.end_date) {
        if (values.end_date < values.start_date) {
            errors.end_date = 'End date must be on or after the start date.';
        } else {
            const span = (new Date(`${values.end_date}T00:00:00Z`) - new Date(`${values.start_date}T00:00:00Z`))
                / (24 * 60 * 60 * 1000) + 1;
            if (span > MAX_SPAN_DAYS) errors.end_date = `Events can span at most ${MAX_SPAN_DAYS} days.`;
        }
    }
    return errors;
}

function CalendarPeriodForm({ period, pending, onClose, onSubmit, onDelete }) {
    const [values, setValues] = useState(period);
    const [errors, setErrors] = useState({});
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const isEdit = Boolean(period.id);
    const update = (key) => (event) => setValues((current) => ({
        ...current,
        [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }));

    const handleSubmit = (event) => {
        event.preventDefault();
        const nextErrors = validate(values);
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;
        const { id, name, kind, start_date: startDate, end_date: endDate, protects_streaks: protectsStreaks, notes } = values;
        onSubmit({
            ...(id ? { id } : {}),
            name: name.trim(),
            kind,
            start_date: startDate,
            end_date: endDate,
            protects_streaks: protectsStreaks,
            notes,
        });
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            <ModalBody>
                <div className={styles.form}>
                    {period.spansGaps ? (
                        <p className={styles.notice} role="status">
                            Your selection has gaps; the event covers every day from the first to the last selected date.
                        </p>
                    ) : null}
                    <Input label="Name" value={values.name} onChange={update('name')} error={errors.name} maxLength={120} placeholder="e.g. Lisbon" autoFocus fullWidth />
                    <Select label="Kind" value={values.kind} onChange={update('kind')} fullWidth>
                        {Object.entries(KIND_OPTIONS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </Select>
                    <div className={styles.dates}>
                        <Input label="Start date" type="date" value={values.start_date} onChange={update('start_date')} error={errors.start_date} fullWidth />
                        <Input label="End date" type="date" value={values.end_date} onChange={update('end_date')} error={errors.end_date} fullWidth />
                    </div>
                    <div className={styles.protect}>
                        <Checkbox label="Protect streaks" checked={Boolean(values.protects_streaks)} onChange={update('protects_streaks')} />
                        <p className={styles.help}>
                            Scheduled days you don’t complete become rest days and won’t break your streak.
                            Days you do complete still count.
                        </p>
                    </div>
                    <TextArea label="Notes" value={values.notes || ''} onChange={update('notes')} rows={3} fullWidth />
                    {confirmingDelete ? (
                        <div className={styles.confirm} role="alert">
                            <p>Remove this event? Protected days return to their automatic status.</p>
                            <div className={styles.confirmActions}>
                                <Button type="button" variant="secondary" onClick={() => setConfirmingDelete(false)} disabled={pending}>Keep it</Button>
                                <Button type="button" variant="danger" onClick={() => onDelete(period)} disabled={pending}>Remove event</Button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </ModalBody>
            <ModalFooter>
                {isEdit && !confirmingDelete ? (
                    <Button type="button" variant="ghost" className={styles.deleteButton} onClick={() => setConfirmingDelete(true)} disabled={pending}>
                        Remove
                    </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
                <Button type="submit" disabled={pending}>{isEdit ? 'Save event' : 'Add event'}</Button>
            </ModalFooter>
        </form>
    );
}

export default function CalendarPeriodModal({ isOpen, period, pending = false, onClose, onSubmit, onDelete }) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={period?.id ? 'Edit event' : 'Plan event'} size="md">
            {period ? (
                <CalendarPeriodForm
                    key={period.id || `${period.start_date}:${period.end_date}`}
                    period={period}
                    pending={pending}
                    onClose={onClose}
                    onSubmit={onSubmit}
                    onDelete={onDelete}
                />
            ) : null}
        </Modal>
    );
}
