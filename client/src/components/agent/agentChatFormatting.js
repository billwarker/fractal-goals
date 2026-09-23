export const getErrorMessage = (error) => error?.response?.data?.error
    || error?.response?.data?.message
    || error?.message
    || 'Please try again.';

export const formatPreviewValue = (value) => {
    if (value === null) return 'None';
    if (Array.isArray(value)) {
        if (!value.length) return 'None';
        return value.some((item) => item && typeof item === 'object')
            ? JSON.stringify(value)
            : value.join(', ');
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
};
