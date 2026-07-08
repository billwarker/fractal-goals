import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ForcePasswordChangeModal from '../ForcePasswordChangeModal';

const {
    logout,
    setUser,
    updatePassword,
    getMe,
    notify,
} = vi.hoisted(() => ({
    logout: vi.fn(),
    setUser: vi.fn(),
    updatePassword: vi.fn(),
    getMe: vi.fn(),
    notify: {
        success: vi.fn(),
    },
}));

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => ({
        logout,
        setUser,
    }),
}));

vi.mock('../../../utils/notify', () => ({
    default: notify,
}));

vi.mock('../../../utils/api', () => ({
    authApi: {
        updatePassword: (...args) => updatePassword(...args),
        getMe: (...args) => getMe(...args),
    },
}));

function fillForm({ current = 'TempPass1', next = 'Newpassword456', confirm = 'Newpassword456' } = {}) {
    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: current } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: next } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: confirm } });
}

describe('ForcePasswordChangeModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        updatePassword.mockResolvedValue({ data: { message: 'ok' } });
        getMe.mockResolvedValue({ data: { id: 'user-a', must_change_password: false } });
    });

    it('renders without a close affordance', () => {
        render(<ForcePasswordChangeModal />);

        expect(screen.getByText('PASSWORD CHANGE REQUIRED')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    });

    it('submits the change and refreshes the current user', async () => {
        render(<ForcePasswordChangeModal />);

        fillForm();
        fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

        await waitFor(() => {
            expect(updatePassword).toHaveBeenCalledWith({
                current_password: 'TempPass1',
                new_password: 'Newpassword456',
            });
        });
        await waitFor(() => {
            expect(setUser).toHaveBeenCalledWith({ id: 'user-a', must_change_password: false });
        });
        expect(notify.success).toHaveBeenCalled();
    });

    it('blocks submission when the confirmation does not match', async () => {
        render(<ForcePasswordChangeModal />);

        fillForm({ confirm: 'Different456' });
        fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

        await waitFor(() => {
            expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
        });
        expect(updatePassword).not.toHaveBeenCalled();
    });

    it('surfaces backend errors without clearing the form', async () => {
        updatePassword.mockRejectedValue({
            response: { status: 401, data: { error: 'Invalid current password' } },
        });

        render(<ForcePasswordChangeModal />);

        fillForm();
        fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

        await waitFor(() => {
            expect(screen.getByText('Invalid current password')).toBeInTheDocument();
        });
        expect(setUser).not.toHaveBeenCalled();
    });

    it('offers a logout escape hatch', () => {
        render(<ForcePasswordChangeModal />);

        fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));

        expect(logout).toHaveBeenCalled();
    });
});
