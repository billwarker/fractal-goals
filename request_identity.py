"""
Client identity behind the production proxy chain.

Browser traffic reaches Flask through the nginx frontend service and Cloud
Run, so ``remote_addr`` is an infrastructure address shared by every user.
The forwarded chain is trusted only when the request carries the shared proxy
token that nginx injects; direct calls to the public backend URL keep their
connection address, so a forged ``X-Forwarded-For`` never selects a
rate-limit bucket.
"""

import hmac

from werkzeug.middleware.proxy_fix import ProxyFix

from config import config

PROXY_TOKEN_HEADER = "X-Fractal-Proxy-Token"
_PROXY_TOKEN_ENVIRON_KEY = "HTTP_" + PROXY_TOKEN_HEADER.upper().replace("-", "_")


class TrustedProxyMiddleware:
    """Apply ``ProxyFix`` only to requests attested by the frontend proxy."""

    def __init__(self, wsgi_app, *, hops: int, secret: str):
        if hops < 1:
            raise ValueError("TrustedProxyMiddleware requires at least one trusted hop")
        if not secret:
            raise ValueError("TrustedProxyMiddleware requires a shared proxy secret")
        self.wsgi_app = wsgi_app
        self._secret = secret.encode("utf-8")
        self._proxied_app = ProxyFix(wsgi_app, x_for=hops, x_proto=1)

    def _is_attested(self, environ) -> bool:
        presented = environ.get(_PROXY_TOKEN_ENVIRON_KEY, "")
        return hmac.compare_digest(presented.encode("utf-8"), self._secret)

    def __call__(self, environ, start_response):
        attested = self._is_attested(environ)
        # The token authenticates the proxy hop only; application code never sees it.
        environ.pop(_PROXY_TOKEN_ENVIRON_KEY, None)
        if attested:
            return self._proxied_app(environ, start_response)
        return self.wsgi_app(environ, start_response)


def configure_request_identity(app, *, hops=None, secret=None):
    """Install proxy attestation when a trusted hop count is configured."""
    hops = config.TRUSTED_PROXY_HOPS if hops is None else hops
    secret = config.TRUSTED_PROXY_SECRET if secret is None else secret
    if hops < 1:
        return app
    app.wsgi_app = TrustedProxyMiddleware(app.wsgi_app, hops=hops, secret=secret)
    return app
