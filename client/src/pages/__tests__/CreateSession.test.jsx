import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { getISOYMDInTimezone } from '../../utils/dateUtils';
import CreateSession from '../CreateSession';

const completeQuickSession = vi.fn();
const previewSessionGoalScope = vi.fn();
const mockIsMobile = vi.hoisted(() => ({ value: false }));
const mockPageData = vi.hoisted(() => ({ value: null }));
const goalScopeProps = vi.hoisted(() => vi.fn());

const quickTemplate = {
    id: 'quick-template-1',
    name: 'Weigh Myself',
    template_data: {
        session_type: 'quick',
        activities: [{ activity_definition_id: 'activity-1' }],
    },
};

vi.mock('../../hooks/useCreateSessionPageData', () => ({
    useCreateSessionPageData: () => mockPageData.value,
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
    ProgramDayPicker: ({ selectedProgramDay, selectedProgramSession }) => (
        <div>Program picker: {selectedProgramDay?.day_name || 'none'} / {selectedProgramSession?.template_name || 'none'}</div>
    ),
    TemplatePicker: ({ templates, onSelectTemplate }) => (
        <button type="button" onClick={() => onSelectTemplate(templates[0])}>
            Select Weigh Myself
        </button>
    ),
    CreateSessionActions: ({ selectedTemplate }) => <button type="button">Create Session {selectedTemplate?.name || ''}</button>,
    ProgramName: ({ name, color }) => <span style={{ color }}>{name}</span>,
    SessionGoalScopePanel: (props) => {
        goalScopeProps(props);
        return <div>
            <span>Session Goals · Manual: {props.manualGoalIds.join(',')}</span>
            <button type="button" onClick={() => props.onChange(['child'])}>Select child goal</button>
            <button type="button" onClick={() => props.onProgramScopeChange?.(!props.programScopeEnabled)}>Toggle program scope</button>
        </div>;
    },
    ProgramDayTodayBanner: ({ onJumpToProgramDay }) => <button type="button" onClick={onJumpToProgramDay}>Start this day</button>,
    QuickSessionModal: ({ isOpen, onClose, onComplete }) => isOpen ? (
        <div role="dialog" aria-label="Quick Session">
            <button type="button" onClick={onClose}>Cancel quick session</button>
            <button type="button" onClick={onComplete}>Submit quick session</button>
        </div>
    ) : null,
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        previewSessionGoalScope: (...args) => previewSessionGoalScope(...args),
        completeQuickSession: (...args) => completeQuickSession(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

function renderPage(initialEntry = '/root-1/session/create') {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[initialEntry]}>
                <LocationProbe />
                <Routes>
                    <Route path="/:rootId/session/create" element={<CreateSession />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

function LocationProbe() {
    const location = useLocation();
    return <span data-testid="location-search">{location.search}</span>;
}

describe('CreateSession quick-session flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsMobile.value = false;
        goalScopeProps.mockClear();
        mockPageData.value = {
            templates: [quickTemplate],
            programDays: [],
            programsById: {},
            activeProgram: null,
            activityDefinitions: [{ id: 'activity-1', name: 'Bodyweight' }],
            activityGroups: [],
            allGoals: [],
            goalTree: null,
            loading: false,
        };
        completeQuickSession.mockResolvedValue({ data: { id: 'completed-quick-1' } });
        previewSessionGoalScope.mockResolvedValue({ data: { automatic_goal_ids: [] } });
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

    it('auto-selects a single required program session and scopes goals to its lineage', async () => {
        const day = {
            day_id: 'day-1', day_name: 'Push', day_number: 1,
            program_id: 'program-1', program_name: 'Strength',
            block_id: 'block-1', block_name: 'Base',
            program_goal_ids: ['child'], block_goal_ids: [],
            sessions: [{
                template_id: 'normal-1', template_name: 'Push Session', is_required: true,
                template_data: { sections: [] },
            }],
        };
        mockPageData.value = {
            ...mockPageData.value,
            templates: [{ id: 'normal-1', name: 'Push Session', template_data: { sections: [] } }],
            programDays: [day],
            programsById: { 'program-1': { program_id: 'program-1', program_name: 'Strength', days: [day] } },
            goalTree: { id: 'root', children: [{ id: 'child', children: [{ id: 'leaf', children: [] }] }, { id: 'other', children: [] }] },
            allGoals: [{ id: 'root' }, { id: 'child' }, { id: 'leaf' }, { id: 'other' }],
        };
        renderPage();

        await waitFor(() => expect(screen.getByText(/Program picker: Push \/ Push Session/)).toBeInTheDocument());
        await waitFor(() => expect(goalScopeProps).toHaveBeenLastCalledWith(expect.objectContaining({
            goals: [{ id: 'child' }, { id: 'leaf' }],
            programScopeEnabled: true,
        })));
        fireEvent.click(screen.getByRole('button', { name: 'Select child goal' }));
        fireEvent.click(screen.getByRole('button', { name: 'Toggle program scope' }));
        await waitFor(() => expect(goalScopeProps).toHaveBeenLastCalledWith(expect.objectContaining({
            manualGoalIds: ['child'],
            goals: [{ id: 'root' }, { id: 'child' }, { id: 'leaf' }, { id: 'other' }],
            programScopeEnabled: false,
        })));
    });

    it('keeps active program identity and goal scoping when no day is scheduled today', async () => {
        const todayISO = getISOYMDInTimezone(
            new Date(),
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        );
        previewSessionGoalScope.mockResolvedValueOnce({
            data: { automatic_goal_ids: ['child', 'other'] },
        });
        mockPageData.value = {
            ...mockPageData.value,
            templates: [{ id: 'normal-1', name: 'Open Practice', template_data: { sections: [] } }],
            activeProgram: {
                id: 'program-1',
                name: 'Q4 2026',
                color: '#ef4444',
                start_date: todayISO,
                end_date: todayISO,
                goal_ids: ['child'],
                blocks: [{
                    id: 'block-1', name: 'Month 1', color: '#d946ef',
                    start_date: todayISO, end_date: todayISO,
                }],
            },
            goalTree: { id: 'root', children: [{ id: 'child', children: [] }, { id: 'other', children: [] }] },
            allGoals: [{ id: 'root' }, { id: 'child' }, { id: 'other' }],
        };

        renderPage();

        expect(screen.getByText((_, element) => (
            element.tagName === 'P' && element.textContent === 'In Month 1 · Q4 2026'
        ))).toBeInTheDocument();
        expect(screen.getByText('Month 1')).toHaveStyle({ color: '#d946ef' });
        expect(screen.getByText('Q4 2026')).toHaveStyle({ color: '#ef4444' });
        await waitFor(() => expect(goalScopeProps).toHaveBeenLastCalledWith(expect.objectContaining({
            programScopeAvailable: true,
            programScopeEnabled: true,
            programName: 'Q4 2026',
            programColor: '#ef4444',
            goals: [{ id: 'child' }],
        })));

        fireEvent.click(screen.getByRole('button', { name: 'Select Weigh Myself' }));
        await waitFor(() => expect(previewSessionGoalScope).toHaveBeenCalledWith(
            'root-1',
            { template_id: 'normal-1' },
        ));
        await waitFor(() => expect(goalScopeProps).toHaveBeenLastCalledWith(expect.objectContaining({
            automaticGoalIds: ['child'],
        })));
    });

    it('honors a program-day deep link and clears the query parameter', async () => {
        const day = {
            day_id: 'day-linked', day_name: 'Linked Day', program_id: 'program-1', program_name: 'Strength',
            sessions: [{ template_id: 'normal-1', template_name: 'Linked Session', template_data: { sections: [] } }],
        };
        mockPageData.value = {
            ...mockPageData.value,
            templates: [],
            programDays: [day],
            programsById: { 'program-1': { program_id: 'program-1', program_name: 'Strength', days: [day] } },
        };
        renderPage('/root-1/session/create?program_day_id=day-linked');
        await waitFor(() => expect(screen.getByText(/Program picker: Linked Day \/ Linked Session/)).toBeInTheDocument());
        expect(screen.getByTestId('location-search')).toHaveTextContent('');
    });

    it('shows a safe notice for an unavailable deep-linked day', async () => {
        renderPage('/root-1/session/create?program_day_id=missing');
        expect(await screen.findByText('That program day isn’t scheduled for today.')).toBeInTheDocument();
    });
});
