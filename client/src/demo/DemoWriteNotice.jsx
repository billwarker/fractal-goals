import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { showActionToast } from '../components/atoms/ActionToast';
import { DEMO_WRITE_BLOCKED_EVENT } from './demoMode';

// One toast id: a single click can fire several writes, and each burst should
// refresh the one notice rather than stack copies of it.
const DEMO_WRITE_TOAST_ID = 'demo-write-blocked';

// Shown when the visitor tries to save something: a toast, so exploring isn't interrupted.
// Quiet while sign-up is open: leaving an editor for the form can itself attempt a save.
export default function DemoWriteNotice({ onSignup, isSignupOpen = false }) {
    useEffect(() => {
        if (isSignupOpen) {
            toast.dismiss(DEMO_WRITE_TOAST_ID);
            return undefined;
        }
        const handleBlocked = () => {
            showActionToast({
                id: DEMO_WRITE_TOAST_ID,
                duration: 5000,
                message: 'Changes aren’t saved in the demo.',
                actionLabel: 'Sign up',
                onAction: onSignup,
            });
        };
        window.addEventListener(DEMO_WRITE_BLOCKED_EVENT, handleBlocked);
        return () => window.removeEventListener(DEMO_WRITE_BLOCKED_EVENT, handleBlocked);
    }, [isSignupOpen, onSignup]);

    return null;
}
