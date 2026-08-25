import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import LegalAcceptanceModal from '../LegalAcceptanceModal';

const { acceptLegalDocuments, logout, setUser, notify } = vi.hoisted(() => ({
    acceptLegalDocuments: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
    notify: { success: vi.fn() },
}));

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => ({ logout, setUser }),
}));

vi.mock('../../../utils/api', () => ({
    authApi: { acceptLegalDocuments: (...args) => acceptLegalDocuments(...args) },
}));

vi.mock('../../../utils/notify', () => ({ default: notify }));

describe('LegalAcceptanceModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        acceptLegalDocuments.mockResolvedValue({
            data: { id: 'user-a', legal_acceptance_required: false },
        });
    });

    it('blocks continuation until the user explicitly accepts', async () => {
        render(<LegalAcceptanceModal />);

        const submit = screen.getByRole('button', { name: 'Accept and Continue' });
        expect(submit).toBeDisabled();
        expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('target', '_blank');
        expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('target', '_blank');

        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(submit);

        await waitFor(() => expect(acceptLegalDocuments).toHaveBeenCalledWith({
            accepted_terms: true,
            terms_version: '1.0',
            privacy_version: '1.0',
        }));
        expect(setUser).toHaveBeenCalledWith({ id: 'user-a', legal_acceptance_required: false });
        expect(notify.success).toHaveBeenCalled();
    });

    it('offers logout without accepting', () => {
        render(<LegalAcceptanceModal />);
        fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
        expect(logout).toHaveBeenCalled();
    });
});
