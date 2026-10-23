import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import useAnalyticsDeepLink from '../useAnalyticsDeepLink';

function setup(initialEntry, activities) {
    const onApply = vi.fn();
    const wrapper = ({ children }) => <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
    const hook = renderHook(({ list }) => {
        useAnalyticsDeepLink({ isHydrated: true, activities: list, onApply });
        return useLocation();
    }, { wrapper, initialProps: { list: activities } });
    return { onApply, ...hook };
}

describe('useAnalyticsDeepLink', () => {
    it('waits for the activity, applies the link once, then clears it', async () => {
        const { onApply, result, rerender } = setup('/root-1/analytics?activity=act&viz=metricTrends&tags=heavy&tagMatch=exact', []);
        expect(onApply).not.toHaveBeenCalled();

        rerender({ list: [{ id: 'act', name: 'Squat' }] });
        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
        expect(onApply.mock.calls[0][0].globalFilters.tags).toEqual({ tagIds: ['heavy'], match: 'exact' });
        await waitFor(() => expect(result.current.search).toBe(''));

        rerender({ list: [{ id: 'act', name: 'Squat' }] });
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('ignores pages opened without a link', () => {
        const { onApply } = setup('/root-1/analytics', [{ id: 'act' }]);
        expect(onApply).not.toHaveBeenCalled();
    });
});
