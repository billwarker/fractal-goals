import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import CreateSession from '../CreateSession';

const completeQuickSession = vi.fn();
const mockIsMobile = vi.hoisted(() => ({ value: false }));

const quickTemplate = {
    id: 'quick-template-1',
    name: 'Weigh Myself',
    template_data: {
        session_type: 'quick',
        activities: [{ activity_definition_id: 'activity-1' }],
    },
};

vi.mock('../../hooks/useCreateSessionPageData', () => ({
    useCreateSessionPageData: () => ({
        templates: [quickTemplate],
        programDays: [],
        programsByName: {},
        activityDefinitions: [{ id: 'activity-1', name: 'Bodyweight' }],
        activityGroups: [],
        allGoals: [],
        loading: false,
    }),
}));

vi.mock('../../hooks/useSessionQueries', () => ({
    useActiveSession: () => ({ data: null, isFetched: true }),
}));

vi.mock('../../hooks/useIsMobile', () => ({
    default: () => mockIsMobile.value,
}));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('../../contexts/ActiveSessionContext', () => ({
    QueuedQuickSessionProvider: ({ children }) => <>{children}</>,
}));

vi.mock('../../components/createSession', () => ({
    ProgramSelector: () => null,
    SourceSelector: () => null,
    ProgramDayPicker: () => null,
    TemplatePicker: ({ templates, onSelectTemplate }) => (
        <button type="button" onClick={() => onSelectTemplate(templates[0])}>
            Select Weigh Myself
        </button>
    ),
    CreateSessionActions: () => <button type="button">Create Session</button>,
    SessionGoalScopePanel: () => <div>Session Goals</div>,
    QuickSessionModal: ({ isOpen, onClose, onComplete }) => isOpen ? (
        <div role="dialog" aria-label="Quick Session">
            <button type="button" onClick={onClose}>Cancel quick session</button>
            <button type="button" onClick={onComplete}>Submit quick session</button>
        </div>
    ) : null,
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        previewSessionGoalScope: vi.fn().mockResolvedValue({ data: { automatic_goal_ids: [] } }),
        completeQuickSession: (...args) => completeQuickSession(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/root-1/session/create']}>
                <Routes>
                    <Route path="/:rootId/session/create" element={<CreateSession />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('CreateSession quick-session flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsMobile.value = false;
        completeQuickSession.mockResolvedValue({ data: { id: 'completed-quick-1' } });
        vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('opens a modal for a quick template and discards the draft on cancel', () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Select Weigh Myself' }));
        expect(screen.getByRole('dialog', { name: 'Quick Session' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel quick session' }));
        expect(screen.queryByRole('dialog', { name: 'Quick Session' })).not.toBeInTheDocument();
    });

    it('submits the queued activity values and closes after success', async () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Select Weigh Myself' }));
        fireEvent.click(screen.getByRole('button', { name: 'Submit quick session' }));

        await waitFor(() => {
            expect(completeQuickSession).toHaveBeenCalledWith(
                'root-1',
                expect.objectContaining({
                    template_id: 'quick-template-1',
                    activity_instances: [expect.objectContaining({
                        activity_definition_id: 'activity-1',
                    })],
                })
            );
        });
        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Quick Session' })).not.toBeInTheDocument();
        });
    });

    it('discloses Session Goals from the mobile page header', () => {
        mockIsMobile.value = true;
        renderPage();

        const toggle = screen.getByRole('button', { name: 'Show Session Goals' });
        expect(screen.queryByRole('dialog', { name: 'Session Goals' })).not.toBeInTheDocument();
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(toggle);

        expect(screen.getByRole('dialog', { name: 'Session Goals' })).toBeInTheDocument();
        expect(document.getElementById('create-session-goals')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Hide Session Goals' })).toHaveAttribute('aria-expanded', 'true');

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog', { name: 'Session Goals' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Show Session Goals' })).toHaveAttribute('aria-expanded', 'false');
    });
});
