import React from 'react';
import { render, screen } from '@testing-library/react';

import GoalDueText from '../GoalDueText';

describe('GoalDueText', () => {
    it('reads as inline relative text with a full description for assistive tech', () => {
        render(<GoalDueText deadline="2026-12-31" today="2026-10-19" />);

        const text = screen.getByTitle('Due Dec 31, 2026 (in 73 days)');
        expect(text).toHaveTextContent('Due: 2.4mo');
        expect(text).toHaveAttribute('data-due-tone', 'normal');
    });

    it('turns amber within a week and red once overdue', () => {
        const { rerender } = render(<GoalDueText deadline="2026-10-22" today="2026-10-19" />);
        expect(screen.getByText('Due: 3d').parentElement).toHaveAttribute('data-due-tone', 'soon');

        rerender(<GoalDueText deadline="2026-10-10" today="2026-10-19" />);
        expect(screen.getByText('Due: -9d').parentElement).toHaveAttribute('data-due-tone', 'overdue');
    });

    it('renders nothing without a due date, or the placeholder when given one', () => {
        const { container, rerender } = render(<GoalDueText deadline={null} today="2026-10-19" />);
        expect(container).toBeEmptyDOMElement();

        rerender(<GoalDueText deadline={null} today="2026-10-19" emptyLabel="No deadline" />);
        expect(screen.getByText('No deadline')).toHaveAttribute('data-due-empty', 'true');
    });
});
