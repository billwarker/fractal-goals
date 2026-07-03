import React from 'react';
import { render, screen } from '@testing-library/react';

import Badge from '../Badge';
import CloseButton from '../CloseButton';
import IconButton from '../IconButton';
import Radio from '../Radio';
import RemoveButton from '../RemoveButton';
import Spinner from '../Spinner';
import Tooltip from '../Tooltip';
import LoadingState from '../../common/LoadingState';

describe('standardization atoms', () => {
    it('renders accessible icon-only controls', () => {
        render(
            <>
                <IconButton aria-label="Open menu">⋮</IconButton>
                <CloseButton aria-label="Close dialog" />
                <RemoveButton aria-label="Remove activity" />
            </>
        );

        expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove activity' })).toBeInTheDocument();
    });

    it('renders badges with variant and sizing classes', () => {
        render(<Badge variant="success" size="sm" pill={false}>Ready</Badge>);

        const badge = screen.getByText('Ready');
        expect(badge.className).toContain('success');
        expect(badge.className).toContain('sm');
        expect(badge.className).not.toContain('pill');
    });

    it('uses the shared spinner in loading states', () => {
        render(
            <>
                <Spinner label="Fetching" />
                <LoadingState label="Loading session data..." />
            </>
        );

        expect(screen.getByRole('status', { name: 'Fetching' })).toBeInTheDocument();
        expect(screen.getByRole('status', { name: 'Loading session data...' })).toBeInTheDocument();
        expect(screen.getByText('Loading session data...')).toBeInTheDocument();
    });

    it('renders a labeled radio control', () => {
        render(<Radio name="mode" label="Tree layout" value="tree" />);

        expect(screen.getByRole('radio', { name: 'Tree layout' })).toBeInTheDocument();
    });

    it('adds tooltip text and connects it to the trigger', () => {
        render(
            <Tooltip label="Save changes">
                <IconButton aria-label="Save">S</IconButton>
            </Tooltip>
        );

        const trigger = screen.getByRole('button', { name: 'Save' });
        const tooltip = screen.getByRole('tooltip');

        expect(tooltip).toHaveTextContent('Save changes');
        expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
    });
});
