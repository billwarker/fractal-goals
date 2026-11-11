import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ReviewNoteBody from '../ReviewNoteBody';

describe('ReviewNoteBody', () => {
    it('shows the status and only the answered questions', () => {
        render(<ReviewNoteBody review={{ schema: 1, status: 'off_track', went_well: '', change: 'Sleep more', next_focus: ' ' }} />);
        expect(screen.getByText('Off track')).toBeInTheDocument();
        expect(screen.getByText('What to change')).toBeInTheDocument();
        expect(screen.getByText('Sleep more')).toBeInTheDocument();
        expect(screen.queryByText('What went well')).not.toBeInTheDocument();
        expect(screen.queryByText('Focus until the next review')).not.toBeInTheDocument();
    });
});
