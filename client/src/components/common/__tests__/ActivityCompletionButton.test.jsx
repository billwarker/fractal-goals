import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ActivityCompletionButton from '../ActivityCompletionButton';

import badgeStyles from '../CompletionCheckBadge.module.css';
import completionStyles from '../CompletionButton.module.css';

describe('ActivityCompletionButton', () => {
    it('uses the canonical completion badge only for completed activity instances', () => {
        const { rerender } = render(<ActivityCompletionButton />);

        const pendingButton = screen.getByRole('button', { name: '✓ Complete' });
        expect(pendingButton).toHaveClass(completionStyles.control);
        expect(pendingButton.querySelector(`.${badgeStyles.badge}`)).not.toBeInTheDocument();

        rerender(<ActivityCompletionButton completed />);

        const completedButton = screen.getByRole('button', { name: 'Completed' });
        expect(completedButton).toHaveClass(completionStyles.control);
        expect(completedButton.querySelector(`.${badgeStyles.badge}.${badgeStyles.checked}`)).toBeInTheDocument();
        expect(completedButton).toHaveAccessibleName('Completed');
    });
});
