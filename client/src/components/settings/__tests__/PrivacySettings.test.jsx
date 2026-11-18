import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PrivacySettings from '../PrivacySettings';

const { auth, updatePreferences } = vi.hoisted(() => ({
    auth: { user: null, setUser: vi.fn() },
    updatePreferences: vi.fn(),
}));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../utils/api', () => ({ authApi: { updatePreferences } }));
vi.mock('../../../utils/notify', () => ({ default: { error: vi.fn() } }));

const toggle = () => screen.getByRole('switch', { name: 'Share usage analytics' });

describe('PrivacySettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
        auth.user = { id: 'u1', preferences: {} };
    });

    it('is on unless the account turned it off', () => {
        render(<PrivacySettings />);
        expect(toggle()).toHaveAttribute('aria-checked', 'true');
    });

    it('saves the choice to the account and adopts the saved user', async () => {
        const saved = { id: 'u1', preferences: { usage_analytics: false } };
        updatePreferences.mockResolvedValue({ data: saved });
        render(<PrivacySettings />);

        fireEvent.click(toggle());

        expect(updatePreferences).toHaveBeenCalledWith({ preferences: { usage_analytics: false } });
        await waitFor(() => expect(auth.setUser).toHaveBeenCalledWith(saved));
    });

    it('shows off and explains why while the browser sends a privacy signal', () => {
        vi.stubGlobal('navigator', { ...navigator, globalPrivacyControl: true });
        render(<PrivacySettings />);

        expect(toggle()).toHaveAttribute('aria-checked', 'false');
        expect(toggle()).toBeDisabled();
        expect(screen.getByText(/Your browser asks sites not to track you/)).toBeInTheDocument();
    });
});
