import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import useSessionsPageFilters from '../useSessionsPageFilters';

function Wrapper({ children }) {
    return (
        <MemoryRouter initialEntries={['/sessions?completed=incomplete&activity_ids=a1']}>
            {children}
        </MemoryRouter>
    );
}

describe('useSessionsPageFilters', () => {
    it('does not count an obsolete completion parameter as an active filter', () => {
        const { result } = renderHook(() => useSessionsPageFilters('UTC'), {
            wrapper: ({ children }) => (
                <MemoryRouter initialEntries={['/sessions?completed=completed']}>
                    {children}
                </MemoryRouter>
            ),
        });
        expect(result.current.hasActiveFilters).toBe(false);
    });

    it('ignores legacy completion filters in list and heatmap requests and clears them on update', () => {
        const { result } = renderHook(() => ({
            ...useSessionsPageFilters('UTC'),
            params: useSearchParams()[0],
        }), { wrapper: Wrapper });
        expect(result.current.filters).not.toHaveProperty('completed');
        expect(result.current.apiFilters).not.toHaveProperty('completed');
        expect(result.current.heatmapApiFilters).not.toHaveProperty('completed');
        expect(result.current.apiFilters.activity_ids).toEqual(['a1']);
        act(() => result.current.updateFilters({ sortOrder: 'asc' }));
        expect(result.current.params.has('completed')).toBe(false);
        expect(result.current.params.get('activity_ids')).toBe('a1');
        expect(result.current.apiFilters.sort_order).toBe('asc');
        act(() => result.current.resetFilters());
        expect(result.current.hasActiveFilters).toBe(false);
    });
});
