import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AuthModal from '../AuthModal';

const {
    login,
    signup,
    forgotPassword,
    notify,
} = vi.hoisted(() => ({
    login: vi.fn(),
    signup: vi.fn(),
    forgotPassword: vi.fn(),
    notify: {
        success: vi.fn(),
    },
}));

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => ({
        login,
        signup,
        isAuthenticated: false,
    }),
}));

vi.mock('../../../utils/notify', () => ({
    default: notify,
}));

vi.mock('../../../utils/api', () => ({
    authApi: {
        forgotPassword: (...args) => forgotPassword(...args),
    },
}));

describe('AuthModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        login.mockResolvedValue({ token: 'token-a', user: { id: 'user-a' } });
        window.history.pushState({}, '', '/');
    });

    it('sends remember-me preference with login', async () => {
        const onClose = vi.fn();

        render(<AuthModal isOpen={true} onClose={onClose} />);

        fireEvent.change(screen.getByLabelText('Username or Email'), {
            target: { value: 'testuser' },
        });
        fireEvent.change(screen.getByLabelText('Password'), {
            target: { value: 'Password123' },
        });
        fireEvent.click(screen.getByLabelText('Remember me on this device'));
        fireEvent.click(screen.getByRole('button', { name: 'LOG IN' }));

        await waitFor(() => {
            expect(login).toHaveBeenCalledWith('testuser', 'Password123', { rememberMe: true });
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('requests a password reset from the login email field', async () => {
        forgotPassword.mockResolvedValue({ data: { message: 'sent' } });

        render(<AuthModal isOpen={true} onClose={vi.fn()} />);

        fireEvent.change(screen.getByLabelText('Username or Email'), {
            target: { value: 'test@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

        await waitFor(() => expect(forgotPassword).toHaveBeenCalledWith({ email: 'test@example.com' }));
        expect(notify.success).toHaveBeenCalled();
    });

    it('prefills invite key and email from invite links', async () => {
        window.history.pushState({}, '', '/?invite_key=fg_invite_abc123&email=invitee%40example.com');

        render(<AuthModal isOpen={true} onClose={vi.fn()} />);

        expect(screen.getByLabelText('Invite Key')).toHaveValue('fg_invite_abc123');
        expect(screen.getByLabelText('Email')).toHaveValue('invitee@example.com');
        expect(screen.getByRole('heading', { name: 'CREATE AN ACCOUNT' })).toBeInTheDocument();
    });
});
