import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import ActivityModeSelector from '../ActivityModeSelector';

const useActivityModes = vi.fn();

vi.mock('../../../hooks/useActivityQueries', () => ({
    useActivityModes: (...args) => useActivityModes(...args),
}));

describe('ActivityModeSelector', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when there are no modes and no all option', () => {
        useActivityModes.mockReturnValue({ activityModes: [] });

        const { container } = render(
            <ActivityModeSelector
                rootId="root-1"
                selectedModeIds={[]}
                onChange={vi.fn()}
            />
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('toggles selected modes and supports the all option', () => {
        const onChange = vi.fn();
        useActivityModes.mockReturnValue({
            activityModes: [
                { id: 'mode-1', name: 'Strength', color: '#2255DD' },
                { id: 'mode-2', name: 'Tempo', color: '#55AA33' },
            ],
        });

        const { rerender } = render(
            <ActivityModeSelector
                rootId="root-1"
                selectedModeIds={['mode-1']}
                onChange={onChange}
                showAllOption
                allLabel="All Modes"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Tempo' }));
        expect(onChange).toHaveBeenCalledWith(['mode-1', 'mode-2']);

        rerender(
            <ActivityModeSelector
                rootId="root-1"
                selectedModeIds={['mode-1']}
                onChange={onChange}
                showAllOption
                allLabel="All Modes"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Strength' }));
        expect(onChange).toHaveBeenCalledWith([]);

        rerender(
            <ActivityModeSelector
                rootId="root-1"
                selectedModeIds={['mode-1', 'mode-2']}
                onChange={onChange}
                showAllOption
                allLabel="All Modes"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'All Modes' }));
        expect(onChange).toHaveBeenCalledWith([]);
    });
});
