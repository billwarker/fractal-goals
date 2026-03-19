import notify from './notify';

function formatStructuredError(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value)) {
        return value
            .map((entry) => formatStructuredError(entry))
            .filter(Boolean)
            .join(', ');
    }

    if (typeof value === 'object') {
        if (typeof value.error === 'string' && typeof value.parent_deadline === 'string') {
            return `${value.error} (parent deadline: ${value.parent_deadline})`;
        }
        if (typeof value.error === 'string') {
            return value.error;
        }
        if (typeof value.message === 'string') {
            return value.message;
        }

        return Object.values(value)
            .map((entry) => formatStructuredError(entry))
            .filter(Boolean)
            .join(', ');
    }

    return String(value);
}

export function formatError(error, fallbackMessage = 'Unknown error') {
    return (
        formatStructuredError(error?.response?.data?.error)
        || formatStructuredError(error?.response?.data)
        || error?.message
        || fallbackMessage
    );
}

export function withNotify(
    mutationFn,
    { success = null, error = 'Operation failed', onError = null } = {},
) {
    return async (...args) => {
        try {
            const result = await mutationFn(...args);

            if (success) {
                const message = typeof success === 'function' ? success(result, ...args) : success;
                if (message) {
                    notify.success(message);
                }
            }

            return result;
        } catch (err) {
            try {
                onError?.(err, ...args);
            } catch (handlerError) {
                console.error('withNotify onError handler failed', handlerError);
            }

            const message = typeof error === 'function'
                ? error(err, ...args)
                : `${error}: ${formatError(err)}`;

            if (message) {
                notify.error(message);
            }

            throw err;
        }
    };
}
