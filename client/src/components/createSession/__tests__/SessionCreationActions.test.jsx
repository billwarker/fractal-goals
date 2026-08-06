import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import CreateSessionActions from '../CreateSessionActions';

describe('session creation footer actions', () => {
    it('renders the normal create action in compact footer mode', () => {
        const onCreateSession = vi.fn();
        render(
            <CreateSessionActions
                selectedTemplate={{ id: 'template-1', name: 'Strength Day', template_data: {} }}
                creating={false}
                onCreateSession={onCreateSession}
                footerMode
            />
        );

        expect(screen.getByRole('heading', { name: 'Create Session' })).toBeInTheDocument();
        expect(screen.queryByText('2')).not.toBeInTheDocument();
        expect(screen.getByText('Strength Day')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));
        expect(onCreateSession).toHaveBeenCalledTimes(1);
    });

    it('uses compact header actions without repeating the page heading', () => {
        render(
            <CreateSessionActions
                selectedTemplate={{ id: 'template-1', name: 'Strength Day', template_data: {} }}
                creating={false}
                onCreateSession={vi.fn()}
                headerMode
            />
        );

        expect(screen.queryByRole('heading', { name: 'Create Session' })).not.toBeInTheDocument();
        expect(screen.getByText('Strength Day')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create Session' })).toBeInTheDocument();
    });
});
