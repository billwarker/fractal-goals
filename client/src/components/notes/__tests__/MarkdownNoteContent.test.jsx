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

    it('renders a bare YouTube URL on its own line as an inline video embed', () => {
        const { container } = render(
            <MarkdownNoteContent content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
        );

        const iframe = container.querySelector('iframe');
        expect(iframe).toBeInTheDocument();
        expect(iframe).toHaveAttribute(
            'src',
            'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
        );
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders a bare Instagram reel URL as an embed', () => {
        const { container } = render(
            <MarkdownNoteContent content="https://www.instagram.com/reel/ABC123xyz/" />
        );

        const iframe = container.querySelector('iframe');
        expect(iframe).toHaveAttribute(
            'src',
            'https://www.instagram.com/reel/ABC123xyz/embed'
        );
    });

    it('renders a bare Google Drive file URL as an embed', () => {
        const { container } = render(
            <MarkdownNoteContent content="https://drive.google.com/file/d/1AbC_dEfG-hIjK/view?usp=sharing" />
        );

        const iframe = container.querySelector('iframe');
        expect(iframe).toHaveAttribute(
            'src',
            'https://drive.google.com/file/d/1AbC_dEfG-hIjK/preview'
        );
    });

    it('leaves a Google Drive folder URL as an ordinary link', () => {
        const { container } = render(
            <MarkdownNoteContent content="https://drive.google.com/drive/folders/1AbC_dEfG-hIjK" />
        );

        expect(container.querySelector('iframe')).not.toBeInTheDocument();
        expect(screen.getByRole('link')).toBeInTheDocument();
    });

    it('keeps a video URL inside a sentence as a plain link, not an embed', () => {
        const { container } = render(
            <MarkdownNoteContent content="watch this https://www.youtube.com/watch?v=dQw4w9WgXcQ now" />
        );

        expect(container.querySelector('iframe')).not.toBeInTheDocument();
        expect(screen.getByRole('link')).toBeInTheDocument();
    });

    it('leaves a non-video URL as an ordinary link', () => {
        const { container } = render(
            <MarkdownNoteContent content="https://example.com/docs" />
        );

        expect(container.querySelector('iframe')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'https://example.com/docs' })).toBeInTheDocument();
    });
});
