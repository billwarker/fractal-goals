import React, { useState } from 'react';
import PropTypes from 'prop-types';

import { useCreateActivityMode, useDeleteActivityMode, useActivityModes, useUpdateActivityMode } from '../../hooks/useActivityQueries';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import ActivityModeList from '../common/ActivityModeList';
import Input from '../atoms/Input';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import TextArea from '../atoms/TextArea';
import DeleteConfirmModal from './DeleteConfirmModal';
import styles from './ActivityModesModal.module.css';

const EMPTY_FORM = {
    name: '',
    description: '',
    color: '#5F9DF7',
};

function ActivityModesModal({ isOpen, onClose, rootId }) {
    const { activityModes = [], isLoading } = useActivityModes(rootId);
    const createModeMutation = useCreateActivityMode(rootId);
    const updateModeMutation = useUpdateActivityMode(rootId);
    const deleteModeMutation = useDeleteActivityMode(rootId);

    const [editingModeId, setEditingModeId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [modeToDelete, setModeToDelete] = useState(null);

    const handleClose = () => {
        setEditingModeId(null);
        setModeToDelete(null);
        setForm(EMPTY_FORM);
        onClose();
    };

    const handleEdit = (mode) => {
        setEditingModeId(mode.id);
        setForm({
            name: mode.name || '',
            description: mode.description || '',
            color: mode.color || '#5F9DF7',
        });
    };

    const handleCancelEdit = () => {
        setEditingModeId(null);
        setForm(EMPTY_FORM);
    };

    const handleSubmit = async () => {
        const payload = {
            name: form.name,
            description: form.description || null,
            color: form.color || null,
        };

        try {
            if (editingModeId) {
                await updateModeMutation.mutateAsync({ modeId: editingModeId, ...payload });
                notify.success('Activity mode updated');
            } else {
                await createModeMutation.mutateAsync(payload);
                notify.success('Activity mode created');
            }
            handleCancelEdit();
        } catch (error) {
            notify.error(`Failed to save activity mode: ${formatError(error)}`);
        }
    };

    const handleDelete = async () => {
        if (!modeToDelete) return;
        try {
            await deleteModeMutation.mutateAsync(modeToDelete.id);
            notify.success('Activity mode deleted');
            setModeToDelete(null);
            if (editingModeId === modeToDelete.id) {
                handleCancelEdit();
            }
        } catch (error) {
            notify.error(`Failed to delete activity mode: ${formatError(error)}`);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <Modal isOpen={isOpen} onClose={handleClose} title="Manage Activity Modes" size="lg">
                <ModalBody>
                    <div className={styles.content}>
                        <div className={styles.listSection}>
                            <div className={styles.sectionHeading}>Modes</div>
                            <ActivityModeList
                                activityModes={activityModes}
                                isLoading={isLoading}
                                renderActions={(mode) => (
                                    <>
                                        <button type="button" className={styles.linkButton} onClick={() => handleEdit(mode)}>
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.linkButton} ${styles.deleteButton}`}
                                            onClick={() => setModeToDelete(mode)}
                                        >
                                            Delete
                                        </button>
                                    </>
                                )}
                            />
                        </div>

                        <div className={styles.formSection}>
                            <div className={styles.sectionHeading}>
                                {editingModeId ? 'Edit Mode' : 'Create Mode'}
                            </div>

                            <Input
                                label="Name"
                                value={form.name}
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                placeholder="Strength, Standing, Technique..."
                                fullWidth
                            />

                            <TextArea
                                label="Description"
                                value={form.description}
                                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                                placeholder="Optional notes about when to use this mode"
                                fullWidth
                            />

                            <div className={styles.colorField}>
                                <label className={styles.colorLabel}>Color</label>
                                <div className={styles.colorRow}>
                                    <input
                                        type="color"
                                        value={form.color}
                                        onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                                        className={styles.colorInput}
                                    />
                                    <span className={styles.colorValue}>{form.color}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </ModalBody>

                <ModalFooter>
                    {editingModeId ? (
                        <Button variant="secondary" onClick={handleCancelEdit}>
                            Cancel Edit
                        </Button>
                    ) : null}
                    <Button variant="secondary" onClick={handleClose}>
                        Close
                    </Button>
                    <Button
                        variant="success"
                        onClick={handleSubmit}
                        disabled={!form.name.trim() || createModeMutation.isPending || updateModeMutation.isPending}
                    >
                        {editingModeId ? 'Save Changes' : 'Create Mode'}
                    </Button>
                </ModalFooter>
            </Modal>

            <DeleteConfirmModal
                isOpen={Boolean(modeToDelete)}
                onClose={() => setModeToDelete(null)}
                onConfirm={handleDelete}
                title="Delete Activity Mode"
                message={`Are you sure you want to delete "${modeToDelete?.name}"? Existing historical activity instances will keep their hidden association.`}
                confirmText="Delete Mode"
            />
        </>
    );
}

ActivityModesModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    rootId: PropTypes.string.isRequired,
};

export default ActivityModesModal;
