import { describe, expect, it } from 'vitest';

import { spreadIconLefts } from '../GoalMarkerLayer';

describe('spreadIconLefts', () => {
    it('steps goals at one point to the left, first goal on the point', () => {
        const point = { left: 500, top: 100 };
        expect(spreadIconLefts([point, point, point])).toEqual([500, 474, 448]);
    });

    it('steps icons that would only partly cover each other', () => {
        expect(spreadIconLefts([{ left: 500, top: 100 }, { left: 500, top: 110 }])).toEqual([500, 474]);
    });

    it('leaves icons alone when they don’t touch', () => {
        const points = [{ left: 500, top: 100 }, { left: 500, top: 124 }, { left: 476, top: 100 }];
        expect(spreadIconLefts(points)).toEqual([500, 500, 476]);
    });
});
