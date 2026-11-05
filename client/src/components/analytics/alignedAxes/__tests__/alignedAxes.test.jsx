import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AlignedAxesProvider, AlignedAxisWindow, useAlignedAxis } from '../AlignedAxesContext';
import { createEdgeGroup } from '../edgeGroup';
import { panelGroups } from '../panelGroups';
import { mergeSlots, valuesOnSlots } from '../slots';

const panel = (id, x, y, w, h) => ({ id, x, y, w, h });

describe('panelGroups', () => {
    it('groups stacked panels sharing a left edge and width', () => {
        expect(panelGroups([panel('b', 0, 24, 96, 24), panel('a', 0, 0, 96, 24)], 'stacked')).toEqual([['a', 'b']]);
    });

    it('groups side-by-side panels sharing a top edge and height', () => {
        expect(panelGroups([panel('a', 0, 0, 48, 24), panel('b', 48, 0, 48, 24)], 'sideBySide')).toEqual([['a', 'b']]);
        expect(panelGroups([panel('a', 0, 0, 48, 24), panel('b', 48, 0, 48, 24)], 'stacked')).toEqual([]);
    });

    it('leaves panels of different widths apart', () => {
        expect(panelGroups([panel('a', 0, 0, 96, 24), panel('b', 0, 24, 48, 24)], 'stacked')).toEqual([]);
    });

    it('breaks a line where another panel sits between', () => {
        const panels = [panel('a', 0, 0, 48, 10), panel('middle', 24, 10, 48, 10), panel('b', 0, 20, 48, 10)];
        expect(panelGroups(panels, 'stacked')).toEqual([]);
    });

    it('chains three in a line', () => {
        const panels = [panel('a', 0, 0, 96, 10), panel('b', 0, 10, 96, 10), panel('c', 0, 20, 96, 10)];
        expect(panelGroups(panels, 'stacked')).toEqual([['a', 'b', 'c']]);
    });
});

describe('slots', () => {
    const point = (key, at) => ({ key, at, label: `Day ${at}` });

    it('takes each point once, in order, keeping repeated dates apart', () => {
        const merged = mergeSlots([[point('a', 1), point('c', 2)], [point('b', 1), point('c', 2)]]);
        expect(merged.map((slot) => slot.key)).toEqual(['a', 'b', 'c']);
    });

    it('lays a chart out over the slots with gaps', () => {
        expect(valuesOnSlots(['a', 'c'], [10, 30], [point('a', 1), point('b', 1), point('c', 2)])).toEqual([10, null, 30]);
    });
});

describe('createEdgeGroup', () => {
    const chart = () => ({ canvas: {}, update: vi.fn() });

    it('gives every member the space they all share', () => {
        const edges = createEdgeGroup();
        const [first, second] = [chart(), chart()];
        expect(edges.report(first, { left: 60, right: 900 })).toEqual({ left: 60, right: 900 });
        expect(edges.report(second, { left: 40, right: 860 })).toEqual({ left: 60, right: 860 });
        expect(edges.report(first, { left: 60, right: 900 })).toEqual({ left: 60, right: 860 });
    });

    it('stops asking others to lay out again if they never settle', () => {
        const frames = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => { run(); return 0; });
        const edges = createEdgeGroup();
        const [first, second] = [chart(), chart()];
        edges.report(second, { left: 0, right: 900 });
        for (let width = 0; width < 30; width += 1) edges.report(first, { left: 0, right: 500 - width });
        expect(second.update.mock.calls.length).toBeLessThanOrEqual(8);
        frames.mockRestore();
    });
});

describe('useAlignedAxis', () => {
    const points = (keys) => keys.map((key, at) => ({ key, at, label: key }));
    const Probe = ({ name, identity, keys }) => {
        const slots = useAlignedAxis({ chartRef: { current: null }, identity, points: points(keys) });
        return <div data-testid={name}>{slots ? slots.map((slot) => slot.key).join(',') : 'own'}</div>;
    };
    const dashboard = (first, second, panels = [panel('a', 0, 0, 96, 24), panel('b', 0, 24, 96, 24)], enabled = true) => (
        <AlignedAxesProvider layout={{ type: 'grid', panels }} enabled={enabled}>
            <AlignedAxisWindow windowId="a"><Probe name="a" {...first} /></AlignedAxisWindow>
            <AlignedAxisWindow windowId="b"><Probe name="b" {...second} /></AlignedAxisWindow>
        </AlignedAxesProvider>
    );

    it('stays on its own axis outside a dashboard', () => {
        render(<Probe name="alone" identity="sessions:x" keys={['a']} />);
        expect(screen.getByTestId('alone')).toHaveTextContent('own');
    });

    it('shares slots between stacked panels with the same axis', async () => {
        await act(async () => {
            render(dashboard({ identity: 'sessions:x', keys: ['s1', 's2'] }, { identity: 'sessions:x', keys: ['s2', 's3'] }));
        });
        expect(screen.getByTestId('a').textContent.split(',').sort()).toEqual(['s1', 's2', 's3']);
        expect(screen.getByTestId('b').textContent).toBe(screen.getByTestId('a').textContent);
    });

    it('keeps different axes, unequal panels and phones apart', async () => {
        const cases = [
            [{ identity: 'sessions:x', keys: ['s1'] }, { identity: 'sessions:y', keys: ['s2'] }],
            [{ identity: 'sessions:x', keys: ['s1'] }, { identity: 'sessions:x', keys: ['s2'] }, [panel('a', 0, 0, 96, 24), panel('b', 0, 24, 48, 24)]],
            [{ identity: 'sessions:x', keys: ['s1'] }, { identity: 'sessions:x', keys: ['s2'] }, undefined, false],
        ];
        for (const args of cases) {
            let view;
            await act(async () => { view = render(dashboard(...args)); });
            expect(screen.getByTestId('a')).toHaveTextContent('own');
            expect(screen.getByTestId('b')).toHaveTextContent('own');
            view.unmount();
        }
    });
});
