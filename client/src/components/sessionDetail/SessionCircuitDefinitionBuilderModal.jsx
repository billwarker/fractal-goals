import React from 'react';

import CircuitBuilderModal from '../circuits/CircuitBuilderModal';


export default function SessionCircuitDefinitionBuilderModal({
    builder,
    activities,
    activityGroups,
    onClose,
    onSave,
    errorMessage,
    isSaving,
}) {
    if (!builder) return null;

    return (
        <CircuitBuilderModal
            isOpen
            circuit={builder.circuit}
            isCopy={builder.mode === 'copy'}
            activities={activities}
            activityGroups={activityGroups}
            onClose={onClose}
            onSave={onSave}
            definitionCreated={Boolean(builder.createdDefinitionId)}
            errorMessage={errorMessage}
            isSaving={isSaving}
        />
    );
}
