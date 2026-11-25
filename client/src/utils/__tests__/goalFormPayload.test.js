// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { goalFormChanges } from '../goalFormPayload';

const start = {
    name: 'Old', description: 'D', deadline: '2026-12-01', startedAt: '2026-01-01', completionCondition: 'manual',
    conditionDraft: null, inheritParentActivities: false, trackActivities: true, reviewCadence: null, reviewsOn: true,
};
const changes = (edits, options) => goalFormChanges({ values: { ...start, ...edits }, startingValues: start, ...options });

describe('goalFormChanges', () => {
    it('is null when nothing changed', () => {
        expect(changes({})).toBeNull();
        expect(changes({}, { usesReviews: true, attachments: [], savedAttachments: [] })).toBeNull();
    });

    it('sends only what changed, with what it held', () => {
        expect(changes({ name: 'New' })).toEqual({ name: 'New', _base: { name: 'Old' } });
        expect(changes({ deadline: '' })).toEqual({ deadline: null, _base: { deadline: '2026-12-01' } });
        expect(changes({ trackActivities: false })).toEqual({ track_activities: false });
    });

    it('keeps settings that belong together', () => {
        expect(changes({ reviewCadence: { value: 2, unit: 'weeks' } }, { usesReviews: true }))
            .toEqual({ review_cadence_value: 2, review_cadence_unit: 'weeks' });
        expect(changes({ reviewsOn: false }, { usesReviews: true })).toEqual({ review_disabled: true });
    });

    it('compares attachments by file and description', () => {
        const savedAttachments = [{ asset_id: 'a', alt_text: null, name: 'a.png' }];
        expect(changes({}, { attachments: [{ asset_id: 'a', alt_text: '' }], savedAttachments })).toBeNull();
        expect(changes({}, { attachments: [{ asset_id: 'a', alt_text: 'New' }], savedAttachments }))
            .toEqual({ attachments: [{ asset_id: 'a', alt_text: 'New' }] });
        expect(changes({}, { attachments: [], savedAttachments })).toEqual({ attachments: [] });
        // Never sent before the saved list has loaded.
        expect(changes({}, { attachments: null, savedAttachments })).toBeNull();
    });
});
