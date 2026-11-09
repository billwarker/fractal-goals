import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ActivityPlanNote from '../ActivityPlanNote';

describe('ActivityPlanNote', () => {
    it('shows the plan\'s note, and nothing without one', () => {
        const { rerender, container } = render(<ActivityPlanNote planNote="Top set at RPE 8" />);
        expect(screen.getByText('From plan')).toBeInTheDocument();
        expect(screen.getByText('Top set at RPE 8')).toBeInTheDocument();
        rerender(<ActivityPlanNote />);
        expect(container).toBeEmptyDOMElement();
    });
});
