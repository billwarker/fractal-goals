import { buildGroupReorderPayload, buildLastInstantiatedMap, findLastInstantiatedForActivity } from '../manageActivities';

describe('findLastInstantiatedForActivity', () => {
    it('prefers current activity_instances schema', () => {
        const sessions = [
            {
                id: 's1',
                session_start: '2026-01-01T00:00:00Z',
                activity_instances: [{ activity_definition_id: 'a1' }]
            },
            {
                id: 's2',
                session_start: '2026-01-02T00:00:00Z',
                activity_instances: [{ activity_definition_id: 'a1' }]
            }
        ];

        expect(findLastInstantiatedForActivity(sessions, 'a1')).toBe('2026-01-02T00:00:00Z');
    });

    it('falls back to legacy section.exercises schema', () => {
        const sessions = [
            {
                id: 'legacy',
                attributes: {
                    created_at: '2026-01-03T00:00:00Z',
                    session_data: {
                        sections: [
                            {
                                exercises: [{ activity_id: 'a2' }]
                            }
                        ]
                    }
                }
            }
        ];

        expect(findLastInstantiatedForActivity(sessions, 'a2')).toBe('2026-01-03T00:00:00Z');
    });
});

describe('buildGroupReorderPayload', () => {
    const groups = [
        { id: 'g1', parent_id: null, sort_order: 0 },
        { id: 'g2', parent_id: null, sort_order: 1 },
        { id: 'g3', parent_id: 'g1', sort_order: 0 }
    ];

    it('returns null for non-root reorder attempts', () => {
        expect(buildGroupReorderPayload(groups, 'g3', 'up')).toBeNull();
    });

    it('swaps root groups while preserving hierarchy traversal', () => {
        const result = buildGroupReorderPayload(groups, 'g2', 'up');
        expect(result).toEqual(['g2', 'g1', 'g3']);
    });
});

describe('buildLastInstantiatedMap', () => {
    it('builds latest timestamps across current and legacy schemas in one pass', () => {
        const sessions = [
            {
                id: 's1',
                session_start: '2026-01-01T00:00:00Z',
                activity_instances: [
                    { activity_definition_id: 'a1' },
                    { activity_definition_id: 'a2' }
                ]
            },
            {
                id: 's2',
                session_start: '2026-01-05T00:00:00Z',
                activity_instances: [{ activity_definition_id: 'a2' }]
            },
            {
                id: 's3',
                attributes: {
                    created_at: '2026-01-03T00:00:00Z',
                    session_data: {
                        sections: [
                            { exercises: [{ activity_id: 'a3' }] }
                        ]
                    }
                }
            }
        ];

        const result = buildLastInstantiatedMap(sessions);
        expect(result.get('a1')).toBe('2026-01-01T00:00:00Z');
        expect(result.get('a2')).toBe('2026-01-05T00:00:00Z');
        expect(result.get('a3')).toBe('2026-01-03T00:00:00Z');
    });
});
