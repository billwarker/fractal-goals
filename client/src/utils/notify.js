import toast from 'react-hot-toast';
import { isQuietAfterBlockedWrite } from '../demo/demoMode';

const notify = {
    // In the demo a blocked write has its own toast. The caller's failure toast would only repeat
    // it, and a success toast (from callers that swallow the failure) would be untrue.
    success: (message) => (isQuietAfterBlockedWrite() ? undefined : toast.success(message)),
    warning: (message) => toast(message, { icon: '⚠️' }),
    error: (message) => (isQuietAfterBlockedWrite() ? undefined : toast.error(message)),
    loading: (message) => toast.loading(message),
    dismiss: (toastId) => toast.dismiss(toastId),
    custom: (component) => toast.custom(component)
};

export default notify;
