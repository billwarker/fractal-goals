import { renderHook } from '@testing-library/react';

import useLevelDefaultDeadline from '../useLevelDefaultDeadline';

vi.mock('../../contexts/TimezoneContext', () => ({ useTimezone: () => ({ timezone: 'UTC' }) }));

const mid = { default_deadline_offset_value: 3, default_deadline_offset_unit: 'months' };
const short = { default_deadline_offset_value: 2, default_deadline_offset_unit: 'weeks' };

describe('useLevelDefaultDeadline', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    function setup(initial) {
        const setDeadline = vi.fn();
        const hook = renderHook((props) => useLevelDefaultDeadline({ setDeadline, ...props }), { initialProps: initial });
        return { setDeadline, ...hook };
    }

    it('starts a new goal at its level horizon and follows the level while untouched', () => {
        const { setDeadline, rerender } = setup({ mode: 'create', levelConfig: mid, deadline: '' });
        expect(setDeadline).toHaveBeenLastCalledWith('2027-01-19');

        rerender({ mode: 'create', levelConfig: short, deadline: '2027-01-19' });
        expect(setDeadline).toHaveBeenLastCalledWith('2026-11-02');
    });

    it('leaves typed dates, cleared dates and existing goals alone', () => {
        const typed = setup({ mode: 'create', levelConfig: mid, deadline: '2026-12-25' });
        expect(typed.setDeadline).not.toHaveBeenCalled();

        const cleared = setup({ mode: 'create', levelConfig: mid, deadline: '' });
        cleared.rerender({ mode: 'create', levelConfig: mid, deadline: '' });
        expect(cleared.setDeadline).toHaveBeenCalledTimes(1);

        const editing = setup({ mode: 'edit', levelConfig: mid, deadline: '' });
        expect(editing.setDeadline).not.toHaveBeenCalled();
    });
});
