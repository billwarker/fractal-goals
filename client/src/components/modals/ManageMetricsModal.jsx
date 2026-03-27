import React, { useState } from 'react';
import PropTypes from 'prop-types';

import {
    useFractalMetrics,
    useCreateFractalMetric,
    useUpdateFractalMetric,
    useDeleteFractalMetric,
} from '../../hooks/useActivityQueries';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import TextArea from '../atoms/TextArea';
import DeleteConfirmModal from './DeleteConfirmModal';
import styles from './ManageMetricsModal.module.css';

const INPUT_TYPES = [
    { value: 'number', label: 'Number (decimal)' },
    { value: 'integer', label: 'Integer (whole)' },
    { value: 'duration', label: 'Duration (MM:SS)' },
];

const EMPTY_FORM = {
    name: '',
    unit: '',
    is_multiplicative: true,
    is_additive: true,
    input_type: 'number',
    default_value: '',
    higher_is_better: null,
    predefined_values: '',
    min_value: '',
    max_value: '',
    description: '',
};

function parsePredefinedValues(str) {
    if (!str || !str.trim()) return null;
    const parts = str.split(',').map((s) => s.trim()).filter(Boolean);
    const nums = parts.map(Number);
    if (nums.some(isNaN)) return null;
    return nums;
}

function MetricBadge({ label }) {
    return <span className={styles.badge}>{label}</span>;
}

function ManageMetricsModal({ isOpen, onClose, rootId }) {
    const { fractalMetrics = [], isLoading } = useFractalMetrics(rootId);
    const createMutation = useCreateFractalMetric(rootId);
    const updateMutation = useUpdateFractalMetric(rootId);
    const deleteMutation = useDeleteFractalMetric(rootId);

    const [editingId, setEditingId] = useState(null);
    const [copyingFrom, setCopyingFrom] = useState(null); // name of metric being copied
    const [form, setForm] = useState(EMPTY_FORM);
    const [metricToDelete, setMetricToDelete] = useState(null);

    const handleClose = () => {
        setEditingId(null);
        setCopyingFrom(null);
        setMetricToDelete(null);
        setForm(EMPTY_FORM);
        onClose();
    };

    const handleEdit = (metric) => {
        setEditingId(metric.id);
        setCopyingFrom(null);
        setForm({
            name: metric.name || '',
            unit: metric.unit || '',
            is_multiplicative: metric.is_multiplicative ?? true,
            is_additive: metric.is_additive ?? true,
            input_type: metric.input_type || 'number',
            default_value: metric.default_value != null ? String(metric.default_value) : '',
            higher_is_better: metric.higher_is_better ?? null,
            predefined_values: metric.predefined_values ? metric.predefined_values.join(', ') : '',
            min_value: metric.min_value != null ? String(metric.min_value) : '',
            max_value: metric.max_value != null ? String(metric.max_value) : '',
            description: metric.description || '',
        });
    };

    const handleCopy = (metric) => {
        setEditingId(null);
        setCopyingFrom(metric.name);
        setForm({
            name: metric.name || '',
            unit: metric.unit || '',
            is_multiplicative: metric.is_multiplicative ?? true,
            is_additive: metric.is_additive ?? true,
            input_type: metric.input_type || 'number',
            default_value: metric.default_value != null ? String(metric.default_value) : '',
            higher_is_better: metric.higher_is_better ?? null,
            predefined_values: metric.predefined_values ? metric.predefined_values.join(', ') : '',
            min_value: metric.min_value != null ? String(metric.min_value) : '',
            max_value: metric.max_value != null ? String(metric.max_value) : '',
            description: metric.description || '',
        });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setCopyingFrom(null);
        setForm(EMPTY_FORM);
    };

    const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

    const handleSubmit = async () => {
        const predefined = parsePredefinedValues(form.predefined_values);
        if (form.predefined_values.trim() && predefined === null) {
            notify.error('Predefined values must be comma-separated numbers');
            return;
        }

        const payload = {
            name: form.name.trim(),
            unit: form.unit.trim(),
            is_multiplicative: form.is_multiplicative,
            is_additive: form.is_additive,
            input_type: form.input_type,
            default_value: form.default_value !== '' ? Number(form.default_value) : null,
            higher_is_better: form.higher_is_better,
            predefined_values: predefined,
            min_value: form.min_value !== '' ? Number(form.min_value) : null,
            max_value: form.max_value !== '' ? Number(form.max_value) : null,
            description: form.description.trim() || null,
        };

        try {
            if (editingId) {
                await updateMutation.mutateAsync({ metricId: editingId, ...payload });
                notify.success(`"${payload.name}" updated`);
            } else if (copyingFrom) {
                await createMutation.mutateAsync(payload);
                notify.success(`"${payload.name}" created (copied from "${copyingFrom}")`);
            } else {
                await createMutation.mutateAsync(payload);
                notify.success(`"${payload.name}" created`);
            }
            setCopyingFrom(null);
            handleCancelEdit();
        } catch (error) {
            notify.error(`Failed to save metric: ${formatError(error)}`);
        }
    };

    const handleDelete = async () => {
        if (!metricToDelete) return;
        try {
            await deleteMutation.mutateAsync(metricToDelete.id);
            notify.success(`"${metricToDelete.name}" deleted`);
            setMetricToDelete(null);
            if (editingId === metricToDelete.id) handleCancelEdit();
        } catch (error) {
            notify.error(`Failed to delete metric: ${formatError(error)}`);
        }
    };

    if (!isOpen) return null;

    const isSaving = createMutation.isPending || updateMutation.isPending;
    const canSubmit = form.name.trim() && form.unit.trim() && !isSaving;

    return (
        <>
            <Modal isOpen={isOpen} onClose={handleClose} title="Manage Metrics" size="xl">
                <ModalBody noPadding>
                    <div className={styles.content}>
                        {/* ── Left: scrollable list ── */}
                        <div className={styles.listSection}>
                            <div className={styles.listSectionInner}>
                                <div className={styles.sectionHeading}>Metrics</div>
                                {isLoading ? (
                                    <div className={styles.emptyState}>Loading...</div>
                                ) : fractalMetrics.length === 0 ? (
                                    <div className={styles.emptyState}>No metrics yet. Create one to get started.</div>
                                ) : (
                                    <ul className={styles.metricList}>
                                        {fractalMetrics.map((m) => (
                                            <li
                                                key={m.id}
                                                className={`${styles.metricRow} ${editingId === m.id ? styles.metricRowSelected : ''}`}
                                                onClick={() => handleEdit(m)}
                                            >
                                                <div className={styles.metricTop}>
                                                    <div className={styles.metricNameRow}>
                                                        <span className={styles.metricName}>{m.name}</span>
                                                        <div className={styles.badges}>
                                                            {m.is_multiplicative && <MetricBadge label="×" />}
                                                            {m.is_additive && <MetricBadge label="+" />}
                                                            {m.input_type !== 'number' && <MetricBadge label={m.input_type} />}
                                                        </div>
                                                    </div>
                                                    <div className={styles.metricActions}>
                                                        <button type="button" className={styles.linkButton} onClick={(e) => { e.stopPropagation(); handleCopy(m); }}>
                                                            Copy
                                                        </button>
                                                        <button type="button" className={styles.linkButton} onClick={(e) => { e.stopPropagation(); handleEdit(m); }}>
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`${styles.linkButton} ${styles.deleteButton}`}
                                                            onClick={(e) => { e.stopPropagation(); setMetricToDelete(m); }}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className={styles.metricBottom}>
                                                    <span className={styles.metricUnit}>{m.unit}</span>
                                                    {m.activity_count > 0 && (
                                                        <span className={styles.usageCount}>
                                                            {m.activity_count} {m.activity_count === 1 ? 'activity' : 'activities'}
                                                        </span>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {/* ── Right: fixed form with sticky submit ── */}
                        <div className={styles.formSection}>
                            <div className={styles.formScrollable}>
                                <div className={styles.sectionHeading}>
                                    {editingId ? 'Edit Metric' : copyingFrom ? <>Create Metric <span className={styles.copySource}>(Copy of {copyingFrom})</span></> : 'Create Metric'}
                                </div>

                                <div className={styles.formRow}>
                                    <Input
                                        label="Name *"
                                        value={form.name}
                                        onChange={(e) => setField('name', e.target.value)}
                                        placeholder="Reps, Weight, Distance..."
                                        fullWidth
                                    />
                                    <Input
                                        label="Unit *"
                                        value={form.unit}
                                        onChange={(e) => setField('unit', e.target.value)}
                                        placeholder="reps, lbs, km..."
                                        fullWidth
                                    />
                                </div>

                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>Input type</label>
                                    <select
                                        className={styles.select}
                                        value={form.input_type}
                                        onChange={(e) => setField('input_type', e.target.value)}
                                    >
                                        {INPUT_TYPES.map((t) => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className={styles.toggleRow}>
                                    <label className={styles.toggleLabel}>
                                        <input
                                            type="checkbox"
                                            checked={form.is_multiplicative}
                                            onChange={(e) => setField('is_multiplicative', e.target.checked)}
                                        />
                                        <span>Multiplicative</span>
                                        <span className={styles.hint}>Can be multiplied with other multiplicative metrics (e.g. Reps × Weight = Volume)</span>
                                    </label>
                                    <label className={styles.toggleLabel}>
                                        <input
                                            type="checkbox"
                                            checked={form.is_additive}
                                            onChange={(e) => setField('is_additive', e.target.checked)}
                                        />
                                        <span>Additive</span>
                                        <span className={styles.hint}>Values sum across sets/sessions (e.g. total reps). Uncheck for metrics like 1RM.</span>
                                    </label>
                                </div>

                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>Trend direction</label>
                                    <div className={styles.radioRow}>
                                        {[
                                            { value: null, label: 'Neutral' },
                                            { value: true, label: 'Higher is better' },
                                            { value: false, label: 'Lower is better' },
                                        ].map((opt) => (
                                            <label key={String(opt.value)} className={styles.radioLabel}>
                                                <input
                                                    type="radio"
                                                    name="higher_is_better"
                                                    checked={form.higher_is_better === opt.value}
                                                    onChange={() => setField('higher_is_better', opt.value)}
                                                />
                                                {opt.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <Input
                                    label="Default value"
                                    type="number"
                                    value={form.default_value}
                                    onChange={(e) => setField('default_value', e.target.value)}
                                    placeholder="Pre-fill session input"
                                    fullWidth
                                />

                                <Input
                                    label="Predefined values"
                                    value={form.predefined_values}
                                    onChange={(e) => setField('predefined_values', e.target.value)}
                                    placeholder="5, 8, 10, 12, 15"
                                    fullWidth
                                />
                                <div className={styles.inputHint}>Comma-separated numbers shown as quick-pick buttons in sessions</div>

                                <div className={styles.formRow}>
                                    <Input
                                        label="Min value"
                                        type="number"
                                        value={form.min_value}
                                        onChange={(e) => setField('min_value', e.target.value)}
                                        placeholder="Optional"
                                        fullWidth
                                    />
                                    <Input
                                        label="Max value"
                                        type="number"
                                        value={form.max_value}
                                        onChange={(e) => setField('max_value', e.target.value)}
                                        placeholder="Optional"
                                        fullWidth
                                    />
                                </div>

                                <TextArea
                                    label="Description"
                                    value={form.description}
                                    onChange={(e) => setField('description', e.target.value)}
                                    placeholder="Optional notes shown as a tooltip in the activity builder"
                                    fullWidth
                                />
                            </div>

                            {/* Sticky submit area — always visible */}
                            <div className={styles.formFooter}>
                                {editingId ? (
                                    <Button variant="secondary" onClick={handleCancelEdit}>
                                        Cancel Edit
                                    </Button>
                                ) : copyingFrom ? (
                                    <Button variant="secondary" onClick={handleCancelEdit}>
                                        Cancel Copy
                                    </Button>
                                ) : null}
                                <Button variant="secondary" onClick={handleClose}>
                                    Close
                                </Button>
                                <Button variant="success" onClick={handleSubmit} disabled={!canSubmit}>
                                    {editingId ? 'Save Changes' : 'Create Metric'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </ModalBody>
            </Modal>

            <DeleteConfirmModal
                isOpen={Boolean(metricToDelete)}
                onClose={() => setMetricToDelete(null)}
                onConfirm={handleDelete}
                title="Delete Metric"
                message={
                    metricToDelete?.activity_count > 0
                        ? `"${metricToDelete?.name}" is used by ${metricToDelete?.activity_count} ${metricToDelete?.activity_count === 1 ? 'activity' : 'activities'}. Deleting it will remove it from those activities. This cannot be undone.`
                        : `Are you sure you want to delete "${metricToDelete?.name}"?`
                }
                confirmText="Delete Metric"
            />
        </>
    );
}

ManageMetricsModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    rootId: PropTypes.string.isRequired,
};

export default ManageMetricsModal;
