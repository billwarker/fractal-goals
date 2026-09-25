import pytest
from flask import Flask, jsonify, request

from request_identity import PROXY_TOKEN_HEADER, TrustedProxyMiddleware, configure_request_identity

SECRET = "unit-test-proxy-secret-at-least-32-characters"
INFRA_ADDR = "169.254.8.1"


def _identity_app(hops=3, secret=SECRET):
    app = Flask(__name__)

    @app.route("/whoami")
    def whoami():
        return jsonify({
            "remote_addr": request.remote_addr,
            "scheme": request.scheme,
            "proxy_token": request.headers.get(PROXY_TOKEN_HEADER),
        })

    configure_request_identity(app, hops=hops, secret=secret)
    return app


def _whoami(app, *, forwarded_for=None, token=None, proto=None):
    headers = {}
    if forwarded_for is not None:
        headers["X-Forwarded-For"] = forwarded_for
    if token is not None:
        headers[PROXY_TOKEN_HEADER] = token
    if proto is not None:
        headers["X-Forwarded-Proto"] = proto
    response = app.test_client().get(
        "/whoami", headers=headers, environ_base={"REMOTE_ADDR": INFRA_ADDR},
    )
    return response.get_json()


def test_attested_chain_resolves_client_at_trusted_hop():
    body = _whoami(
        _identity_app(),
        forwarded_for="203.0.113.9, 169.254.1.1, 34.1.1.1",
        token=SECRET,
        proto="https",
    )

    assert body["remote_addr"] == "203.0.113.9"
    assert body["scheme"] == "https"


def test_attested_chain_ignores_client_supplied_entries_left_of_trusted_hops():
    body = _whoami(
        _identity_app(),
        forwarded_for="6.6.6.6, 203.0.113.9, 169.254.1.1, 34.1.1.1",
        token=SECRET,
    )

    assert body["remote_addr"] == "203.0.113.9"


@pytest.mark.parametrize("token", [None, "", "wrong-secret", SECRET[:-1]])
def test_unattested_request_keeps_connection_address_despite_forged_chain(token):
    body = _whoami(
        _identity_app(),
        forwarded_for="6.6.6.6, 7.7.7.7, 8.8.8.8",
        token=token,
    )

    assert body["remote_addr"] == INFRA_ADDR


def test_attested_chain_shorter_than_trusted_hops_keeps_connection_address():
    body = _whoami(_identity_app(), forwarded_for="169.254.1.1, 34.1.1.1", token=SECRET)

    assert body["remote_addr"] == INFRA_ADDR


def test_proxy_token_is_not_exposed_to_application_code():
    body = _whoami(_identity_app(), forwarded_for="203.0.113.9, 169.254.1.1, 34.1.1.1", token=SECRET)

    assert body["proxy_token"] is None


def test_zero_hops_leaves_forwarded_headers_untrusted():
    app = _identity_app(hops=0, secret="")

    assert not isinstance(app.wsgi_app, TrustedProxyMiddleware)
    assert _whoami(app, forwarded_for="203.0.113.9", token=SECRET)["remote_addr"] == INFRA_ADDR


def test_configured_hops_without_secret_fail_loudly():
    with pytest.raises(ValueError, match="shared proxy secret"):
        _identity_app(hops=3, secret="")
