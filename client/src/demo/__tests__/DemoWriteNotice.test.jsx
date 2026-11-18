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

    it('answers each blocked write with the one toast, not a dialog', () => {
        render(<DemoWriteNotice />);

        blockWrite();
        blockWrite();

        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(showActionToast).toHaveBeenCalledTimes(2);
        const [first, second] = showActionToast.mock.calls.map(([options]) => options);
        expect(second.id).toBe(first.id);
        expect(first.message).toBe('Changes aren’t saved in the demo.');
        expect(first.actionLabel).toBeUndefined();
    });

    it('clears and holds the toast while sign-up is open', () => {
        const { rerender } = render(<DemoWriteNotice />);
        blockWrite();
        const { id } = showActionToast.mock.calls[0][0];

        rerender(<DemoWriteNotice isSignupOpen />);
        expect(toast.dismiss).toHaveBeenCalledWith(id);
        blockWrite();
        expect(showActionToast).toHaveBeenCalledTimes(1);

        rerender(<DemoWriteNotice />);
        blockWrite();
        expect(showActionToast).toHaveBeenCalledTimes(2);
    });

    it('stops listening once unmounted', () => {
        const { unmount } = render(<DemoWriteNotice />);
        unmount();
        blockWrite();
        expect(showActionToast).not.toHaveBeenCalled();
    });
});
