import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
        expect(container.querySelector('video')).toHaveAttribute('poster', expect.stringMatching(/\/root\/media\/.+\/thumbnail$/));
    });

    describe('audio', () => {
        const song = { ...image, name: 'Verse idea.m4a', mime_type: 'audio/mp4', alt_text: '' };
        const playable = (answer) => vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(answer);
        afterEach(() => vi.restoreAllMocks());

        it('plays in an audio player that loads nothing until played and never asks for a poster', () => {
            playable('maybe');
            const { container } = render(<MediaAttachment asset={song} rootId="root" />);
            const audio = container.querySelector('audio');
            expect(audio).toHaveAttribute('controls');
            expect(audio).toHaveAttribute('preload', 'none');
            expect(audio).toHaveAttribute('aria-label', 'Verse idea.m4a');
            expect(audio.getAttribute('src')).toContain('/root/media/asset/content');
            expect(container.querySelector('[poster]')).toBeNull();
            expect(container.innerHTML).not.toContain('/thumbnail');
        });

        it('points to the provider when this browser cannot play the format', () => {
            playable('');
            const { container } = render(<MediaAttachment asset={{ ...song, name: 'Take 3.ogg', mime_type: 'audio/ogg' }} rootId="root" />);
            expect(container.querySelector('audio')).toBeNull();
            expect(screen.getByRole('status')).toHaveTextContent('This browser can’t play OGG audio. Open it in Google Drive');
            expect(screen.getByRole('link', { name: /Take 3\.ogg · Google Drive/ })).toBeInTheDocument();
        });

        it('offers retry when playback fails', () => {
            playable('probably');
            const { container } = render(<MediaAttachment asset={song} rootId="root" />);
            fireEvent.error(container.querySelector('audio'));
            fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
            expect(container.querySelector('audio')).toBeInTheDocument();
        });
    });

    it('renders Markdown pictures responsively with a fallback', () => {
        render(<MarkdownNoteContent content="![Photo](https://example.test/picture.jpg)" />);
        const img = screen.getByRole('img', { name: 'Photo' });
        expect(img).toHaveAttribute('loading', 'lazy');
        fireEvent.error(img);
        expect(screen.getByRole('link', { name: 'Photo' })).toHaveAttribute('href', 'https://example.test/picture.jpg');
    });
});

describe('MediaAttachment source link', () => {
    it('links the file name and location to the original in a new tab', () => {
        render(<MediaAttachment rootId="root 1" asset={{ id: 'asset/1', name: 'Run.mp4', mime_type: 'video/mp4', provider: 'google_drive', available: true }} />);
        const link = screen.getByRole('link', { name: /Run\.mp4 · Google Drive/ });
        expect(link).toHaveAttribute('href', expect.stringMatching(/\/root%201\/media\/asset%2F1\/open$/));
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(link).toHaveAttribute('title', 'Open in Google Drive');
    });

    it('keeps a plain caption without a fractal', () => {
        render(<MediaAttachment asset={{ id: 'a', name: 'pic.png', mime_type: 'image/png', provider: 'dropbox', available: false }} />);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByText('pic.png · Dropbox')).toBeInTheDocument();
    });
});
