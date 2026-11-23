import React from 'react';
import { render } from '@testing-library/react';

import StorageProviderIcon from '../StorageProviderIcon';

describe('StorageProviderIcon', () => {
    it('shows the official file for each provider, hidden from assistive tech', () => {
        const { container } = render(
            <>
                <StorageProviderIcon provider="google_drive" size={28} />
                <StorageProviderIcon provider="dropbox" size={28} />
            </>,
        );
        const [drive, dropbox] = container.querySelectorAll('img');
        expect(drive.getAttribute('src')).toMatch(/google-drive/);
        // Small enough that Vite inlines it as a data URI; the file's own blue identifies it.
        expect(decodeURIComponent(dropbox.getAttribute('src'))).toMatch(/dropbox|#0061FE/i);
        expect(drive).toHaveAttribute('alt', '');
        expect(drive.closest('span')).toHaveAttribute('aria-hidden', 'true');
        // Dropbox's file has more built-in margin, so it is drawn larger in the same slot.
        expect(Number(dropbox.getAttribute('width'))).toBeGreaterThan(Number(drive.getAttribute('width')));
    });

    it('draws nothing for an unknown provider', () => {
        const { container } = render(<StorageProviderIcon provider="box" />);
        expect(container).toBeEmptyDOMElement();
    });
});
