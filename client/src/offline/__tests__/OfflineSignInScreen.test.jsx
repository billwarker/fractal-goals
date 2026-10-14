import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OfflineSignInScreen from '../OfflineSignInScreen';

const { checkConnectivity } = vi.hoisted(() => ({ checkConnectivity: vi.fn() }));
vi.mock('../connectivity', () => ({ checkConnectivity }));

describe('OfflineSignInScreen', () => {
    it('explains the situation and lets the user check again right away', () => {
        render(<OfflineSignInScreen />);

        expect(screen.getByRole('heading', { name: "You're offline" })).toBeInTheDocument();
        expect(screen.getByText(/anything saved on this device will sync after you sign in/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(checkConnectivity).toHaveBeenCalled();
    });
});
