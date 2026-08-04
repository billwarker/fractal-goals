import React, { useState } from 'react';

import DeleteButton from '../atoms/DeleteButton';
import Button from '../atoms/Button';
import CatalogueUsageMetadata from '../activities/CatalogueUsageMetadata';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import { useCircuitDefinitionMutations } from '../../hooks/useCircuitQueries';
import { logError } from '../../utils/logger';
import CircuitBuilderModal from './CircuitBuilderModal';
import CircuitActivityCard from './CircuitActivityCard';
import activityStyles from '../ActivityCard.module.css';
import styles from './CircuitDefinitionCard.module.css';


export default function CircuitDefinitionCard({ circuit, rootId, activities, activityGroups, onError }) {
    const [isEditing, setIsEditing] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
    const { createMutation, updateMutation, archiveMutation } = useCircuitDefinitionMutations(rootId);

    const reportError = (message, error) => {
        logError(message, error);
        onError?.(error?.response?.data?.error || message);
    };

    const handleSave = async (payload) => {
        try {
            if (isDuplicating) {
                await createMutation.mutateAsync(payload);
            } else {
                await updateMutation.mutateAsync({ circuitId: circuit.id, data: payload });
            }
            setIsEditing(false);
            setIsDuplicating(false);
        } catch (error) {
            reportError(isDuplicating ? 'Failed to duplicate activity circuit' : 'Failed to update activity circuit', error);
        }
    };

    const handleDuplicate = () => {
        setIsDuplicating(true);
        setIsEditing(true);
    };

    const handleCloseEditor = () => {
        setIsEditing(false);
        setIsDuplicating(false);
    };

    const editableCircuit = isDuplicating ? {
        ...circuit,
        id: undefined,
        name: `${circuit.name} (Copy)`,
        version: undefined,
        slots: (circuit.slots || []).map((slot) => ({ ...slot, id: undefined })),
    } : circuit;

    const handleArchive = async () => {
        try {
            await archiveMutation.mutateAsync(circuit.id);
            setIsConfirmingArchive(false);
        } catch (error) {
            reportError('Failed to archive activity circuit', error);
        }
    };

    return (
        <>
            <article
                className={`${activityStyles.card} ${styles.clickableCard}`}
                onClick={() => setIsEditing(true)}
            >
                <div>
                    <h3 className={activityStyles.cardName}>{circuit.name}</h3>
                    {circuit.description && <p className={activityStyles.description}>{circuit.description}</p>}
                    <CatalogueUsageMetadata summary={circuit.instantiation_summary} />
                    <div className={styles.definitionMetadata}>
                        <span>{circuit.planned_rounds} round{circuit.planned_rounds === 1 ? '' : 's'}</span>
                        <span className={styles.metadataSeparator}>•</span>
                        <span>{circuit.slots?.length || 0} activit{circuit.slots?.length === 1 ? 'y' : 'ies'}</span>
                    </div>
                </div>
                <div className={styles.typeRow}>
                    <span className={`${activityStyles.indicator} ${styles.circuitIndicator}`}>Circuit</span>
                </div>
                <ol className={styles.slotList} aria-label="Circuit activities">
                    {(circuit.slots || []).map((slot) => (
                        <li key={slot.id}>
                            <CircuitActivityCard compact name={slot.activity?.name || 'Activity'} />
                        </li>
                    ))}
                </ol>
                <div className={activityStyles.actionList} onClick={(event) => event.stopPropagation()}>
                    <Button
                        size="sm"
                        variant="secondary"
                        className={activityStyles.ghostAction}
                        disabled={createMutation.isPending}
                        onClick={handleDuplicate}
                        title="Copy this circuit"
                    >
                        Duplicate
                    </Button>
                    <DeleteButton onClick={() => setIsConfirmingArchive(true)} title="Delete circuit" />
                </div>
            </article>

            {isEditing && (
                <CircuitBuilderModal
                    isOpen
                    circuit={editableCircuit}
                    isCopy={isDuplicating}
                    activities={activities}
                    activityGroups={activityGroups}
                    onClose={handleCloseEditor}
                    onSave={handleSave}
                    isSaving={isDuplicating ? createMutation.isPending : updateMutation.isPending}
                />
            )}
            <DeleteConfirmModal
                isOpen={isConfirmingArchive}
                onClose={() => setIsConfirmingArchive(false)}
                onConfirm={handleArchive}
                title="Delete Activity Circuit"
                message={`Delete "${circuit.name}"? Historical runs and existing template references will remain available.`}
                confirmText="Delete Circuit"
            />
        </>
    );
}
