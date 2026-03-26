import React from 'react';
import PropTypes from 'prop-types';

import { useActivityModes } from '../../hooks/useActivityQueries';
import Button from '../atoms/Button';
import ActivityModeList from '../common/ActivityModeList';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';

function ActivityInstanceModesModal({
    isOpen,
    onClose,
    rootId,
    selectedModeIds = [],
    onChange,
    onSave,
}) {
    const { activityModes = [], isLoading } = useActivityModes(rootId);
    const selectedIds = Array.isArray(selectedModeIds) ? selectedModeIds : [];

    const handleToggle = (modeId) => {
        if (selectedIds.includes(modeId)) {
            onChange(selectedIds.filter((id) => id !== modeId));
            return;
        }
        onChange([...selectedIds, modeId]);
    };

    if (!isOpen) {
        return null;
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Activity Modes" size="md">
            <ModalBody>
                <ActivityModeList
                    activityModes={activityModes}
                    isLoading={isLoading}
                    emptyMessage="No modes created yet. Create them from Manage Activities."
                    selectedModeIds={selectedIds}
                    onToggle={handleToggle}
                />
            </ModalBody>
            <ModalFooter>
                <Button variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button variant="success" onClick={onSave}>
                    Save Modes
                </Button>
            </ModalFooter>
        </Modal>
    );
}

ActivityInstanceModesModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    rootId: PropTypes.string.isRequired,
    selectedModeIds: PropTypes.arrayOf(PropTypes.string),
    onChange: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
};

export default ActivityInstanceModesModal;
