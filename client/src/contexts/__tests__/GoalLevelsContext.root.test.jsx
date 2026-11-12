import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { getRootIdFromPath, GoalLevelsProvider } from '../GoalLevelsContext';

const { queryKeysSeen } = vi.hoisted(() => ({ queryKeysSeen: [] }));

vi.mock('../AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: true, user: { id: 'demo' } }),
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: ({ queryKey }) => {
        queryKeysSeen.push(queryKey);
        return { data: [], isLoading: false, error: null };
    },
    useMutation: () => ({ mutateAsync: vi.fn() }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../utils/api', () => ({ globalApi: { getGoalLevels: vi.fn() } }));

const ROOT = '2c848745-856e-4e3a-8b05-ebdd206de496';

describe('GoalLevelsProvider fractal scope', () => {
    beforeEach(() => {
        queryKeysSeen.length = 0;
    });

    it('reads the root from the path, ignoring non-fractal pages', () => {
        expect(getRootIdFromPath(`/${ROOT}/goals`)).toBe(ROOT);
        expect(getRootIdFromPath(`/${ROOT}`)).toBe(ROOT);
        expect(getRootIdFromPath('/selection')).toBeNull();
        expect(getRootIdFromPath(`/${ROOT}extra/goals`)).toBeNull();
    });

    it('loads the fractal’s own levels under the demo’s /demo basename', () => {
        render(
            <MemoryRouter basename="/demo" initialEntries={[`/demo/${ROOT}/goals`]}>
                <GoalLevelsProvider><span /></GoalLevelsProvider>
            </MemoryRouter>
        );

        expect(queryKeysSeen.at(-1)).toEqual(['goalLevels', ROOT, 'demo']);
    });
});
