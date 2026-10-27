import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MediaAttachment from '../MediaAttachment';
import MarkdownNoteContent from '../MarkdownNoteContent';

const image = { id: 'asset', name: 'photo.jpg', mime_type: 'image/jpeg', provider: 'google_drive', available: true, alt_text: 'Practice posture' };

describe('MediaAttachment', () => {
    it('uses authenticated API URLs, lazy images and a useful description', () => {
        render(<MediaAttachment asset={image} rootId="root" />);
        const img = screen.getByRole('img', { name: 'Practice posture' });
        expect(img.getAttribute('src')).toContain('/root/media/asset/content');
        expect(img.getAttribute('src')).not.toContain('token');
        expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('offers retry after a media error', () => {
        render(<MediaAttachment asset={image} rootId="root" />);
        fireEvent.error(screen.getByRole('img'));
        expect(screen.getByRole('status')).toHaveTextContent('could not load');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('does not request disconnected media', () => {
        render(<MediaAttachment asset={{ ...image, available: false }} rootId="root" />);
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Storage is disconnected');
    });

    it('does not preload a private video', () => {
        const { container } = render(<MediaAttachment asset={{ ...image, mime_type: 'video/mp4' }} rootId="root" />);
        expect(container.querySelector('video')).toHaveAttribute('preload', 'none');
    });

    it('renders Markdown pictures responsively with a fallback', () => {
        render(<MarkdownNoteContent content="![Photo](https://example.test/picture.jpg)" />);
        const img = screen.getByRole('img', { name: 'Photo' });
        expect(img).toHaveAttribute('loading', 'lazy');
        fireEvent.error(img);
        expect(screen.getByRole('link', { name: 'Photo' })).toHaveAttribute('href', 'https://example.test/picture.jpg');
    });
});
