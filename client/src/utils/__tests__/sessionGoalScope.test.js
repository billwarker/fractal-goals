import { describe, expect, it } from 'vitest';

import {
    getCurrentSessionActivityDefIds,
    getCurrentSessionInstanceIds,
    mergeUniqueIds,
} from '../sessionGoalScope';

describe('sessionGoalScope', () => {
    it('deduplicates and normalizes ids', () => {
        expect(mergeUniqueIds(['a', 1], [1, 'b', null])).toEqual(['a', '1', 'b']);
    });

    it('collects visible session instance ids from sections', () => {
        expect(getCurrentSessionInstanceIds({
            sections: [
                { activity_ids: ['inst-1'] },
                { activity_ids: ['inst-2', null] },
            ],
        })).toEqual(new Set(['inst-1', 'inst-2']));
    });

    it('filters activity definitions through visible section instance ids', () => {
        expect(getCurrentSessionActivityDefIds({
            activityInstances: [
                { id: 'inst-1', activity_definition_id: 'activity-1' },
                { id: 'stale-inst', activity_definition_id: 'activity-stale' },
            ],
            localSessionData: { sections: [{ activity_ids: ['inst-1'] }] },
            sessionGoalsView: { session_activity_ids: ['activity-stale'] },
        })).toEqual(new Set(['activity-1']));
    });

    it('falls back to the goals view when activity instances are not loaded', () => {
        expect(getCurrentSessionActivityDefIds({
            activityInstances: null,
            localSessionData: null,
            sessionGoalsView: { session_activity_ids: ['activity-1'] },
        })).toEqual(new Set(['activity-1']));
    });
});
