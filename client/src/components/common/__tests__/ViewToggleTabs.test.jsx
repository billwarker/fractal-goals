import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ViewToggleTabs from '../ViewToggleTabs';

const ITEMS = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
];

function Tabs({ semantics = 'tabs', initial = 'a', onChange = () => {} }) {
    const [value, setValue] = useState(initial);
    return (
        <ViewToggleTabs
            items={ITEMS}
            value={value}
            onChange={(next) => { setValue(next); onChange(next); }}
            ariaLabel="Sections"
            semantics={semantics}
            idPrefix="demo"
        />
    );
}

describe('ViewToggleTabs', () => {
    it('is one tab stop: only the selected tab is in the Tab order', () => {
        render(<Tabs initial="b" />);

        expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('tabindex', '0');
        expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('tabindex', '-1');
        expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveAttribute('tabindex', '-1');
    });

    it('moves and selects with the arrow keys, wrapping, and jumps with Home and End', () => {
        const onChange = vi.fn();
        render(<Tabs onChange={onChange} />);
        const alpha = screen.getByRole('tab', { name: 'Alpha' });

        fireEvent.keyDown(alpha, { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Beta' })).toHaveFocus();
        fireEvent.keyDown(screen.getByRole('tab', { name: 'Beta' }), { key: 'End' });
        fireEvent.keyDown(screen.getByRole('tab', { name: 'Gamma' }), { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'ArrowLeft' });
        fireEvent.keyDown(screen.getByRole('tab', { name: 'Gamma' }), { key: 'Home' });

        expect(onChange.mock.calls.map(([value]) => value)).toEqual(['b', 'c', 'a', 'c', 'a']);
    });

    it('links each tab to its panel', () => {
        render(<Tabs />);

        const alpha = screen.getByRole('tab', { name: 'Alpha' });
        expect(alpha).toHaveAttribute('id', 'demo-tab-a');
        expect(alpha).toHaveAttribute('aria-controls', 'demo-panel-a');
    });

    it('leaves radio groups to the browser', () => {
        const onChange = vi.fn();
        render(<Tabs semantics="radio" onChange={onChange} />);

        const alpha = screen.getByRole('radio', { name: 'Alpha' });
        fireEvent.keyDown(alpha, { key: 'ArrowRight' });

        expect(onChange).not.toHaveBeenCalled();
        expect(alpha).not.toHaveAttribute('tabindex');
        expect(alpha).not.toHaveAttribute('id');
    });
});
