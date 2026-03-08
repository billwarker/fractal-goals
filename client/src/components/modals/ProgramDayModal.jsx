import React, { useState, useEffect } from 'react';
import { fractalApi } from '../../utils/api';
import moment from 'moment';
import TemplateBuilderModal from './TemplateBuilderModal';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import styles from './ProgramDayModal.module.css';

import DeleteConfirmModal from './DeleteConfirmModal';

function getInitialSelectedDaysOfWeek(initialData) {
    if (!initialData) {
        return [];
    }

    if (initialData.day_of_week) {
        if (Array.isArray(initialData.day_of_week)) {
            return initialData.day_of_week;
        }

        if (typeof initialData.day_of_week === 'string') {
            if (initialData.day_of_week.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(initialData.day_of_week);
                    return Array.isArray(parsed) ? parsed : [initialData.day_of_week];
                } catch {
                    return [initialData.day_of_week];
                }
            }

            return [initialData.day_of_week];
        }
    }

    if (initialData.date) {
        return [moment(initialData.date).format('dddd')];
    }

    return [];
}

function buildInitialProgramDayState(initialData) {
    const selectedTemplates = initialData?.templates
        ? initialData.templates.map((template) => template.id)
        : (initialData?.sessions || []).map((session) => session.session_template_id).filter(Boolean);

    return {
        name: initialData?.name || '',
        selectedTemplates,
        selectedDaysOfWeek: getInitialSelectedDaysOfWeek(initialData),
        copyStatus: '',
        copyMode: 'all',
    };
}

const ProgramDayModalInner = ({ onClose, onSave, onCopy, onDelete, rootId, initialData }) => {
    const initialState = buildInitialProgramDayState(initialData);
    const [name, setName] = useState(initialState.name);
    const [selectedTemplates, setSelectedTemplates] = useState(initialState.selectedTemplates);
    const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState(initialState.selectedDaysOfWeek);

    const [sessionTemplates, setSessionTemplates] = useState([]);
    const [activities, setActivities] = useState([]);
    const [activityGroups, setActivityGroups] = useState([]);
    const [copyStatus, setCopyStatus] = useState(initialState.copyStatus);
    const [copyMode] = useState(initialState.copyMode);

    // Template builder modal state
    const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const isEdit = !!initialData;

    const fetchTemplates = async () => {
        if (!rootId) return;
        try {
            const res = await fractalApi.getSessionTemplates(rootId);
            setSessionTemplates(res.data);
        } catch {
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
            } catch {
                console.error("Failed to fetch data");
            }
        };
        fetchData();
    }, [rootId]);

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
        } catch {
            setCopyStatus('Error');
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
                isOpen={true}
                onClose={onClose}
                title={isEdit ? 'Edit Program Day' : 'Add Program Day'}
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
                                    Scheduled for every {
                                        (() => {
                                            const sorter = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
                                            const sorted = [...selectedDaysOfWeek].sort((a, b) => sorter[a] - sorter[b]);
                                            if (sorted.length === 0) return '';
                                            if (sorted.length === 1) return sorted[0];
                                            return sorted.slice(0, -1).join(', ') + ' and ' + sorted[sorted.length - 1];
                                        })()
                                    } in the block.
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
                </ModalBody>

                <ModalFooter>
                    {isEdit ? (
                        <Button variant="danger" onClick={handleDelete}>
                            Delete Day
                        </Button>
                    ) : <div />}

                    <div className={styles.rightActions} style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleSave}>
                            {isEdit ? 'Save Changes' : 'Add Day'}
                        </Button>
                    </div>
                </ModalFooter>
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

const ProgramDayModal = ({ isOpen, onClose, onSave, onCopy, onDelete, rootId, blockId, initialData }) => {
    if (!isOpen) {
        return null;
    }

    const modalKey = initialData?.id || `new-day:${blockId || 'no-block'}`;
    return (
        <ProgramDayModalInner
            key={modalKey}
            onClose={onClose}
            onSave={onSave}
            onCopy={onCopy}
            onDelete={onDelete}
            rootId={rootId}
            initialData={initialData}
        />
    );
};

export default ProgramDayModal;
