import { createPortal } from 'react-dom';

/**
 * Renders children into document.body so fixed sheets and modals escape page
 * animations and stacking contexts. Renders nothing when `when` is false.
 */
export default function BodyPortal({ when = true, children }) {
    if (!when) return null;
    return createPortal(children, document.body);
}
