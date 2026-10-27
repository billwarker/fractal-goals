import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chooseGoogleDriveFile } from '../googleDrivePicker';

let callback;
let visible;
let dispose;
beforeEach(() => {
    vi.useFakeTimers();
    visible = vi.fn(); dispose = vi.fn();
    class View {
        setMimeTypes() { return this; }
        setIncludeFolders() { return this; }
        setSelectFolderEnabled() { return this; }
    }
    class Builder {
        setAppId() { return this; }
        setDeveloperKey() { return this; }
        setOAuthToken() { return this; }
        setOrigin() { return this; }
        addView() { return this; }
        setCallback(value) { callback = value; return this; }
        build() { return { setVisible: visible, dispose }; }
    }
    window.google = { picker: { DocsView: View, PickerBuilder: Builder, Action: { PICKED: 'picked', CANCEL: 'cancel' } } };
});
afterEach(() => { delete window.google; vi.useRealTimers(); });

describe('Google Picker lifecycle', () => {
    it('returns selected file metadata and disposes the dialog', async () => {
        const result = chooseGoogleDriveFile({ access_token: 'memory-only' });
        await Promise.resolve();
        callback({ action: 'picked', docs: [{ id: 'file', resourceKey: 'key' }] });
        await expect(result).resolves.toEqual({ id: 'file', resourceKey: 'key' });
        expect(visible).toHaveBeenLastCalledWith(false);
        expect(dispose).toHaveBeenCalledOnce();
    });
    it('cancels without attaching a file', async () => {
        const result = chooseGoogleDriveFile({});
        await Promise.resolve();
        callback({ action: 'cancel' });
        await expect(result).resolves.toBeNull();
    });
    it('closes the provider overlay when its owner unmounts', async () => {
        const controller = new AbortController();
        const result = chooseGoogleDriveFile({}, controller.signal);
        await Promise.resolve();
        controller.abort();
        await expect(result).resolves.toBeNull();
        expect(dispose).toHaveBeenCalledOnce();
    });
    it('cleans up when the provider SDK fails during construction', async () => {
        window.google.picker.PickerBuilder = class { constructor() { throw new Error('SDK blocked'); } };
        await expect(chooseGoogleDriveFile({})).rejects.toThrow('SDK blocked');
        expect(vi.getTimerCount()).toBe(0);
    });
    it('does not leave a blocked provider dialog open forever', async () => {
        const result = chooseGoogleDriveFile({}).catch((error) => error);
        await vi.advanceTimersByTimeAsync(120001);
        expect((await result).message).toContain('did not finish');
        expect(dispose).toHaveBeenCalledOnce();
    });
});
