import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { showActionToast } from '../components/atoms/ActionToast';
import { trackPublicEvent } from '../utils/publicTelemetry';
import { DEMO_WRITE_BLOCKED_EVENT } from './demoMode';

// One toast id: a single click can fire several writes, and each burst should
// refresh the one notice rather than stack copies of it.
const DEMO_WRITE_TOAST_ID = 'demo-write-blocked';
// One click can try several writes: one event per burst, like the toast.
const BLOCKED_EVENT_QUIET_MS = 5000;
const TRACKED_METHODS = new Set(['post', 'put', 'patch', 'delete']);
let lastTrackedAt = 0;

function trackBlockedWrite(detail, now = Date.now()) {
    if (now - lastTrackedAt < BLOCKED_EVENT_QUIET_MS) return;
    lastTrackedAt = now;
    const method = String(detail?.method || '').toLowerCase();
    trackPublicEvent('demo_write_blocked', { method: TRACKED_METHODS.has(method) ? method : 'post' });
}

// Shown when the visitor tries to save something: a toast, so exploring isn't interrupted.
// Quiet while sign-up is open: leaving an editor for the form can itself attempt a save.
export default function DemoWriteNotice({ isSignupOpen = false }) {
    useEffect(() => {
        if (isSignupOpen) {
            toast.dismiss(DEMO_WRITE_TOAST_ID);
            return undefined;
        }
        const handleBlocked = (event) => {
            trackBlockedWrite(event.detail);
            showActionToast({
                id: DEMO_WRITE_TOAST_ID,
                duration: 5000,
                message: 'Changes aren’t saved in the demo.',
            });
        };
        window.addEventListener(DEMO_WRITE_BLOCKED_EVENT, handleBlocked);
        return () => window.removeEventListener(DEMO_WRITE_BLOCKED_EVENT, handleBlocked);
    }, [isSignupOpen]);

    return null;
}
