import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setUser, updatePreferences, allowReminders, notifyError } = vi.hoisted(() => ({
    setUser: vi.fn(),
    updatePreferences: vi.fn(),
    allowReminders: vi.fn(),
    notifyError: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'me', preferences: { reminders: { program_day: false } } }, setUser }),
}));
vi.mock('../../../utils/api', () => ({ authApi: { updatePreferences } }));
vi.mock('../../../platform', () => ({ allowReminders }));
vi.mock('../../../utils/notify', () => ({ default: { error: notifyError } }));

import ReminderSettings from '../ReminderSettings';
import { remindersOn, setRemindersOn } from '../../../platform/reminders';

const renderSettings = () => render(
    <QueryClientProvider client={new QueryClient()}><ReminderSettings /></QueryClientProvider>,
);

describe('Settings → Reminders', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setRemindersOn(false);
    });

    it('asks macOS first, and stays off when declined', async () => {
        allowReminders.mockResolvedValue(false);
        renderSettings();
        fireEvent.click(screen.getByLabelText('Remind me on this Mac'));
        await waitFor(() => expect(notifyError).toHaveBeenCalled());
        expect(remindersOn()).toBe(false);
        expect(screen.queryByLabelText('Goal reviews')).toBeNull();
    });

    it('once on, saves each kind for the account', async () => {
        allowReminders.mockResolvedValue(true);
        updatePreferences.mockResolvedValue({ data: { id: 'me' } });
        renderSettings();
        fireEvent.click(screen.getByLabelText('Remind me on this Mac'));
        expect(await screen.findByLabelText('Program days')).not.toBeChecked();
        expect(screen.getByLabelText('Goal reviews')).toBeChecked();
        fireEvent.click(screen.getByLabelText('Goal reviews'));
        await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({
            preferences: { reminders: { goal_review: false, program_day: false, open_session: true } },
        }));
        expect(setUser).toHaveBeenCalledWith({ id: 'me' });
        expect(remindersOn()).toBe(true);
    });
});
