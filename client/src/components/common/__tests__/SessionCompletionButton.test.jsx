import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SessionCompletionButton from '../SessionCompletionButton';

import buttonStyles from '../../atoms/Button.module.css';
import badgeStyles from '../CompletionCheckBadge.module.css';
import completionStyles from '../CompletionButton.module.css';

describe('SessionCompletionButton', () => {
    it('renders an unfinished session as a filled success action with a checkmark', () => {
        const onClick = vi.fn();

        render(<SessionCompletionButton onClick={onClick} />);

        const button = screen.getByRole('button', { name: '✓ Complete' });
        expect(button).toHaveClass(buttonStyles.success);
        expect(button).toHaveClass(completionStyles.control);
        expect(button).toHaveAttribute('aria-pressed', 'false');
        expect(button).toHaveAttribute('title', 'Mark Session Complete');

        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('renders a finished session as a green outlined completed state', () => {
        render(<SessionCompletionButton completed />);

        const button = screen.getByRole('button', { name: 'Completed' });
        expect(button).toHaveClass(buttonStyles.secondary);
        expect(button).toHaveClass(completionStyles.control);
        expect(button).toHaveClass(completionStyles.completed);
        expect(button).toHaveAttribute('aria-pressed', 'true');
        expect(button).toHaveAttribute('title', 'Mark Session Incomplete');
        expect(button.querySelector(`.${badgeStyles.badge}.${badgeStyles.checked}`)).toBeInTheDocument();
        expect(button).toHaveAccessibleName('Completed');
    });

    it('preserves custom labels, titles, and layout classes', () => {
        render(
            <SessionCompletionButton
                completed
                doneLabel="Finished"
                title="Reopen session"
                className="layout-class"
            />,
        );

        const button = screen.getByRole('button', { name: 'Finished' });
        expect(button).toHaveClass('layout-class');
        expect(button).toHaveAttribute('title', 'Reopen session');
    });
});
