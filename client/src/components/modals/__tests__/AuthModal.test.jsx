import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AuthModal from '../AuthModal';

const {
    login,
    signup,
    notify,
} = vi.hoisted(() => ({
    login: vi.fn(),
    signup: vi.fn(),
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

describe('AuthModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        login.mockResolvedValue({ token: 'token-a', user: { id: 'user-a' } });
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
});
