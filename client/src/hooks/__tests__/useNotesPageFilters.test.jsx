import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useNotesPageFilters } from '../useNotesPageFilters';

function setup(initial = '/root/notes') {
    const wrapper = ({ children }) => <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;
    return renderHook(() => ({ state: useNotesPageFilters('America/New_York'), location: useLocation() }), { wrapper });
}

describe('useNotesPageFilters', () => {
    it('round-trips every filter through the URL', () => {
        const { result } = setup();
        act(() => result.current.state.updateFilters({
            text: 'elbow scapula', categories: ['goals', 'sessions'], goalId: 'g1', goalName: 'Handstand',
            activityIds: ['a1'], groupIds: ['grp'], pinnedOnly: true, savedFilterIds: ['f1', 'f2'], day: '2026-10-23',
        }));
        const params = new URLSearchParams(result.current.location.search);
        expect(Object.fromEntries(params)).toEqual({
            q: 'elbow scapula', cat: 'goals,sessions', goal: 'g1', goal_name: 'Handstand',
            act: 'a1', grp: 'grp', pinned: '1', saved: 'f1,f2', day: '2026-10-23',
        });
        expect(result.current.state.apiFilters).toEqual({
            text: 'elbow scapula', categories: ['goals', 'sessions'], goal_id: 'g1',
            activity_definition_ids: ['a1'], activity_group_ids: ['grp'], pinned_only: true,
            saved_filter_ids: ['f1', 'f2'], day: '2026-10-23', timezone: 'America/New_York',
        });
        expect(result.current.state.hasAdHocFilters).toBe(true);
    });

    it('ignores unknown categories and malformed days from a shared link', () => {
        const { result } = setup('/root/notes?cat=goals,activities&day=yesterday');
        expect(result.current.state.filters).toMatchObject({ categories: ['goals'], day: null });
    });

    it('clears ad-hoc filters but keeps selected saved filters', () => {
        const { result } = setup('/root/notes?q=elbow&cat=goals&saved=f1&day=2026-10-23');
        act(() => result.current.state.clearAdHoc());
        expect(result.current.location.search).toBe('?saved=f1&day=2026-10-23');
        act(() => result.current.state.clearAll());
        expect(result.current.location.search).toBe('');
    });

    it('clears ad-hoc filters and selects a saved filter in one URL update', () => {
        const { result } = setup('/root/notes?q=elbow&cat=goals');
        act(() => result.current.state.clearAdHoc({ savedFilterIds: ['new'] }));
        expect(result.current.location.search).toBe('?saved=new');
    });
});
