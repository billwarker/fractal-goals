// Seed for a brand-new circuit created from a picker search term; null for non-seed values.
export function prepareCircuitDefinitionDraft(seed) {
    const name = typeof seed?.name === 'string' ? seed.name.trim() : '';
    if (!name) return null;

    return { name, description: '', group_id: '', slots: [] };
}

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
