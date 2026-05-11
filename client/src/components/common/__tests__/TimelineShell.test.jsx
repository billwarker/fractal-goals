import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TimelineShell from '../TimelineShell';

describe('TimelineShell', () => {
    it('renders mode controls, selector, body, and composer as reusable slots', () => {
        const onModeChange = vi.fn();

        render(
            <TimelineShell
                className="shell"
                modeToggleClassName="toggle"
                modeButtonClassName="button"
                modeButtonActiveClassName="active"
                bodyClassName="body"
                composerClassName="composer"
                modes={[
                    { value: 'activity', label: 'Activity' },
                    { value: 'session', label: 'Session' },
                ]}
                activeMode="session"
                onModeChange={onModeChange}
                selector={<div>Selector slot</div>}
                composer={<button type="button">Compose</button>}
            >
                <div>Timeline body</div>
            </TimelineShell>
        );

        expect(screen.getByText('Selector slot')).toBeInTheDocument();
        expect(screen.getByText('Timeline body')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Compose' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Session' }).className).toContain('active');

        fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
        expect(onModeChange).toHaveBeenCalledWith('activity');
    });
});
