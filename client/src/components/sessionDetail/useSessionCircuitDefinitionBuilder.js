import { useState } from 'react';


export default function useSessionCircuitDefinitionBuilder({
    sectionIndex,
    closeSelector,
    createCircuitDefinition,
    updateCircuitDefinition,
    createCircuitRun,
    setCircuitError,
}) {
    const [circuitBuilder, setCircuitBuilder] = useState(null);

    const openCircuitBuilder = (mode, circuit = null) => {
        closeSelector();
        setCircuitError('');
        setCircuitBuilder({ mode, circuit, createdDefinitionId: null });
    };

    const closeCircuitBuilder = () => {
        setCircuitBuilder(null);
        setCircuitError('');
    };

    const saveCircuitDefinition = async (payload) => {
        if (!circuitBuilder) return;
        setCircuitError('');

        try {
            if (circuitBuilder.mode === 'edit') {
                await updateCircuitDefinition.mutateAsync({
                    circuitId: circuitBuilder.circuit.id,
                    data: payload,
                });
                setCircuitBuilder(null);
                return;
            }

            let definitionId = circuitBuilder.createdDefinitionId;
            if (!definitionId) {
                const response = await createCircuitDefinition.mutateAsync(payload);
                definitionId = response?.data?.id || response?.id;
                if (!definitionId) {
                    throw new Error('The circuit was created without a usable definition ID.');
                }
                setCircuitBuilder((current) => current
                    ? { ...current, createdDefinitionId: definitionId }
                    : current);
            }

            await createCircuitRun.mutateAsync({
                circuitDefinitionId: definitionId,
                sectionIndex,
            });
            setCircuitBuilder(null);
        } catch (error) {
            const action = circuitBuilder.mode === 'edit' ? 'update' : 'create and add';
            setCircuitError(
                error?.response?.data?.error
                || error.message
                || `Unable to ${action} circuit`,
            );
        }
    };

    return {
        circuitBuilder,
        openCircuitBuilder,
        closeCircuitBuilder,
        saveCircuitDefinition,
    };
}
