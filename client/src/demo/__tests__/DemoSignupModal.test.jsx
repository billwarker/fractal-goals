import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import landingContent from '../../content/landingContent';
import DemoSignupModal, { inviteSignupHref } from '../DemoSignupModal';

const { createBetaSignup } = vi.hoisted(() => ({ createBetaSignup: vi.fn() }));
vi.mock('../../utils/api', () => ({ publicApi: { createBetaSignup } }));

describe('DemoSignupModal', () => {
    beforeEach(() => vi.clearAllMocks());

    it('joins the waitlist and says what happens next', async () => {
        createBetaSignup.mockResolvedValue({ data: { created: true } });
        render(<DemoSignupModal isOpen onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText(landingContent.betaForm.emailLabel), { target: { value: 'me@example.com' } });
        fireEvent.change(screen.getByLabelText(landingContent.betaForm.goalLabel), { target: { value: 'Learn jazz' } });
        fireEvent.click(screen.getByRole('button', { name: landingContent.betaForm.submitLabel }));
        await waitFor(() => expect(createBetaSignup).toHaveBeenCalledWith({ email: 'me@example.com', use_case: 'Learn jazz' }));
        expect(await screen.findByText(landingContent.betaForm.successCreatedMessage)).toBeInTheDocument();
    });

    it('asks for a valid email before sending', () => {
        render(<DemoSignupModal isOpen onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: landingContent.betaForm.submitLabel }));
        expect(screen.getByRole('alert')).toHaveTextContent(landingContent.betaForm.validationMessage);
        expect(createBetaSignup).not.toHaveBeenCalled();
    });

    it('sends invite holders to the app’s prefilled sign-up', () => {
        expect(inviteSignupHref(' key-1 ', 'me@example.com', 'https://my.fractalgoals.com/'))
            .toBe('https://my.fractalgoals.com/?invite_key=key-1&email=me%40example.com');
        render(<DemoSignupModal isOpen onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Have an invite key?' }));
        expect(screen.getByRole('button', { name: 'Create my account' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Invite key'), { target: { value: 'key-1' } });
        expect(screen.getByRole('button', { name: 'Create my account' })).toBeEnabled();
    });
});
