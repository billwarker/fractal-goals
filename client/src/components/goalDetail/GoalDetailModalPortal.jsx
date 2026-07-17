import { createPortal } from 'react-dom';

export default function GoalDetailModalPortal({ children, portalTarget = null }) {
    return createPortal(children, portalTarget || document.body);
}
