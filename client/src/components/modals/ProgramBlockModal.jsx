import React, { useState, useEffect } from 'react';
import Modal from '../atoms/Modal';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import { Heading } from '../atoms/Typography';
import styles from './ProgramBlockModal.module.css';

const ProgramBlockModal = ({ isOpen, onClose, onSave, initialData = null, programDates = {} }) => {
    const [formData, setFormData] = useState({
        name: '',
        startDate: '',
        endDate: '',
        color: '#3A86FF'
    });
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({
                    id: initialData.id, // Preserve id for editing
                    name: initialData.name || '',
                    startDate: initialData.startDate || initialData.start_date || '',
                    endDate: initialData.endDate || initialData.end_date || '',
                    color: initialData.color || '#3A86FF'
                });
            } else {
                // Reset for new entry
                setFormData({
                    name: '',
                    startDate: '',
                    endDate: '',
                    color: 'var(--color-brand-primary)'
                });
            }
            setErrors({});
        }
    }, [isOpen, initialData]);

    const validate = () => {
        const newErrors = {};
        if (!formData.name.trim()) newErrors.name = 'Name is required';
        if (!formData.startDate) newErrors.startDate = 'Start date is required';
        if (!formData.endDate) newErrors.endDate = 'End date is required';

        if (formData.startDate && formData.endDate) {
            if (new Date(formData.endDate) < new Date(formData.startDate)) {
                newErrors.dateRange = 'End date cannot be before start date';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = () => {
        if (validate()) {
            onSave(formData);
            onClose();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData?.id ? 'Edit Program Block' : 'Add Program Block'}
        >
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
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        min={programDates.start}
                        max={programDates.end}
                        fullWidth
                        error={errors.startDate}
                        required
                    />
                    <Input
                        type="date"
                        label="End Date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        min={formData.startDate || programDates.start}
                        max={programDates.end}
                        fullWidth
                        error={errors.endDate}
                        required
                    />
                </div>

                {errors.dateRange && (
                    <div className={styles.error}>{errors.dateRange}</div>
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

            <div className={styles.footerActions}>
                <Button variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    Save Block
                </Button>
            </div>
        </Modal>
    );
};

export default ProgramBlockModal;
