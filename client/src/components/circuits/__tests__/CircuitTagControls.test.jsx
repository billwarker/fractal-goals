import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { CircuitRoundTagControl, CircuitRunTagControl } from '../CircuitTagControls';
import styles from '../../sessionDetail/ActivityTagEditor.module.css';


const catalog = (tags, families = []) => ({ families, tags });

describe('circuit scope tag controls', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('uses the activity chip style for assigned circuit tags', () => {
        render(<CircuitRunTagControl run={{ tags: [{ id: 'scope', name: 'Strength', color: '#FF0000' }] }} availableTags={catalog([])} onPerform={vi.fn()} />);
        const chip = screen.getByText('Strength').closest('label');
        expect(chip).toHaveClass(styles.choice, styles.selected);
        expect(chip).toHaveStyle({ '--tag-color': '#FF0000' });
    });

    it('selects an existing logical tag for the whole circuit', async () => {
        const onPerform = vi.fn().mockResolvedValue(true);
        render(
            <CircuitRunTagControl
                run={{ id: 'run-1', tags: [] }}
                availableTags={catalog([{ id: 'tag-a', name: 'Competition', archived: false }])}
                onPerform={onPerform}
            />,
        );

        const control = screen.getByRole('group', { name: 'Circuit tags' });
        fireEvent.click(within(control).getByRole('button', { name: 'Add circuit tags' }));
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose circuit tags' })).getByText('Competition'));

        await waitFor(() => expect(onPerform).toHaveBeenCalledWith({
            action: 'updateRunTag',
            value: { name: 'Competition', color: null, assigned: true, definition_id: 'tag-a' },
            inlineError: true,
        }));
    });

    it('groups options by family and marks assigned catalog tags', async () => {
        const onPerform = vi.fn().mockResolvedValue(true);
        render(
            <CircuitRunTagControl
                run={{ tags: [{ id: 'scope', definition_id: 'easy', name: 'Easy' }] }}
                availableTags={catalog([
                    { id: 'outdoor', name: 'Outdoor', sort_order: 0 },
                    { id: 'hard', name: 'Hard', family_id: 'intensity', sort_order: 1 },
                    { id: 'easy', name: 'Easy', family_id: 'intensity', sort_order: 0 },
                ], [{ id: 'intensity', name: 'Intensity', single_select: true, sort_order: 0 }])}
                onPerform={onPerform}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Add circuit tags' }));
        const dialog = screen.getByRole('dialog');
        const intensity = within(dialog).getByRole('region', { name: 'Intensity' });
        expect(intensity).toHaveTextContent('Single select');
        const options = within(intensity).getAllByRole('checkbox');
        expect(options.map((option) => option.closest('label').textContent)).toEqual(['Easy', 'Hard']);
        expect(options[0]).toBeChecked();
        expect(within(within(dialog).getByRole('region', { name: 'Other tags' })).getByText('Outdoor')).toBeInTheDocument();
        fireEvent.click(options[1]);
        await waitFor(() => expect(onPerform).toHaveBeenCalledWith({ action: 'updateRunTag', value: { name: 'Hard', color: null, assigned: true, definition_id: 'hard' }, inlineError: true }));
    });

    it('adds the existing tag instead of creating a same-name copy', async () => {
        const onPerform = vi.fn().mockResolvedValue(true);
        render(<CircuitRunTagControl run={{ id: 'run-1', tags: [] }} availableTags={catalog([{ id: 'tag-a', name: 'Competition' }])} onPerform={onPerform} />);
        fireEvent.click(screen.getByRole('button', { name: 'Add circuit tags' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'New circuit tags name' }), { target: { value: '  competition ' } });
        const dialog = screen.getByRole('dialog', { name: 'Choose circuit tags' });
        expect(within(dialog).getByRole('status')).toHaveTextContent('“Competition” already exists');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(onPerform).toHaveBeenCalledWith({
            action: 'updateRunTag',
            value: { name: 'competition', color: '#64748B', assigned: true, definition_id: 'tag-a' },
            inlineError: true,
        }));
    });

    it('creates a logical tag for one round', async () => {
        const onPerform = vi.fn().mockResolvedValue(true);
        render(
            <CircuitRoundTagControl
                round={{ id: 'round-1', round_number: 1, tags: [] }}
                availableTags={catalog([])}
                onPerform={onPerform}
            />,
        );

        const control = screen.getByRole('group', { name: 'Round 1 tags' });
        fireEvent.click(within(control).getByRole('button', { name: 'Add round 1 tags' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'New round 1 tags name' }), {
            target: { value: 'Sprint' },
        });
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose round 1 tags' })).getByRole('button', { name: 'Create' }));

        await waitFor(() => expect(onPerform).toHaveBeenCalledWith({
            action: 'updateRoundTag',
            roundId: 'round-1',
            value: { name: 'Sprint', color: '#64748B', assigned: true },
            inlineError: true,
        }));
    });

    it('creates a logical tag with the chosen color', async () => {
        const onPerform = vi.fn().mockResolvedValue(true);
        render(
            <CircuitRunTagControl
                run={{ id: 'run-1', tags: [] }}
                availableTags={catalog([])}
                onPerform={onPerform}
            />,
        );

        const control = screen.getByRole('group', { name: 'Circuit tags' });
        fireEvent.click(within(control).getByRole('button', { name: 'Add circuit tags' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'New circuit tags name' }), {
            target: { value: 'Competition' },
        });
        fireEvent.change(screen.getByLabelText('New circuit tags color'), {
            target: { value: '#ff0000' },
        });
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose circuit tags' })).getByRole('button', { name: 'Create' }));

        await waitFor(() => expect(onPerform).toHaveBeenCalledWith({
            action: 'updateRunTag',
            value: { name: 'Competition', color: '#FF0000', assigned: true },
            inlineError: true,
        }));
    });

    it('keeps assigned round tags read-only when its circuit is not selected', () => {
        render(
            <CircuitRoundTagControl
                round={{ id: 'round-1', round_number: 1, tags: [{ id: 'tag-a', name: 'Sprint' }] }}
                availableTags={catalog([{ id: 'tag-a', name: 'Sprint', archived: false }])}
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
                availableTags={catalog(tags)}
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
