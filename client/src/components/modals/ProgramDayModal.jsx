import React, { useState, useEffect } from 'react';
import { legacyApi, fractalApi } from '../../utils/api';
import moment from 'moment';
import TemplateBuilderModal from './TemplateBuilderModal';
import Modal from '../atoms/Modal';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import styles from './ProgramDayModal.module.css';

const ProgramDayModal = ({ isOpen, onClose, onSave, onCopy, onDelete, rootId, blockId, initialData }) => {
    const [name, setName] = useState('');
    const [selectedTemplates, setSelectedTemplates] = useState([]);
    const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState([]);

    const [sessionTemplates, setSessionTemplates] = useState([]);
    const [activities, setActivities] = useState([]);
    const [activityGroups, setActivityGroups] = useState([]);
    const [copyStatus, setCopyStatus] = useState('');
    const [copyMode, setCopyMode] = useState('all');

    // Template builder modal state
    const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);

    const isEdit = !!initialData;

    const fetchTemplates = async () => {
        if (!rootId) return;
        try {
            const res = await fractalApi.getSessionTemplates(rootId);
            setSessionTemplates(res.data);
        } catch (err) {
            console.error("Failed to fetch templates");
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!rootId) return;
            try {
                const [templatesRes, activitiesRes, groupsRes] = await Promise.all([
                    fractalApi.getSessionTemplates(rootId),
                    fractalApi.getActivities(rootId),
                    fractalApi.getActivityGroups(rootId)
                ]);
                setSessionTemplates(templatesRes.data);
                setActivities(activitiesRes.data);
                setActivityGroups(groupsRes.data);
            } catch (err) {
                console.error("Failed to fetch data");
            }
        };
        if (isOpen) fetchData();
    }, [isOpen, rootId]);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name || '');
                // Try to load day_of_week first, then fallback to inferring from date
                if (initialData.day_of_week) {
                    const dows = Array.isArray(initialData.day_of_week)
                        ? initialData.day_of_week
                        : [initialData.day_of_week];
                    setSelectedDaysOfWeek(dows);
                } else if (initialData.date) {
                    setSelectedDaysOfWeek([moment(initialData.date).format('dddd')]);
                } else {
                    setSelectedDaysOfWeek([]);
                }

                // Handle new templates structure or fallback to legacy sessions
                let tids = [];
                if (initialData.templates) {
                    tids = initialData.templates.map(t => t.id);
                } else if (initialData.sessions) {
                    tids = initialData.sessions.map(s => s.session_template_id).filter(Boolean);
                }
                setSelectedTemplates(tids);

            } else {
                setName('');
                setSelectedDaysOfWeek([]);
                setSelectedTemplates([]);

            }
            setCopyStatus('');
        }
    }, [isOpen, initialData]);

    const handleSave = () => {
        onSave({
            name,
            template_ids: selectedTemplates,
            day_of_week: selectedDaysOfWeek // Sending an array now
        });
    };

    const handleToggleDay = (day) => {
        setSelectedDaysOfWeek(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    const handleCopy = async () => {
        if (!onCopy) return;
        setCopyStatus('Copying...');
        try {
            await onCopy(initialData.id, { target_mode: copyMode });
            setCopyStatus('Copied!');
        } catch (err) {
            setCopyStatus('Error');
        }
    };

    const handleDelete = () => {
        if (window.confirm('Are you sure you want to delete this day?')) {
            onDelete(initialData.id);
        }
    };

    const handleAddTemplate = (e) => {
        const val = e.target.value;
        if (val) {
            setSelectedTemplates([...selectedTemplates, val]);
        }
    };

    const handleTemplateBuilderSave = async (payload, templateId) => {
        try {
            if (templateId) {
                await fractalApi.updateSessionTemplate(rootId, templateId, payload);
            } else {
                const response = await fractalApi.createSessionTemplate(rootId, payload);
                // Auto-add the newly created template to selected templates
                if (response.data && response.data.id) {
                    setSelectedTemplates([...selectedTemplates, response.data.id]);
                }
            }

            // Refresh templates list
            await fetchTemplates();
            setShowTemplateBuilder(false);
        } catch (err) {
            console.error("Failed to save template", err);
            // Show error - could add alert modal here
        }
    };

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={isEdit ? 'Edit Program Day' : 'Add Program Day'}
                size="md"
            >
                <div className={styles.content}>
                    <Input
                        label="Day Name *"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g., Leg Day or Day 1"
                        fullWidth
                    />

                    <div className={styles.field}>
                        <label className={styles.label}>Sessions</label>
                        <div className={styles.sessionList}>
                            {selectedTemplates.map((tid, idx) => {
                                const t = sessionTemplates.find(st => st.id === tid);
                                return (
                                    <div key={idx} className={styles.sessionItem}>
                                        <span className={styles.sessionName}>{t ? t.name : 'Unknown Template'}</span>
                                        <button
                                            onClick={() => {
                                                const newTids = [...selectedTemplates];
                                                newTids.splice(idx, 1);
                                                setSelectedTemplates(newTids);
                                            }}
                                            className={styles.removeSessionBtn}
                                            title="Remove Template"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className={styles.sessionActions}>
                            <select
                                value=""
                                onChange={handleAddTemplate}
                                className={styles.templateSelect}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: 'var(--color-bg-input)',
                                    border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                    borderRadius: 'var(--border-radius-sm)',
                                    fontSize: '14px'
                                }}
                            >
                                <option value="">+ Add Session Template</option>
                                {sessionTemplates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                            <Button
                                onClick={() => setShowTemplateBuilder(true)}
                                size="sm"
                                variant="secondary"
                            >
                                + New
                            </Button>
                        </div>
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>Optional Day of Week</label>
                        <div className={styles.dayGrid}>
                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => {
                                const isSelected = selectedDaysOfWeek.includes(d);
                                return (
                                    <div
                                        key={d}
                                        onClick={() => handleToggleDay(d)}
                                        className={`${styles.dayBtn} ${isSelected ? styles.dayBtnSelected : ''}`}
                                    >
                                        {d.substring(0, 3)}
                                    </div>
                                );
                            })}
                        </div>
                        {selectedDaysOfWeek.length > 0 && (
                            <div className={styles.hint}>
                                Scheduled for all {selectedDaysOfWeek.join(', ')}s in the block.
                            </div>
                        )}
                    </div>

                    {isEdit && (
                        <div className={styles.copyArea}>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCopy}
                                fullWidth
                            >
                                {copyStatus || 'Copy to Other Blocks'}
                            </Button>
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    {isEdit ? (
                        <Button variant="danger" onClick={handleDelete}>
                            Delete Day
                        </Button>
                    ) : <div />}

                    <div className={styles.rightActions}>
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleSave}>
                            {isEdit ? 'Save Changes' : 'Add Day'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <TemplateBuilderModal
                isOpen={showTemplateBuilder}
                onClose={() => setShowTemplateBuilder(false)}
                onSave={handleTemplateBuilderSave}
                editingTemplate={null}
                activities={activities}
                activityGroups={activityGroups}
                rootId={rootId}
            />
        </>
    );
};

export default ProgramDayModal;
