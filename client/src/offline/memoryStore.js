export function createMemoryStore(initial = []) {
    const rows = new Map(initial.map((op) => [op.opId, op]));
    return {
        async getAll() {
            return [...rows.values()].map((op) => ({ ...op }));
        },
        async put(op) {
            rows.set(op.opId, { ...op });
        },
        async delete(opId) {
            rows.delete(opId);
        },
        async clear() {
            rows.clear();
        },
    };
}
