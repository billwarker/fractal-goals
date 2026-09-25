// Request-config flags read by the interceptors in src/utils/api/core.js.
import 'axios';

declare module 'axios' {
    interface AxiosRequestConfig {
        /** Send the request without the in-memory bearer token (public endpoints). */
        _skipAuth?: boolean;
        /** Do not fetch a CSRF token before this request (the refresh call itself). */
        _skipCsrfFetch?: boolean;
        /** Set once a request has been retried after a token refresh. */
        _retry?: boolean;
    }
}
