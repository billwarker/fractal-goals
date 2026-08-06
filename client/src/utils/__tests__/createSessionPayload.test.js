import { describe, expect, it, vi } from 'vitest';

import { buildTemplateSessionPayload } from '../createSessionPayload';

vi.stubGlobal('crypto', { randomUUID: () => 'uuid' });

describe('buildTemplateSessionPayload', () => {
    it('includes manual goal scope and normalizes activity and circuit items', () => {
        const payload = buildTemplateSessionPayload({
            id: 'template-1',
            name: 'Practice',
            template_data: {
                session_type: 'normal',
                sections: [{ name: 'Main', exercises: [
                    { activity_id: 'activity-1', name: 'Scales' },
                    { type: 'circuit', circuit_definition_id: 'circuit-1' },
                ] }],
            },
        }, null, ['goal-1']);

        expect(payload.goal_ids).toEqual(['goal-1']);
        expect(payload.session_data.sections[0].items).toEqual([
            { type: 'activity', name: 'Scales', activity_definition_id: 'activity-1' },
            { type: 'circuit', circuit_definition_id: 'circuit-1' },
        ]);
    });

    it('keeps quick-session payloads free of goal scope', () => {
        const payload = buildTemplateSessionPayload({
            id: 'quick-1', name: 'Quick', template_data: { session_type: 'quick' },
        }, null, ['goal-1']);
        expect(payload).not.toHaveProperty('goal_ids');
        expect(payload.session_data.session_type).toBe('quick');
    });
});
