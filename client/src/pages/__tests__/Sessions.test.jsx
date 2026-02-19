import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Sessions from '../Sessions';

const getSessions = vi.fn();
const getActivities = vi.fn();
const getSessionActivities = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessions: (...args) => getSessions(...args),
        getActivities: (...args) => getActivities(...args),
        getSessionActivities: (...args) => getSessionActivities(...args),
    }
}));

vi.mock('../../contexts/ThemeContext', () => ({
    useTheme: () => ({ getGoalColor: () => '#00aa00' })
}));

vi.mock('../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'UTC' })
}));

vi.mock('../../contexts/GoalsContext', () => ({
    useGoals: () => ({ setActiveRootId: vi.fn() })
}));

vi.mock('../../hooks/useIsMobile', () => ({
    default: () => false
}));

vi.mock('../../components/sessions', () => ({
    SessionNotesSidebar: () => <div data-testid="notes-sidebar" />,
    SessionCardExpanded: ({ sessionActivityInstances = [] }) => (
        <div>instances:{sessionActivityInstances.length}</div>
    )
}));

describe('Sessions page data loading', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(() => null),
                setItem: vi.fn(),
            },
            configurable: true
        });
    });

    it('uses embedded session.activity_instances and avoids per-session activity fetches', async () => {
        getSessions.mockResolvedValue({
            data: {
                sessions: [
                    {
                        id: 's1',
                        name: 'Session 1',
                        attributes: { completed: false, session_data: { sections: [] } },
                        activity_instances: [{ id: 'i1' }],
                        notes: []
                    }
                ],
                pagination: { limit: 10, offset: 0, total: 1, has_more: false }
            }
        });
        getActivities.mockResolvedValue({ data: [] });

        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } }
        });

        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={['/root-1/sessions']}>
                    <Routes>
                        <Route path="/:rootId/sessions" element={<Sessions />} />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('instances:1')).toBeInTheDocument();
        });

        expect(getSessionActivities).not.toHaveBeenCalled();
    });
});
