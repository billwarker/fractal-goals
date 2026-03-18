import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import moment from 'moment';
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
    const queryClient = useQueryClient();
    const initialState = buildInitialProgramDayState(initialData);
    const [name, setName] = useState(initialState.name);
    const [selectedTemplates, setSelectedTemplates] = useState(initialState.selectedTemplates);
    const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState(initialState.selectedDaysOfWeek);

    const [copyStatus, setCopyStatus] = useState(initialState.copyStatus);
    const [copyMode] = useState(initialState.copyMode);

    // Template builder modal state
    const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const isEdit = Boolean(initialData?.id);
    const fixedDate = initialData?.date ? moment(initialData.date).format('YYYY-MM-DD') : '';

    const { data: sessionTemplates = [] } = useQuery({
        queryKey: queryKeys.sessionTemplates(rootId),
        queryFn: async () => {
            const response = await fractalApi.getSessionTemplates(rootId);
            return response.data || [];
        },
        enabled: Boolean(rootId),
    });
    const availableProgramTemplates = sessionTemplates.filter((template) => !isQuickSession(template));

    const { data: activities = [] } = useQuery({
        queryKey: queryKeys.activities(rootId),
        queryFn: async () => {
            const response = await fractalApi.getActivities(rootId);
            return response.data || [];
        },
        enabled: Boolean(rootId),
    });

    const { data: activityGroups = [] } = useQuery({
        queryKey: queryKeys.activityGroups(rootId),
        queryFn: async () => {
            const response = await fractalApi.getActivityGroups(rootId);
            return response.data || [];
        },
        enabled: Boolean(rootId),
    });

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
                setSelectedTemplates((current) => [...current, savedTemplate.id]);
            }
            setShowTemplateBuilder(false);
        },
    });

    const handleSave = () => {
        onSave({
            name,
            template_ids: selectedTemplates,
            day_of_week: fixedDate ? [] : selectedDaysOfWeek,
            ...(fixedDate ? { date: fixedDate } : {}),
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
            await saveTemplateMutation.mutateAsync({ payload, templateId });
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

                        {fixedDate && (
                            <Input
                                label="Scheduled Date"
                                value={moment(fixedDate).format('MMM D, YYYY')}
                                readOnly
                                fullWidth
                            />
                        )}

                        <div className={styles.field}>
                            <label className={styles.label}>Sessions</label>
                            <div className={styles.sessionList}>
                                {selectedTemplates.map((tid, idx) => {
                                    const t = sessionTemplates.find(st => st.id === tid);
                                    return (
                                        <div key={idx} className={styles.sessionItem}>
                                            <span className={styles.sessionName}>{t ? t.name : 'Unknown Template'}</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    const newTids = [...selectedTemplates];
                                                    newTids.splice(idx, 1);
                                                    setSelectedTemplates(newTids);
                                                }}
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
                        </div>

                        {!fixedDate && (
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
                        )}

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
