import React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getSessionPlanCandidates = vi.fn();
vi.mock('../../../utils/api', () => ({
    fractalApi: { getSessionPlanCandidates: (...args) => getSessionPlanCandidates(...args) },
}));

import SessionPlanChooser, { useSessionPlanChoice } from '../SessionPlanChooser';

const template = { id: 'tmpl', session_type: 'normal', template_data: { session_type: 'normal' } };
const candidates = [
    { plan_id: 'today-plan', program_day_id: 'upper', date: '2026-10-05', is_today: true, executed: true },
    { plan_id: null, program_day_id: 'lower', date: '2026-10-05', is_today: true, executed: false },
    { plan_id: 'missed', program_day_id: 'upper', date: '2026-09-28', is_today: false, executed: false },
];

function renderChoice(programDayId = null, selectedTemplate = template, preferLatest = false) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    return renderHook(() => useSessionPlanChoice('root', selectedTemplate, '2026-10-05', programDayId, preferLatest), { wrapper });
}

beforeEach(() => {
    getSessionPlanCandidates.mockReset();
    getSessionPlanCandidates.mockResolvedValue({ data: { candidates } });
});

describe('SessionPlanChooser', () => {
    const plans = [
        { plan_id: 'a', program_day_id: 'upper', program_day_name: 'Upper', date: '2026-11-06', is_today: false, executed: false },
        { plan_id: 'b', program_day_id: 'upper', program_day_name: 'Upper', date: '2026-10-30', is_today: false, executed: true },
    ];

    it('lists one day\'s dated plans without repeating its name', () => {
        render(<SessionPlanChooser candidates={plans} value="template" onChange={vi.fn()} />);
        expect(screen.getByRole('option', { name: /Nov 6 · not yet done/ })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /Oct 30 · already done/ })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: /Upper/ })).not.toBeInTheDocument();
    });

    it('explains an empty list only once it has loaded and a message is given', () => {
        const message = 'No saved plans for this day.';
        const { rerender, container } = render(<SessionPlanChooser candidates={[]} loading emptyMessage={message} />);
        expect(container).toBeEmptyDOMElement();
        rerender(<SessionPlanChooser candidates={[]} />);
        expect(container).toBeEmptyDOMElement();
        rerender(<SessionPlanChooser candidates={[]} emptyMessage={message} />);
        expect(screen.getByText(message)).toBeInTheDocument();
    });
});

describe('useSessionPlanChoice', () => {
    it('defaults a previous day to its newest plan, even one already run', async () => {
        getSessionPlanCandidates.mockResolvedValue({ data: { candidates: [
            { plan_id: 'ran', program_day_id: 'upper', date: '2026-09-28', is_today: false, executed: true },
            { plan_id: 'older', program_day_id: 'upper', date: '2026-09-21', is_today: false, executed: false },
        ] } });
        const { result } = renderChoice('upper', template, true);

        await waitFor(() => expect(result.current.payload).toEqual({ program_session_plan_id: 'ran' }));
    });

    it('uses the template for a previous day with no stored plan', async () => {
        getSessionPlanCandidates.mockResolvedValue({ data: { candidates: [] } });
        const { result } = renderChoice('upper', template, true);

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.value).toBe('template');
        expect(result.current.payload).toEqual({});
    });

    it('never picks an executed plan or one older than two weeks for you', async () => {
        getSessionPlanCandidates.mockResolvedValue({ data: { candidates: [
            { plan_id: 'ran', program_day_id: 'upper', date: '2026-10-01', is_today: false, executed: true },
            { plan_id: 'old', program_day_id: 'upper', date: '2026-09-20', is_today: false, executed: false },
        ] } });
        const { result } = renderChoice();

        await waitFor(() => expect(result.current.candidates).toHaveLength(2));
        expect(result.current.value).toBe('template');
    });

    it('defaults to the first unexecuted plan and sends a virtual plan by reference', async () => {
        const { result } = renderChoice();

        await waitFor(() => expect(result.current.candidates).toHaveLength(3));
        expect(result.current.payload).toEqual({ plan_ref: { program_day_id: 'lower', date: '2026-10-05' } });
    });

    it('offers only the selected program day, so the server link stays consistent', async () => {
        const { result } = renderChoice('upper');

        await waitFor(() => expect(result.current.candidates).toHaveLength(2));
        expect(result.current.payload).toEqual({ program_session_plan_id: 'missed' });
    });

    it('lets the user opt out to the template alone', async () => {
        const { result } = renderChoice();
        await waitFor(() => expect(result.current.candidates).toHaveLength(3));

        act(() => result.current.onChange('template'));

        expect(result.current.payload).toEqual({});
    });

    it('never asks for plans for quick templates', () => {
        const { result } = renderChoice(null, { id: 'quick', session_type: 'quick', template_data: { session_type: 'quick' } });

        expect(result.current.candidates).toEqual([]);
        expect(getSessionPlanCandidates).not.toHaveBeenCalled();
    });
});
