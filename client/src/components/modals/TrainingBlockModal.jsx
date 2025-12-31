import React, { useState, useEffect } from 'react';
import moment from 'moment';

const TrainingBlockModal = ({ isOpen, onClose, onSave, initialData = null, programDates = {} }) => {
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
                    name: initialData.name || '',
                    startDate: initialData.startDate || '',
                    endDate: initialData.endDate || '',
                    color: initialData.color || '#3A86FF'
                });
            } else {
                // Reset for new entry
                setFormData({
                    name: '',
                    startDate: '',
                    endDate: '',
                    color: '#3A86FF'
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

        // Optional: Validate valid range within program dates?
        // For now, let's keep it flexible.

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = () => {
        if (validate()) {
            onSave(formData);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1100, // Higher than other modals if nested, though unlikely
                padding: '20px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#1e1e1e',
                    border: '1px solid #444',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '500px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '20px', color: 'white', fontWeight: 500 }}>
                        {initialData?.id ? 'Edit Training Block' : 'Add Training Block'}
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            fontSize: '24px',
                            cursor: 'pointer',
                            padding: '0 8px'
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Name */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize: '14px' }}>
                            Block Name *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g., Base Build Phase 1"
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: '#2a2a2a',
                                border: errors.name ? '1px solid #f44336' : '1px solid #444',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '14px'
                            }}
                        />
                        {errors.name && <div style={{ color: '#f44336', fontSize: '12px', marginTop: '4px' }}>{errors.name}</div>}
                    </div>

                    {/* Dates */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize: '14px' }}>
                                Start Date *
                            </label>
                            <input
                                type="date"
                                value={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                min={programDates.start}
                                max={programDates.end}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    background: '#2a2a2a',
                                    border: errors.startDate ? '1px solid #f44336' : '1px solid #444',
                                    borderRadius: '6px',
                                    color: 'white',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize: '14px' }}>
                                End Date *
                            </label>
                            <input
                                type="date"
                                value={formData.endDate}
                                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                min={formData.startDate || programDates.start}
                                max={programDates.end}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    background: '#2a2a2a',
                                    border: errors.endDate ? '1px solid #f44336' : '1px solid #444',
                                    borderRadius: '6px',
                                    color: 'white',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                    </div>
                    {(errors.startDate || errors.endDate || errors.dateRange) && (
                        <div style={{ color: '#f44336', fontSize: '12px', marginTop: '-12px' }}>
                            {errors.startDate || errors.endDate || errors.dateRange}
                        </div>
                    )}

                    {/* Color */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize: '14px' }}>
                            Color Code
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input
                                type="color"
                                value={formData.color}
                                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                style={{
                                    width: '50px',
                                    height: '40px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    background: 'transparent',
                                    cursor: 'pointer'
                                }}
                            />
                            <div style={{ color: '#888', fontSize: '13px' }}>{formData.color}</div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div style={{
                    padding: '20px',
                    borderTop: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            background: 'transparent',
                            border: '1px solid #444',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        style={{
                            padding: '10px 20px',
                            background: '#3A86FF',
                            border: 'none',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '14px'
                        }}
                    >
                        Save Block
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TrainingBlockModal;
