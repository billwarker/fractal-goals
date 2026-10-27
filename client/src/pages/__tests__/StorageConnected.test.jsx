import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import StorageConnected from '../StorageConnected';

const posted = [];
class FakeChannel {
    constructor(name) { this.name = name; }
    postMessage(message) { posted.push({ name: this.name, message }); }
    close() {}
}

const renderAt = (search) => render(<MemoryRouter initialEntries={[`/storage/connected${search}`]}><StorageConnected /></MemoryRouter>);

beforeEach(() => {
    posted.length = 0;
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    vi.spyOn(window, 'close').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('StorageConnected', () => {
    it('tells open tabs the result and closes the consent window', () => {
        renderAt('?provider=dropbox&result=connected');
        expect(posted).toEqual([{ name: 'fractal-storage', message: { type: 'storage-connection', provider: 'dropbox', result: 'connected' } }]);
        expect(window.close).toHaveBeenCalled();
        expect(screen.getByRole('heading')).toHaveTextContent('Dropbox connected');
        expect(screen.getByRole('link', { name: 'Open cloud storage settings' })).toHaveAttribute('href', '/?settings=storage');
    });

    it('explains a cancelled connection', () => {
        renderAt('?provider=google_drive&result=cancelled');
        expect(screen.getByRole('alert')).toHaveTextContent('Google Drive connection cancelled');
    });

    it('treats unknown results as failures without echoing them', () => {
        renderAt('?provider=dropbox&result=<script>');
        expect(posted[0].message.result).toBe('failed');
        expect(screen.getByRole('alert')).toHaveTextContent('Dropbox couldn’t be connected');
        expect(document.body.textContent).not.toContain('<script>');
    });
});
