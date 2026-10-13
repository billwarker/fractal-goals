const TRANSPORT_CODES = new Set(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT']);

// A request that never reached a verdict (offline, timeout, dropped connection).
// That is never evidence the session has ended or that the change was refused.
export const isNetworkError = (error) => Boolean(error)
    && !error.response
    && error.code !== 'ERR_CANCELED'
    && (TRANSPORT_CODES.has(error.code) || Boolean(error.isAxiosError) || Boolean(error.request));
