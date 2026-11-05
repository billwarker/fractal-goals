import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import useGoalDeepLink from '../useGoalDeepLink';
import { goalDeepLink } from '../../utils/goalDeepLink';

const tree = { id: 'root', name: 'Guitar', children: [{ id: 'g1', name: 'Blues', children: [] }] };

function Page({ fractalData, openGoal, onLocation }) {
    useGoalDeepLink(fractalData, openGoal);
    onLocation(useLocation());
    return null;
}

const renderAt = (url, props) => render(
    <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/:rootId/goals" element={<Page {...props} />} /></Routes>
    </MemoryRouter>,
);

describe('useGoalDeepLink', () => {
    it('opens the linked goal once the tree loads, then drops the parameter', () => {
        const openGoal = vi.fn();
        const onLocation = vi.fn();
        const { rerender } = renderAt(goalDeepLink('root', 'g1'), { fractalData: null, openGoal, onLocation });
        expect(openGoal).not.toHaveBeenCalled();
        rerender(
            <MemoryRouter initialEntries={['/root/goals?goal=g1']}>
                <Routes><Route path="/:rootId/goals" element={<Page fractalData={tree} openGoal={openGoal} onLocation={onLocation} />} /></Routes>
            </MemoryRouter>,
        );
        expect(openGoal).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }));
        expect(onLocation.mock.calls.at(-1)[0].search).toBe('');
    });

    it('ignores an unknown goal but still drops the parameter', () => {
        const openGoal = vi.fn();
        const onLocation = vi.fn();
        renderAt('/root/goals?goal=missing', { fractalData: tree, openGoal, onLocation });
        expect(openGoal).not.toHaveBeenCalled();
        expect(onLocation.mock.calls.at(-1)[0].search).toBe('');
    });
});
