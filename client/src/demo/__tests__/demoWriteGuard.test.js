// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE, axios } from '../../utils/api/core';
import notify from '../../utils/notify';
import { DemoReadOnlyError, isQuietAfterBlockedWrite, setDemoMode, shouldBlockDemoRequest } from '../demoMode';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(() => 'toast'), success: vi.fn() } }));

describe('the demo write guard', () => {
    let adapter;
    let previousAdapter;

    beforeEach(() => {
        previousAdapter = axios.defaults.adapter;
        adapter = vi.fn(async (config) => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config }));
        axios.defaults.adapter = adapter;
        globalThis.window = globalThis.window || { dispatchEvent: vi.fn(), location: { search: '' } };
        globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
        setDemoMode(true);
    });

    afterEach(() => {
        setDemoMode(false);
        axios.defaults.adapter = previousAdapter;
    });

    it('refuses writes before they reach the network', async () => {
        for (const method of ['post', 'put', 'patch', 'delete']) {
            await expect(axios({ method, url: `${API_BASE}/root/goals` })).rejects.toBeInstanceOf(DemoReadOnlyError);
        }
        expect(adapter).not.toHaveBeenCalled();
    });

    it('lets reads and public calls through', async () => {
        await axios.get(`${API_BASE}/root/goals`);
        await axios.post(`${API_BASE}/public/beta-signups`, { email: 'a@b.co' });
        expect(adapter).toHaveBeenCalledTimes(2);
    });

    it('mutes the caller’s failure toast right after a blocked write', async () => {
        await expect(axios.post(`${API_BASE}/root/goals`, {})).rejects.toBeInstanceOf(DemoReadOnlyError);
        expect(isQuietAfterBlockedWrite()).toBe(true);
        expect(notify.error('Failed to create goal')).toBeUndefined();
        expect(isQuietAfterBlockedWrite(Date.now() + 5000)).toBe(false);
    });

    it('does nothing outside the demo', () => {
        setDemoMode(false);
        expect(shouldBlockDemoRequest({ method: 'post', url: '/api/x' })).toBe(false);
    });
});
