import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ResetPassword from '../ResetPassword';

const { resetPassword, notify } = vi.hoisted(() => ({
    resetPassword: vi.fn(),
    notify: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/api', () => ({
    authApi: {
        resetPassword: (...args) => resetPassword(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
}));

describe('ResetPassword', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetPassword.mockResolvedValue({ data: { message: 'ok' } });
    });

    it('submits a valid reset token and new password', async () => {
        render(
            <MemoryRouter initialEntries={['/reset-password?token=reset-token-1']}>
                <ResetPassword />
            </MemoryRouter>
        );

        fireEvent.change(screen.getByLabelText('New password'), {
            target: { value: 'Newpassword456' },
        });
        fireEvent.change(screen.getByLabelText('Confirm password'), {
            target: { value: 'Newpassword456' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

        await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({
            token: 'reset-token-1',
            new_password: 'Newpassword456',
        }));
        expect(notify.success).toHaveBeenCalled();
    });

    it('validates mismatched passwords before submitting', async () => {
        render(
            <MemoryRouter initialEntries={['/reset-password?token=reset-token-1']}>
                <ResetPassword />
            </MemoryRouter>
        );

        fireEvent.change(screen.getByLabelText('New password'), {
            target: { value: 'Newpassword456' },
        });
        fireEvent.change(screen.getByLabelText('Confirm password'), {
            target: { value: 'Different789' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

        expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
        expect(resetPassword).not.toHaveBeenCalled();
    });
});
