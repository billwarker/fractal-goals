import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import TimelineShell from '../TimelineShell';

describe('TimelineShell', () => {
    it('renders selector, body, and composer as reusable slots', () => {
        render(
            <TimelineShell
                className="shell"
                bodyClassName="body"
                composerClassName="composer"
                selector={<div>Selector slot</div>}
                composer={<button type="button">Compose</button>}
            >
                <div>Timeline body</div>
            </TimelineShell>
        );

        expect(screen.getByText('Selector slot')).toBeInTheDocument();
        expect(screen.getByText('Timeline body')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Compose' })).toBeInTheDocument();
    });
});
