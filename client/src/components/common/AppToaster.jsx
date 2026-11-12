import React from 'react';
import { Toaster } from 'react-hot-toast';

// The app's toast surface, shared by the signed-in app and the live demo.
export default function AppToaster() {
    return (
        <Toaster
            position="bottom-center"
            toastOptions={{
                style: {
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                },
                success: {
                    duration: 3000,
                    iconTheme: { primary: 'var(--color-brand-success)', secondary: '#fff' },
                },
                error: {
                    duration: 5000,
                    iconTheme: { primary: 'var(--color-brand-danger)', secondary: '#fff' },
                },
            }}
        />
    );
}
