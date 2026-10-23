import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import toast from 'react-hot-toast';

import ActionToast, { showActionToast } from '../ActionToast';

vi.mock('react-hot-toast', () => ({ default: { dismiss: vi.fn(), custom: vi.fn(() => 'toast-1') } }));

describe('ActionToast', () => {
    beforeEach(() => vi.clearAllMocks());

    it('runs its action once and dismisses itself', () => {
        const onAction = vi.fn();
        render(<ActionToast toastId="t1" message="Run a 10k: due Oct 22" details={['After the parent goal’s due date (Oct 20)']} actionLabel="Undo" onAction={onAction} />);

        expect(screen.getByRole('status')).toHaveTextContent('Run a 10k: due Oct 22');
        expect(screen.getByText('After the parent goal’s due date (Oct 20)')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(toast.dismiss).toHaveBeenCalledWith('t1');
        expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('can be dismissed without acting, and omits the action without a handler', () => {
        render(<ActionToast toastId="t2" message="Saved" />);
        expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(toast.dismiss).toHaveBeenCalledWith('t2');
    });

    it('shows through react-hot-toast with a default duration', () => {
        expect(showActionToast({ message: 'Saved' })).toBe('toast-1');
        expect(toast.custom).toHaveBeenCalledWith(expect.any(Function), { duration: 8000 });
        const element = toast.custom.mock.calls[0][0]({ id: 'x', visible: true });
        expect(element.props).toMatchObject({ toastId: 'x', message: 'Saved' });
    });
});
