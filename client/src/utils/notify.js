import toast from 'react-hot-toast';

const notify = {
    success: (message) => toast.success(message),
    warning: (message) => toast(message, { icon: '⚠️' }),
    error: (message) => toast.error(message),
    loading: (message) => toast.loading(message),
    dismiss: (toastId) => toast.dismiss(toastId),
    custom: (component) => toast.custom(component)
};

export default notify;
