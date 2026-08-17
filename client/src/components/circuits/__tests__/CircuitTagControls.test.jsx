import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { CircuitRoundTagControl, CircuitRunTagControl } from '../CircuitTagControls';


describe('circuit scope tag controls', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('selects an existing logical tag for the whole circuit', async () => {
        const onPerform = vi.fn().mockResolvedValue(true);
        render(
            <CircuitRunTagControl
                run={{ id: 'run-1', tags: [] }}
                availableTags={[{ id: 'tag-a', name: 'Competition', archived: false }]}
                onPerform={onPerform}
            />,
        );

        const control = screen.getByRole('group', { name: 'Circuit tags' });
        fireEvent.click(within(control).getByRole('button', { name: 'Add circuit tags' }));
        fireEvent.click(within(control).getByText('Competition'));

        await waitFor(() => expect(onPerform).toHaveBeenCalledWith({
            action: 'updateRunTag',
            value: { name: 'Competition', color: null, assigned: true },
            inlineError: true,
        }));
    });

    it('creates a logical tag for one round', async () => {
        const onPerform = vi.fn().mockResolvedValue(true);
        render(
            <CircuitRoundTagControl
                round={{ id: 'round-1', round_number: 1, tags: [] }}
                availableTags={[]}
                onPerform={onPerform}
            />,
        );

        const control = screen.getByRole('group', { name: 'Round 1 tags' });
        fireEvent.click(within(control).getByRole('button', { name: 'Add round 1 tags' }));
        fireEvent.change(within(control).getByRole('textbox', { name: 'New round 1 tags name' }), {
            target: { value: 'Sprint' },
        });
        fireEvent.click(within(control).getByRole('button', { name: 'Create' }));

        await waitFor(() => expect(onPerform).toHaveBeenCalledWith({
            action: 'updateRoundTag',
            roundId: 'round-1',
            value: { name: 'Sprint', color: null, assigned: true },
            inlineError: true,
        }));
    });

    it('keeps assigned round tags read-only when its circuit is not selected', () => {
        render(
            <CircuitRoundTagControl
                round={{ id: 'round-1', round_number: 1, tags: [{ id: 'tag-a', name: 'Sprint' }] }}
                availableTags={[{ id: 'tag-a', name: 'Sprint', archived: false }]}
                editable={false}
                onPerform={vi.fn()}
            />,
        );

        const control = screen.getByRole('group', { name: 'Round 1 tags' });
        expect(within(control).getByText('Sprint')).toBeInTheDocument();
        expect(within(control).queryByRole('button', { name: 'Add round 1 tags' })).not.toBeInTheDocument();
    });

    it('summarizes circuit tags before they overflow the timer row', () => {
        let resizeCallback;
        vi.stubGlobal('ResizeObserver', class ResizeObserver {
            constructor(callback) {
                resizeCallback = callback;
            }

            observe() {}

            disconnect() {}
        });
        const tags = ['One', 'Two', 'Three', 'Four'].map((name) => ({ id: name, name }));
        render(
            <CircuitRunTagControl
                run={{ id: 'run-1', tags }}
                availableTags={tags}
                onPerform={vi.fn()}
            />,
        );

        const control = screen.getByRole('group', { name: 'Circuit tags' });
        const tagRow = control.firstElementChild;
        const measure = tagRow.querySelector('[data-tag-label]').parentElement;
        const trigger = within(control).getByRole('button', { name: 'Add circuit tags' });
        Object.defineProperty(tagRow, 'clientWidth', { configurable: true, value: 180 });
        Object.defineProperty(measure, 'scrollWidth', { configurable: true, value: 240 });
        trigger.getBoundingClientRect = () => ({ width: 52 });

        act(() => resizeCallback());
        expect(screen.getByLabelText('4 tags assigned')).toHaveTextContent('4 tags');
        expect(within(control).queryAllByRole('checkbox')).toHaveLength(0);
        expect(trigger).toBeVisible();
    });
});
