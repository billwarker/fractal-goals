import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MarkdownNoteContent from '../MarkdownNoteContent';

describe('MarkdownNoteContent', () => {
    it('hardens external markdown links', () => {
        render(<MarkdownNoteContent content="[Docs](https://example.com/docs)" />);

        const link = screen.getByRole('link', { name: 'Docs' });
        expect(link).toHaveAttribute('href', 'https://example.com/docs');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('does not render unsafe javascript links', () => {
        render(<MarkdownNoteContent content="[Bad](javascript:alert(1))" />);

        expect(screen.queryByRole('link', { name: 'Bad' })).not.toBeInTheDocument();
        expect(screen.getByText('Bad')).toBeInTheDocument();
    });
});
