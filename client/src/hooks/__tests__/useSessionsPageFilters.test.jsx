import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import useSessionsPageFilters, { describeSessionRange } from '../useSessionsPageFilters';

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

describe('describeSessionRange', () => {
    it.each([
        [{ rangePreset: '7d' }, 'last 7 days'],
        [{ rangePreset: '90d' }, 'last 90 days'],
        [{ rangePreset: '6m' }, 'last 6 months'],
        [{ rangePreset: '1y' }, 'last year'],
        [{ rangePreset: 'all' }, 'all time'],
        [{ rangePreset: 'custom', rangeStart: '2026-08-13', rangeEnd: '2026-11-10' }, 'Aug 13, 2026 – Nov 10, 2026'],
        [{ rangePreset: 'custom', rangeStart: '2026-08-13' }, 'since Aug 13, 2026'],
        [{ rangePreset: 'custom', rangeEnd: '2026-11-10' }, 'until Nov 10, 2026'],
        [{ rangePreset: 'custom' }, 'all time'],
    ])('%j reads %s', (filters, expected) => {
        expect(describeSessionRange(filters)).toBe(expected);
    });
});
