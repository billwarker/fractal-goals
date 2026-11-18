import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import landingContent from '../../content/landingContent';
import DemoSignupModal, { inviteSignupHref } from '../DemoSignupModal';

import { __attributionTestHooks } from '../../utils/visitAttribution';

const { createBetaSignup, trackPublicEvent } = vi.hoisted(() => ({ createBetaSignup: vi.fn(), trackPublicEvent: vi.fn() }));
vi.mock('../../utils/api', () => ({ publicApi: { createBetaSignup } }));
vi.mock('../../utils/publicTelemetry', () => ({ trackPublicEvent }));

describe('DemoSignupModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __attributionTestHooks.reset();
        window.history.replaceState({}, '', '/');
    });

    it('joins the waitlist and says what happens next', async () => {
        createBetaSignup.mockResolvedValue({ data: { created: true } });
        render(<DemoSignupModal isOpen onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText(landingContent.betaForm.emailLabel), { target: { value: 'me@example.com' } });
        fireEvent.change(screen.getByLabelText(landingContent.betaForm.goalLabel), { target: { value: 'Learn jazz' } });
        fireEvent.click(screen.getByRole('button', { name: landingContent.betaForm.submitLabel }));
        await waitFor(() => expect(createBetaSignup).toHaveBeenCalledWith({ email: 'me@example.com', source: 'landing', use_case: 'Learn jazz' }));
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
    it('records where the waitlist was joined and the campaign that brought the visitor', async () => {
        window.history.replaceState({}, '', '/demo/root/goals?utm_source=Newsletter');
        createBetaSignup.mockResolvedValue({ data: { created: false } });
        render(<DemoSignupModal isOpen source="demo_tour_end" onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText(landingContent.betaForm.emailLabel), { target: { value: 'me@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: landingContent.betaForm.submitLabel }));

        await waitFor(() => expect(createBetaSignup).toHaveBeenCalledWith({ email: 'me@example.com', source: 'utm:newsletter' }));
        await waitFor(() => expect(trackPublicEvent).toHaveBeenCalledWith('waitlist_submitted', { source: 'demo_tour_end', created: false }));
    });

    it('a demo signup without a campaign is attributed to the demo', async () => {
        createBetaSignup.mockResolvedValue({ data: { created: true } });
        render(<DemoSignupModal isOpen source="demo_guide" onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText(landingContent.betaForm.emailLabel), { target: { value: 'me@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: landingContent.betaForm.submitLabel }));

        await waitFor(() => expect(createBetaSignup).toHaveBeenCalledWith({ email: 'me@example.com', source: 'demo' }));
    });

    it('records leaving for sign-up with an invite key', () => {
        const assign = vi.fn();
        vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });
        render(<DemoSignupModal isOpen source="landing" onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Have an invite key?' }));
        fireEvent.change(screen.getByLabelText('Invite key'), { target: { value: 'KEY-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));

        expect(trackPublicEvent).toHaveBeenCalledWith('invite_link_opened', { source: 'landing' });
        expect(assign).toHaveBeenCalled();
        vi.restoreAllMocks();
    });
});
