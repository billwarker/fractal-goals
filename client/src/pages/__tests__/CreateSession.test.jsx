import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { getISOYMDInTimezone } from '../../utils/dateUtils';
import CreateSession from '../CreateSession';

const completeQuickSession = vi.fn();
const previewSessionGoalScope = vi.fn();
const getSessions = vi.fn();
const mockIsMobile = vi.hoisted(() => ({ value: false }));
const mockPageData = vi.hoisted(() => ({ value: null }));
const goalScopeProps = vi.hoisted(() => vi.fn());

const template = {
    id: 'template-1',
    name: 'Weigh Myself',
    template_data: { sections: [{ name: 'Main', items: [] }] },
};
const pastQuickSession = {
    id: 'past-quick-1',
    session_start: '2026-11-12T08:00:00Z',
    attributes: { session_data: { session_type: 'quick', activity_ids: ['past-instance-1'] } },
    activity_instances: [{
        id: 'past-instance-1',
        activity_definition_id: 'activity-1',
        metrics: [{ metric_id: 'weight', value: 82.4 }],
        sets: [],
    }],
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

vi.mock('../../offline/OutboxContext', () => ({ useOutbox: () => null }));

vi.mock('../../offline/idbKeyValue', () => ({
    idbGet: async () => undefined,
    idbSet: async () => {},
    idbDelete: async () => {},
}));

vi.mock('../../components/createSession', () => ({
    ProgramSelector: () => null,
    SourceSelector: ({ sessionSource, onSelectSource }) => (
        <div>
            <span>Source: {sessionSource || 'none'}</span>
            <button type="button" onClick={() => onSelectSource('quick')}>Quick Session source</button>
            <button type="button" onClick={() => onSelectSource('template')}>Template source</button>
        </div>
    ),
    ProgramDayPicker: ({ selectedProgramDay, selectedProgramSession }) => (
        <div>Program picker: {selectedProgramDay?.day_name || 'none'} / {selectedProgramSession?.template_name || 'none'}</div>
    ),
    TemplatePicker: ({ templates, onSelectTemplate }) => (
        <button type="button" onClick={() => onSelectTemplate(templates[0])}>
            Select Weigh Myself
        </button>
    ),
    CreateSessionActions: ({ selectedTemplate, quickActivityCount = null, onCreateSession }) => (
        quickActivityCount === null
            ? <button type="button">Create Session {selectedTemplate?.name || ''}</button>
            : (
                <button type="button" disabled={quickActivityCount === 0} onClick={onCreateSession}>
                    Complete Session ({quickActivityCount})
                </button>
            )
    ),
    QuickSessionSection: ({ draft, onAddActivity, onRemoveActivity, activityDefinitions }) => (
        <section aria-label="Quick session activities">
            {draft.items.map((item) => (
                <div key={item.key}>
                    <span>Logged {item.name}{item.previous ? ' (with last values)' : ''}</span>
                    <button type="button" onClick={() => onRemoveActivity(item.key)}>Remove {item.name}</button>
                </div>
            ))}
            <button type="button" onClick={() => onAddActivity(activityDefinitions[0])}>Add Bodyweight</button>
        </section>
    ),
    RecentQuickSessions: ({ sessions, onRepeat }) => (
        <div>
            <span>Recent: {sessions.length}</span>
            {sessions.map((session) => (
                <button key={session.id} type="button" onClick={() => onRepeat(session)}>
                    Repeat {session.id}
                </button>
            ))}
        </div>
    ),
    ProgramName: ({ name, color }) => <span style={{ color }}>{name}</span>,
    SessionGoalScopePanel: (props) => {
        goalScopeProps(props);
        return <div>
            <span>Session Goals · Manual: {props.manualGoalIds.join(',')}</span>
            <button type="button" onClick={() => props.onChange(['child'])}>Select child goal</button>
            <button type="button" onClick={() => props.onProgramScopeChange?.(!props.programScopeEnabled)}>Toggle program scope</button>
        </div>;
    },
    SessionPlanChooser: () => null,
    useSessionPlanChoice: () => ({ candidates: [], value: 'template', onChange: () => {}, payload: {} }),
    ProgramDayTodayBanner: ({ onJumpToProgramDay }) => <button type="button" onClick={onJumpToProgramDay}>Start this day</button>,
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        previewSessionGoalScope: (...args) => previewSessionGoalScope(...args),
        completeQuickSession: (...args) => completeQuickSession(...args),
        getSessions: (...args) => getSessions(...args),
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
    let uuid = 0;
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        mockIsMobile.value = false;
        goalScopeProps.mockClear();
        mockPageData.value = {
            templates: [template],
            programDays: [],
            programsById: {},
            activeProgram: null,
            activityDefinitions: [{ id: 'activity-1', name: 'Bodyweight', metric_definitions: [{ id: 'weight' }] }],
            activityGroups: [],
            allGoals: [],
            goalTree: null,
            loading: false,
        };
        completeQuickSession.mockResolvedValue({ data: { id: 'completed-quick-1' } });
        previewSessionGoalScope.mockResolvedValue({ data: { automatic_goal_ids: [] } });
        getSessions.mockResolvedValue({ data: { sessions: [pastQuickSession] } });
        uuid = 0;
        vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++uuid}`) });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('offers a quick session as a source; it replaces the goals panel and lists recent ones', async () => {
        renderPage();
        expect(screen.getByText(/Session Goals/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Quick Session source' }));

        expect(screen.getByRole('region', { name: 'Quick session activities' })).toBeInTheDocument();
        expect(screen.queryByText(/Session Goals/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Select Weigh Myself' })).not.toBeInTheDocument();
        expect(await screen.findByText('Recent: 1')).toBeInTheDocument();
        expect(getSessions).toHaveBeenCalledWith('root-1', expect.objectContaining({ session_type: 'quick', limit: 30 }));
        expect(screen.getByRole('button', { name: 'Complete Session (0)' })).toBeDisabled();
    });

    it('deep-links the quick source', () => {
        renderPage('/root-1/session/create?source=quick');
        expect(screen.getByText('Source: quick')).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Quick session activities' })).toBeInTheDocument();
    });

    it('adds and removes activities, then completes the session with what was logged', async () => {
        renderPage('/root-1/session/create?source=quick');

        fireEvent.click(screen.getByRole('button', { name: 'Add Bodyweight' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Bodyweight' }));
        expect(screen.getAllByText('Logged Bodyweight')).toHaveLength(2);
        fireEvent.click(screen.getAllByRole('button', { name: 'Remove Bodyweight' })[0]);
        expect(screen.getAllByText('Logged Bodyweight')).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: 'Complete Session (1)' }));

        await waitFor(() => {
            expect(completeQuickSession).toHaveBeenCalledWith('root-1', {
                name: 'Quick Session',
                session_start: expect.any(String),
                activity_instances: [expect.objectContaining({ activity_definition_id: 'activity-1' })],
            });
        });
        await waitFor(() => expect(screen.queryByText('Logged Bodyweight')).not.toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Complete Session (0)' })).toBeDisabled();
    });

    it('replaces the logged activities with a recent quick session\'s, with its last values as hints', async () => {
        renderPage('/root-1/session/create?source=quick');
        fireEvent.click(screen.getByRole('button', { name: 'Add Bodyweight' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Bodyweight' }));
        expect(screen.getAllByText('Logged Bodyweight')).toHaveLength(2);

        fireEvent.click(await screen.findByRole('button', { name: 'Repeat past-quick-1' }));

        expect(screen.queryByText('Logged Bodyweight')).not.toBeInTheDocument();
        expect(screen.getAllByText('Logged Bodyweight (with last values)')).toHaveLength(1);
    });

    it('lets session goals be chosen before a template, and keeps them once one is picked', () => {
        renderPage('/root-1/session/create?source=template');
        expect(goalScopeProps).toHaveBeenLastCalledWith(expect.objectContaining({ awaitingTemplate: true, fill: true }));
        expect(goalScopeProps.mock.lastCall[0].selectionDisabled).toBeFalsy();

        fireEvent.click(screen.getByRole('button', { name: 'Select child goal' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select Weigh Myself' }));

        expect(screen.getByText('Session Goals · Manual: child')).toBeInTheDocument();
        expect(goalScopeProps).toHaveBeenLastCalledWith(expect.objectContaining({ awaitingTemplate: false }));
    });

    it('starts on a quick session when there is nothing else to start from', () => {
        mockPageData.value = { ...mockPageData.value, templates: [] };
        renderPage();
        expect(screen.getByText('Source: quick')).toBeInTheDocument();
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

    it('logs a quick session inline on mobile, completed from the footer', () => {
        mockIsMobile.value = true;
        renderPage('/root-1/session/create?source=quick');

        expect(screen.queryByRole('button', { name: 'Show Session Goals' })).not.toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Quick session activities' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Complete Session (0)' })).toBeInTheDocument();
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

    it('honors an exact program-day/template/date deep link and preserves unrelated query state', async () => {
        const today = getISOYMDInTimezone(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
        const day = {
            day_id: 'day-linked', day_name: 'Linked Day', program_id: 'program-1', program_name: 'Strength',
            sessions: [
                { template_id: 'normal-1', template_name: 'Linked Session', template_data: { sections: [] } },
                { template_id: 'normal-2', template_name: 'Exact Session', template_data: { sections: [] } },
            ],
        };
        mockPageData.value = {
            ...mockPageData.value,
            templates: [],
            programDays: [day],
            programsById: { 'program-1': { program_id: 'program-1', program_name: 'Strength', days: [day] } },
        };
        renderPage(`/root-1/session/create?program_id=program-1&program_day_id=day-linked&date=${today}&template_id=normal-2&return_to=calendar`);
        await waitFor(() => expect(screen.getByText(/Program picker: Linked Day \/ Exact Session/)).toBeInTheDocument());
        expect(screen.getByTestId('location-search')).toHaveTextContent('?return_to=calendar');
    });

    it('shows a safe notice for an unavailable deep-linked day', async () => {
        renderPage('/root-1/session/create?program_day_id=missing');
        expect(await screen.findByText('That program day isn’t scheduled for today.')).toBeInTheDocument();
    });
});
