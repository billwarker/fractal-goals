import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/test-utils';
import VideoEmbed from '../VideoEmbed';
import { parseVideoUrl } from '../../../utils/videoEmbeds';

// VideoEmbed only needs the QueryClient (for the Instagram oEmbed hook); skip
// the heavier auth/timezone/theme providers.
const LEAN = { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false };
const render = (ui) => renderWithProviders(ui, LEAN);

describe('VideoEmbed', () => {
    it('renders nothing without a descriptor', () => {
        const { container } = render(<VideoEmbed descriptor={null} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('is a facade first, then mounts a sandboxed iframe on play', () => {
        const descriptor = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        const { container } = render(<VideoEmbed descriptor={descriptor} />);

        expect(container.querySelector('iframe')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /play youtube/i }));

        const iframe = container.querySelector('iframe');
        expect(iframe).toBeInTheDocument();
        expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
        expect(iframe).toHaveAttribute('loading', 'lazy');
    });

    it('always exposes an "open original" fallback link on the facade', () => {
        // The iframe onError → failure-card transition is exercised in the
        // browser verification (jsdom does not route React's iframe error
        // event). Here we assert the always-present fallback link that keeps
        // the evidence reachable even if the embed fails.
        const descriptor = parseVideoUrl('https://drive.google.com/file/d/ABC/view');
        render(<VideoEmbed descriptor={descriptor} />);
        expect(screen.getByRole('link', { name: /open original/i }))
            .toHaveAttribute('href', 'https://drive.google.com/file/d/ABC/view');
    });

    it('renders a native <video> for direct file descriptors', () => {
        const descriptor = parseVideoUrl('https://cdn.example.com/clip.mp4');
        const { container } = render(<VideoEmbed descriptor={descriptor} />);
        const video = container.querySelector('video');
        expect(video).toBeInTheDocument();
        expect(video).toHaveAttribute('preload', 'none');
        expect(video).toHaveAttribute('controls');
        expect(container.querySelector('iframe')).not.toBeInTheDocument();
    });

    it('uses the caption as the accessible label when provided', () => {
        const descriptor = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        render(<VideoEmbed descriptor={descriptor} caption="My deadlift PR" />);
        expect(screen.getByRole('button', { name: 'My deadlift PR' })).toBeInTheDocument();
    });
});
