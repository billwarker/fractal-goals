import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getSessionPlanCandidates = vi.fn();
vi.mock('../../../utils/api', () => ({
    fractalApi: { getSessionPlanCandidates: (...args) => getSessionPlanCandidates(...args) },
}));

import { useSessionPlanChoice } from '../SessionPlanChooser';

const template = { id: 'tmpl', session_type: 'normal', template_data: { session_type: 'normal' } };
const candidates = [
    { plan_id: 'today-plan', program_day_id: 'upper', date: '2026-10-05', is_today: true, executed: true },
    { plan_id: null, program_day_id: 'lower', date: '2026-10-05', is_today: true, executed: false },
    { plan_id: 'missed', program_day_id: 'upper', date: '2026-09-28', is_today: false, executed: false },
];

function renderChoice(programDayId = null, selectedTemplate = template) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    return renderHook(() => useSessionPlanChoice('root', selectedTemplate, '2026-10-05', programDayId), { wrapper });
}

beforeEach(() => {
    getSessionPlanCandidates.mockReset();
    getSessionPlanCandidates.mockResolvedValue({ data: { candidates } });
});

describe('useSessionPlanChoice', () => {
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
