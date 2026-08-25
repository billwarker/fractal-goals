export function prepareCircuitDefinitionCopy(circuit) {
    if (!circuit) return null;

    return {
        ...circuit,
        id: undefined,
        name: `${circuit.name || 'Untitled Circuit'} (Copy)`,
        version: undefined,
        slots: (circuit.slots || []).map((slot) => ({
            ...slot,
            id: undefined,
        })),
    };
}
