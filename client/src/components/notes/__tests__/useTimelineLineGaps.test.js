import { lineMask } from '../useTimelineLineGaps';

describe('lineMask', () => {
    it('leaves a line whole when nothing sits on it', () => {
        expect(lineMask([])).toBeNull();
    });

    it('cuts a transparent band for each node, in order down the line', () => {
        expect(lineMask([[40.4, 62], [-2, 10]])).toBe(
            'linear-gradient(to bottom, #000 0, #000 0px, transparent 0px, transparent 10px, #000 10px, '
            + '#000 40px, transparent 40px, transparent 62px, #000 62px)',
        );
    });
});
