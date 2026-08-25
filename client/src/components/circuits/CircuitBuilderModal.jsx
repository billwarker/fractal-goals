import React, { useMemo, useState } from 'react';

import Button from '../atoms/Button';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import RemoveButton from '../atoms/RemoveButton';
import ActivitySelectorPanel from '../common/ActivitySelectorPanel';
import { getGroupBreadcrumb, sortGroupsTreeOrder } from '../../utils/manageActivities';
import CircuitActivityCard from './CircuitActivityCard';
import { MAX_CIRCUIT_SLOTS } from './circuitLimits';
import styles from './CircuitBuilderModal.module.css';


const emptyDraft = { name: '', description: '', group_id: '', slots: [] };
const draftFromCircuit = (circuit) => circuit ? {
    name: circuit.name || '',
    description: circuit.description || '',
    group_id: circuit.group_id || '',
    ...(circuit.version != null ? { version: circuit.version } : {}),
    slots: (circuit.slots || []).map((slot) => ({
        id: slot.id,
        activity_definition_id: slot.activity_definition_id,
    })),
} : emptyDraft;

export default function CircuitBuilderModal({
    isOpen,
    onClose,
    circuit,
    isCopy = false,
    activities,
    activityGroups,
    onSave,
    isSaving,
    definitionCreated = false,
    errorMessage = '',
}) {
    const [draft, setDraft] = useState(() => draftFromCircuit(circuit));
    const [showActivitySelector, setShowActivitySelector] = useState(false);
    const [error, setError] = useState('');
    const actionLabel = circuit && !isCopy ? 'Edit Circuit' : 'Create Circuit';
    const modalTitle = draft.name.trim() ? `${actionLabel}: ${draft.name.trim()}` : actionLabel;

    const activityById = useMemo(
        () => new Map((activities || []).map((activity) => [activity.id, activity])),
        [activities],
    );

    const addSlot = (activity) => {
        if (!activity?.id) return;
        if (draft.slots.length >= MAX_CIRCUIT_SLOTS) {
            setError(`A circuit can contain at most ${MAX_CIRCUIT_SLOTS} activities.`);
            setShowActivitySelector(false);
            return;
        }
        setDraft((previous) => ({
            ...previous,
            slots: [...previous.slots, { activity_definition_id: activity.id }],
        }));
        setShowActivitySelector(false);
    };

    const moveSlot = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= draft.slots.length) return;
        setDraft((previous) => {
            const slots = [...previous.slots];
            [slots[index], slots[target]] = [slots[target], slots[index]];
            return { ...previous, slots };
        });
    };

    const submit = async () => {
        if (!draft.name.trim()) {
            setError('Circuit name is required.');
            return;
        }
        if (draft.slots.length === 0) {
            setError('Add at least one activity.');
            return;
        }
        setError('');
        await onSave({
            ...draft,
            name: draft.name.trim(),
            description: draft.description.trim(),
            group_id: draft.group_id || null,
            slots: draft.slots.map((slot) => ({
                ...(slot.id ? { id: slot.id } : {}),
                activity_definition_id: slot.activity_definition_id,
            })),
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="lg">
            <ModalBody>
                <div className={styles.form}>
                    <label>
                        <span>Name</span>
                        <input
                            value={draft.name}
                            maxLength={255}
                            disabled={definitionCreated}
                            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                        />
                    </label>
                    <label>
                        <span>Description</span>
                        <textarea
                            value={draft.description}
                            rows={3}
                            disabled={definitionCreated}
                            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                        />
                    </label>
                    <label>
                        <span>Activity Group</span>
                        <select
                            value={draft.group_id}
                            disabled={definitionCreated}
                            onChange={(event) => setDraft({ ...draft, group_id: event.target.value })}
                        >
                            <option value="">(No Group)</option>
                            {sortGroupsTreeOrder(activityGroups || []).map((group) => (
                                <option key={group.id} value={group.id}>
                                    {getGroupBreadcrumb(group.id, activityGroups)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className={styles.slotHeader}>
                        <div>
                            <h4>Activity order</h4>
                            <p>Each round performs one result from every slot.</p>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={definitionCreated}
                            onClick={() => setShowActivitySelector(true)}
                        >
                            + Add Activity
                        </Button>
                    </div>

                    {showActivitySelector && (
                        <div className={styles.activitySelector}>
                            <ActivitySelectorPanel
                                activities={activities}
                                activityGroups={activityGroups}
                                title="Select an activity"
                                onClose={() => setShowActivitySelector(false)}
                                onSelectActivity={addSlot}
                                closeOnSelect
                            />
                        </div>
                    )}

                    <ol className={styles.slotList}>
                        {draft.slots.map((slot, index) => {
                            const activity = activityById.get(slot.activity_definition_id);
                            return (
                                <li key={slot.id || `${slot.activity_definition_id}-${index}`}>
                                    <CircuitActivityCard name={activity?.name} />
                                    <div className={styles.slotActions}>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => moveSlot(index, -1)}
                                            disabled={definitionCreated || index === 0}
                                            aria-label="Move activity up"
                                        >
                                            ↑
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => moveSlot(index, 1)}
                                            disabled={definitionCreated || index === draft.slots.length - 1}
                                            aria-label="Move activity down"
                                        >
                                            ↓
                                        </Button>
                                        <RemoveButton
                                            onClick={() => setDraft((previous) => ({ ...previous, slots: previous.slots.filter((_, itemIndex) => itemIndex !== index) }))}
                                            aria-label={`Remove ${activity?.name || `activity ${index + 1}`}`}
                                            disabled={definitionCreated}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                    {definitionCreated && (
                        <p role="status">
                            The circuit definition was created. Retry to add it to this session.
                        </p>
                    )}
                    {(error || errorMessage) && (
                        <p className={styles.error} role="alert">{error || errorMessage}</p>
                    )}
                </div>
            </ModalBody>
            <ModalFooter>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={submit} disabled={isSaving}>
                    {isSaving ? 'Saving…' : definitionCreated ? 'Retry Add to Session' : 'Save Circuit'}
                </Button>
            </ModalFooter>
        </Modal>
    );
}
