import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/test-utils';
import MarkdownNoteContent from '../MarkdownNoteContent';

// The markdown pipeline's only provider need is the QueryClient (Instagram
// oEmbed hook inside VideoEmbed); skip auth/timezone/theme.
const LEAN = { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false };
const render = (ui) => renderWithProviders(ui, LEAN);

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

    it('renders a bare YouTube URL as a poster facade (no iframe until played)', () => {
        const { container } = render(
            <MarkdownNoteContent content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
        );

        // Facade: play button present, iframe not yet mounted.
        expect(container.querySelector('iframe')).not.toBeInTheDocument();
        const playBtn = screen.getByRole('button', { name: /play youtube/i });
        expect(playBtn).toBeInTheDocument();

        // Clicking mounts the sandboxed iframe.
        fireEvent.click(playBtn);
        const iframe = container.querySelector('iframe');
        expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1');
        expect(iframe).toHaveAttribute('sandbox');
    });

    it('always shows an "open original" fallback link under an embed', () => {
        render(<MarkdownNoteContent content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);
        const link = screen.getByRole('link', { name: /open original/i });
        expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('renders a bare Instagram reel URL as an embed facade', () => {
        render(<MarkdownNoteContent content="https://www.instagram.com/reel/ABC123xyz/" />);
        expect(screen.getByRole('button', { name: /play instagram/i })).toBeInTheDocument();
    });

    it('renders a bare Google Drive file URL as an embed facade', () => {
        render(<MarkdownNoteContent content="https://drive.google.com/file/d/1AbC_dEfG-hIjK/view?usp=sharing" />);
        expect(screen.getByRole('button', { name: /play google drive/i })).toBeInTheDocument();
    });

    it('renders a direct .mp4 link as a native <video>, not an iframe', () => {
        const { container } = render(
            <MarkdownNoteContent content="https://cdn.example.com/evidence/clip.mp4" />
        );
        const video = container.querySelector('video');
        expect(video).toBeInTheDocument();
        expect(video).toHaveAttribute('src', 'https://cdn.example.com/evidence/clip.mp4');
        expect(container.querySelector('iframe')).not.toBeInTheDocument();
    });

    it('leaves a Google Drive folder URL as an ordinary link', () => {
        const { container } = render(
            <MarkdownNoteContent content="https://drive.google.com/drive/folders/1AbC_dEfG-hIjK" />
        );

        expect(container.querySelector('iframe')).not.toBeInTheDocument();
        expect(container.querySelector('video')).not.toBeInTheDocument();
        expect(screen.getByRole('link')).toBeInTheDocument();
    });

    it('keeps a video URL inside a sentence as a plain link, not an embed', () => {
        const { container } = render(
            <MarkdownNoteContent content="watch this https://www.youtube.com/watch?v=dQw4w9WgXcQ now" />
        );

        expect(container.querySelector('iframe')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /play/i })).not.toBeInTheDocument();
        expect(screen.getByRole('link')).toBeInTheDocument();
    });

    it('never renders an iframe or video for a non-allowlisted host', () => {
        const { container } = render(
            <MarkdownNoteContent content="https://evil.com/embed/dQw4w9WgXcQ" />
        );

        expect(container.querySelector('iframe')).not.toBeInTheDocument();
        expect(container.querySelector('video')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'https://evil.com/embed/dQw4w9WgXcQ' })).toBeInTheDocument();
    });
});
