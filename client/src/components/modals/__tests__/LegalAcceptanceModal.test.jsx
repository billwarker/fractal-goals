import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import LegalAcceptanceModal from '../LegalAcceptanceModal';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../../content/legal/legalVersions';

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

// jsdom has no layout: give the reader a 2000px document in a 500px pane, then scroll it.
const scrollReader = ({ scrollTop }) => {
    const reader = screen.getByRole('tabpanel');
    Object.defineProperty(reader, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(reader, 'clientHeight', { configurable: true, value: 500 });
    reader.scrollTop = scrollTop;
    fireEvent.scroll(reader);
};

describe('LegalAcceptanceModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        acceptLegalDocuments.mockResolvedValue({
            data: { id: 'user-a', legal_acceptance_required: false },
        });
    });

    it('blocks continuation until both documents are read to the end and accepted', async () => {
        render(<LegalAcceptanceModal />);

        const submit = screen.getByRole('button', { name: 'Accept and Continue' });
        const checkbox = screen.getByRole('checkbox');
        expect(submit).toBeDisabled();
        expect(checkbox).toBeDisabled();
        expect(screen.getByRole('tab', { name: /Terms of Service/ })).toHaveAttribute('aria-selected', 'true');

        // Partway down is not read.
        scrollReader({ scrollTop: 400 });
        expect(screen.getByRole('tab', { name: /Terms of Service/ })).toHaveTextContent('Not read yet');

        scrollReader({ scrollTop: 1500 });
        expect(screen.getByRole('tab', { name: /Terms of Service/ })).toHaveTextContent('Read');
        expect(checkbox).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Continue to the Privacy Policy' }));
        expect(screen.getByRole('tab', { name: /Privacy Policy/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveProperty('scrollTop', 0);
        scrollReader({ scrollTop: 1500 });

        expect(checkbox).toBeEnabled();
        expect(submit).toBeDisabled();
        fireEvent.click(checkbox);
        fireEvent.click(submit);

        await waitFor(() => expect(acceptLegalDocuments).toHaveBeenCalledWith({
            accepted_terms: true,
            terms_version: TERMS_VERSION,
            privacy_version: PRIVACY_VERSION,
        }));
        expect(setUser).toHaveBeenCalledWith({ id: 'user-a', legal_acceptance_required: false });
        expect(notify.success).toHaveBeenCalled();
    });

    it('returns to a document where the reader left it', () => {
        render(<LegalAcceptanceModal />);
        scrollReader({ scrollTop: 600 });
        fireEvent.click(screen.getByRole('tab', { name: /Privacy Policy/ }));
        fireEvent.click(screen.getByRole('tab', { name: /Terms of Service/ }));
        expect(screen.getByRole('tabpanel')).toHaveProperty('scrollTop', 600);
    });

    it('offers logout without accepting', () => {
        render(<LegalAcceptanceModal />);
        fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
        expect(logout).toHaveBeenCalled();
    });
});
