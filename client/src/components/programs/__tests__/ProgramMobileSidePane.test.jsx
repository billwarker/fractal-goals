import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProgramMobileSidePane from '../ProgramMobileSidePane';

describe('ProgramMobileSidePane', () => {
    it('opens as an animated modal sheet and restores focus on close', async () => {
        const onClose = vi.fn();
        const trigger = document.createElement('button');
        document.body.append(trigger);
        trigger.focus();

        const { unmount } = render(
            <ProgramMobileSidePane onClose={onClose}>
                <button type="button">First action</button>
                <button type="button">Last action</button>
            </ProgramMobileSidePane>
        );

        const dialog = screen.getByRole('dialog', { name: 'Program sidebar' });
        expect(dialog).toHaveClass('mobile-sheet-enter');
        expect(dialog.parentElement).toHaveClass('mobile-sheet-backdrop-enter');
        await waitFor(() => expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus());

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        unmount();
        expect(trigger).toHaveFocus();
        trigger.remove();
    });

    it('traps keyboard focus and dismisses from the backdrop', async () => {
        const onClose = vi.fn();
        render(
            <ProgramMobileSidePane onClose={onClose}>
                <button type="button">First action</button>
                <button type="button">Last action</button>
            </ProgramMobileSidePane>
        );

        const first = screen.getByRole('button', { name: 'First action' });
        const last = screen.getByRole('button', { name: 'Last action' });
        await waitFor(() => expect(first).toHaveFocus());
        last.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(first).toHaveFocus();

        const backdrop = screen.getByRole('dialog', { name: 'Program sidebar' }).parentElement;
        fireEvent.mouseDown(backdrop);
        fireEvent.click(backdrop);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
