import toast from 'react-hot-toast';
import { isQuietAfterBlockedWrite } from '../demo/demoMode';

const notify = {
    success: (message) => toast.success(message),
    warning: (message) => toast(message, { icon: '⚠️' }),
    // In the demo a blocked write has its own prompt; the caller's failure toast would only repeat it.
    error: (message) => (isQuietAfterBlockedWrite() ? undefined : toast.error(message)),
    loading: (message) => toast.loading(message),
    dismiss: (toastId) => toast.dismiss(toastId),
    custom: (component) => toast.custom(component)
};

export default notify;
