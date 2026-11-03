import { shownGrainNote } from '../visualizations/shared/GrainControl';

describe('shownGrainNote', () => {
    it('names what Auto chose and admits a coarsened grain', () => {
        expect(shownGrainNote('auto', 'week')).toBe('Showing weeks.');
        expect(shownGrainNote('day', 'week')).toBe('Showing weeks: days would be more than 500 bars for this range.');
        expect(shownGrainNote('day', 'day')).toBeNull();
        expect(shownGrainNote('day', null)).toBeNull();
    });
});
