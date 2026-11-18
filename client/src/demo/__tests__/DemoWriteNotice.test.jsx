import React from 'react';
import { act, render } from '@testing-library/react';
import toast from 'react-hot-toast';

import { showActionToast } from '../../components/atoms/ActionToast';
import DemoWriteNotice from '../DemoWriteNotice';
import { DEMO_WRITE_BLOCKED_EVENT } from '../demoMode';

vi.mock('react-hot-toast', () => ({ default: { dismiss: vi.fn() } }));
vi.mock('../../components/atoms/ActionToast', () => ({ showActionToast: vi.fn() }));

const blockWrite = () => act(() => {
    window.dispatchEvent(new CustomEvent(DEMO_WRITE_BLOCKED_EVENT));
});

describe('DemoWriteNotice', () => {
    beforeEach(() => vi.clearAllMocks());

    it('answers each blocked write with the one sign-up toast, not a dialog', () => {
        const onSignup = vi.fn();
        render(<DemoWriteNotice onSignup={onSignup} />);

        blockWrite();
        blockWrite();

        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(showActionToast).toHaveBeenCalledTimes(2);
        const [first, second] = showActionToast.mock.calls.map(([options]) => options);
        expect(second.id).toBe(first.id);
        expect(first).toMatchObject({ message: 'Changes aren’t saved in the demo.', actionLabel: 'Sign up' });

        first.onAction();
        expect(onSignup).toHaveBeenCalledTimes(1);
    });

    it('clears and holds the toast while sign-up is open', () => {
        const { rerender } = render(<DemoWriteNotice onSignup={vi.fn()} />);
        blockWrite();
        const { id } = showActionToast.mock.calls[0][0];

        rerender(<DemoWriteNotice onSignup={vi.fn()} isSignupOpen />);
        expect(toast.dismiss).toHaveBeenCalledWith(id);
        blockWrite();
        expect(showActionToast).toHaveBeenCalledTimes(1);

        rerender(<DemoWriteNotice onSignup={vi.fn()} />);
        blockWrite();
        expect(showActionToast).toHaveBeenCalledTimes(2);
    });

    it('stops listening once unmounted', () => {
        const { unmount } = render(<DemoWriteNotice onSignup={vi.fn()} />);
        unmount();
        blockWrite();
        expect(showActionToast).not.toHaveBeenCalled();
    });
});
