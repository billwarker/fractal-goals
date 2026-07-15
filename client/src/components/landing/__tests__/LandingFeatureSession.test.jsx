import { describe, expect, it } from 'vitest';

import { buildSections } from '../LandingFeatureSession';

describe('LandingFeatureSession section adapter', () => {
    it('loads configured session instances when published section membership is stale', () => {
        const sections = buildSections({
            attributes: {
                session_data: {
                    sections: [{ id: 'section-1', name: 'Exercises', activity_ids: ['stale-id'] }],
                },
            },
            activity_instances: [
                { id: 'instance-1', activity_definition_id: 'activity-1' },
            ],
        });

        expect(sections).toEqual([
            expect.objectContaining({
                id: 'section-1',
                name: 'Exercises',
                activity_ids: ['instance-1'],
            }),
        ]);
    });
});
