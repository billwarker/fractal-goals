import React from 'react';
import { render, screen } from '@testing-library/react';

import GoalDueChip from '../GoalDueChip';

describe('GoalDueChip', () => {
    it('shows the relative label with a full description and tone', () => {
        render(<GoalDueChip deadline="2026-10-22" today="2026-10-19" />);
        const label = screen.getByText('In 3d');
        expect(label).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByText('Due Oct 22, 2026 (in 3 days)')).toBeInTheDocument();
        expect(label.parentElement).toHaveAttribute('data-due-tone', 'soon');
        expect(label.parentElement).toHaveAttribute('title', 'Due Oct 22, 2026 (in 3 days)');
    });

    it('marks overdue goals', () => {
        render(<GoalDueChip deadline="2026-10-10" today="2026-10-19" />);
        expect(screen.getByText('9d overdue').parentElement).toHaveAttribute('data-due-tone', 'overdue');
    });

    it('renders nothing without a due date', () => {
        const { container } = render(<GoalDueChip deadline={null} today="2026-10-19" />);
        expect(container).toBeEmptyDOMElement();
    });
});
