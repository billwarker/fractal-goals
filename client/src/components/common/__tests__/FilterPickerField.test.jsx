import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import FilterPickerField from '../FilterPickerField';

const openDetails = (title) => fireEvent.focus(screen.getByRole('button', { name: `View ${title} filter selections` }));

describe('FilterPickerField', () => {
    it('shows no filter mark until something is selected', () => {
        render(<FilterPickerField title="Activities" chooseLabel="Choose Activities" count={0} onChoose={vi.fn()} />);
        expect(screen.getByRole('heading', { name: 'Activities' })).toBeInTheDocument();
        expect(screen.getByText('0 selected')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Choose Activities' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'View activities filter selections' })).not.toBeInTheDocument();
    });

    it('keeps a long selection in the tooltip, not the sidebar', () => {
        const onChoose = vi.fn();
        const names = Array.from({ length: 48 }, (_, index) => `Lick ${index + 1}`);
        render(<FilterPickerField title="Activities" chooseLabel="Choose Activities" count={48} selectedNames={names}
            onChoose={onChoose} />);
        expect(screen.getByText('48 selected')).toBeInTheDocument();
        expect(screen.queryByText(/Lick 1,/)).not.toBeInTheDocument();
        openDetails('activities');
        expect(screen.getByRole('tooltip')).toHaveTextContent(`48 selected: ${names.join(', ')}`);
        fireEvent.click(screen.getByRole('button', { name: 'Choose Activities (48)' }));
        expect(onChoose).toHaveBeenCalled();
    });
});
