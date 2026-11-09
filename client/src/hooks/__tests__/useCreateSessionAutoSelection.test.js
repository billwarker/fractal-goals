import { renderHook } from '@testing-library/react';

import { useCreateSessionAutoSelection } from '../useCreateSessionProgramContext';

const required = (id) => ({ template_id: id, template_name: id, is_required: true });
const optional = (id) => ({ template_id: id, template_name: id, is_required: false });
const day = (id, sessions) => ({ day_id: id, program_id: 'program', sessions });

function select(programDays, overrides = {}) {
    const setters = {
        setSearchParams: vi.fn(),
        setSelectedProgramId: vi.fn(),
        setSessionSource: vi.fn(),
        setSelectedProgramDay: vi.fn(),
        setSelectedProgramSession: vi.fn(),
        setSelectedTemplate: vi.fn(),
    };
    renderHook(() => useCreateSessionAutoSelection({
        loading: false,
        programDays,
        searchParams: new URLSearchParams(),
        sessionSource: null,
        todayISO: '2026-11-07',
        ...setters,
        ...overrides,
    }));
    return setters;
}

describe('useCreateSessionAutoSelection', () => {
    it('selects today\'s program day and its only required template', () => {
        const legs = day('legs', [required('legs-a'), optional('stretch')]);
        const setters = select([legs]);
        expect(setters.setSessionSource).toHaveBeenCalledWith('program');
        expect(setters.setSelectedProgramId).toHaveBeenCalledWith('program');
        expect(setters.setSelectedProgramDay).toHaveBeenCalledWith(legs);
        expect(setters.setSelectedProgramSession).toHaveBeenCalledWith(legs.sessions[0]);
    });

    it('selects today\'s day but leaves the template open when several are required', () => {
        const legs = day('legs', [required('legs-a'), required('legs-b')]);
        const setters = select([legs]);
        expect(setters.setSelectedProgramDay).toHaveBeenCalledWith(legs);
        expect(setters.setSelectedProgramSession).not.toHaveBeenCalled();
        expect(setters.setSelectedTemplate).not.toHaveBeenCalled();
    });

    it('selects a lone optional template', () => {
        const legs = day('legs', [optional('legs-a')]);
        expect(select([legs]).setSelectedProgramSession).toHaveBeenCalledWith(legs.sessions[0]);
    });

    it('defaults to the first of several days today', () => {
        const legs = day('legs', [required('legs-a')]);
        const push = day('push', [required('push-a')]);
        expect(select([legs, push]).setSelectedProgramDay).toHaveBeenCalledWith(legs);
    });

    it('leaves the selection alone with nothing scheduled today or a source already chosen', () => {
        expect(select([]).setSelectedProgramDay).not.toHaveBeenCalled();
        const legs = day('legs', [required('legs-a')]);
        expect(select([legs], { sessionSource: 'template' }).setSelectedProgramDay).not.toHaveBeenCalled();
    });
});
