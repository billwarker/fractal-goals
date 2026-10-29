#!/usr/bin/env python3
"""Verify the built nginx image, including SPA fallbacks and error responses.

Beyond header presence, this asserts the document CSP's semantics: no inline or
evaluated script, no arbitrary script origins, and locked-down object, base,
form, and framing directives. client/scripts/check-csp-enforcement.mjs then
proves in a real browser that the delivered shell blocks untrusted script.
"""
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


UNSAFE_SCRIPT_SOURCES = {"'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'",
                         '*', 'https:', 'http:', 'data:', 'blob:'}
ALLOWED_SCRIPT_SOURCES = {"'self'", 'https://apis.google.com'}


def parse_policy(header):
    directives = {}
    for part in header.split(';'):
        tokens = part.split()
        if tokens:
            directives[tokens[0].lower()] = tokens[1:]
    return directives


def assert_document_policy(path, header):
    policy = parse_policy(header)
    for directive in ('default-src', 'script-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors'):
        assert directive in policy, f'{path}: CSP lacks {directive}'
    script_sources = set(policy['script-src'])
    assert not script_sources & UNSAFE_SCRIPT_SOURCES, f'{path}: script-src allows {script_sources & UNSAFE_SCRIPT_SOURCES}'
    assert script_sources <= ALLOWED_SCRIPT_SOURCES, f'{path}: unreviewed script origin {script_sources - ALLOWED_SCRIPT_SOURCES}'
    assert policy['default-src'] == ["'self'"], f'{path}: default-src must be self'
    assert policy['object-src'] == ["'none'"], f'{path}: object-src must be none'
    assert policy['base-uri'] == ["'self'"], f'{path}: base-uri must be self'
    assert policy['form-action'] == ["'self'"], f'{path}: form-action must be self'
    assert policy['frame-ancestors'] == ["'none'"], f'{path}: frame-ancestors must be none'
    for provider in ('https://drive.google.com', 'https://www.dropbox.com'):
        assert provider in policy.get('frame-src', []), f'{path}: frame-src lacks {provider}'


def assert_shell_has_no_inline_script(html):
    for match in re.finditer(r'<script\b([^>]*)>(.*?)</script>', html, re.S | re.I):
        attributes, body = match.groups()
        assert 'src=' in attributes and not body.strip(), f'inline script in app shell: {match.group(0)[:80]}'
    assert not re.search(r'<[^>]+\son[a-z]+\s*=', html, re.I), 'inline event handler in app shell'


def main():
    image = sys.argv[1] if len(sys.argv) > 1 else 'fractal-client:headers'
    container = subprocess.check_output([
        'docker', 'run', '--rm', '-d', '-p', '127.0.0.1::8080',
        '-e', 'BACKEND_URL=http://127.0.0.1:9', '-e', 'TRUSTED_PROXY_SECRET=header-test-only-secret', image,
    ], text=True).strip()
    try:
        address = subprocess.check_output(['docker', 'port', container, '8080'], text=True).strip()
        origin = f'http://{address}'
        for _ in range(100):
            try:
                with urlopen(origin, timeout=1):
                    break
            except (URLError, TimeoutError):
                time.sleep(0.1)
        else:
            raise RuntimeError('nginx container did not start')
        document_paths = ('/', '/index.html', '/a/deep/spa/link', '/sw.js', '/manifest.webmanifest',
                          '/boot/shell.js', '/assets/missing.js')
        for path in document_paths:
            try:
                response = urlopen(origin + path, timeout=5)
            except HTTPError as error:
                response = error
            with response:
                for header in ('Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options',
                               'Referrer-Policy', 'Permissions-Policy', 'X-Frame-Options', 'Cache-Control'):
                    assert response.headers.get(header), f'{path}: missing {header}'
                assert_document_policy(path, response.headers['Content-Security-Policy'])
                if path == '/assets/missing.js':
                    assert response.status == 404
                if path in ('/', '/index.html', '/a/deep/spa/link'):
                    assert response.headers['Cache-Control'] == 'no-store'
                    assert_shell_has_no_inline_script(response.read().decode('utf-8'))
                if path in ('/sw.js', '/manifest.webmanifest', '/boot/shell.js'):
                    assert response.headers['Cache-Control'] == 'no-cache'

        # Proxied API documents (OAuth consent/callbacks) keep the backend's own CSP;
        # nginx adds only the shared headers there. The test backend is unreachable,
        # so this exercises nginx's gateway error on the /api/ location.
        try:
            api_response = urlopen(origin + '/api/health-probe', timeout=10)
        except HTTPError as error:
            api_response = error
        with api_response:
            assert api_response.headers.get('X-Content-Type-Options') == 'nosniff'
            assert api_response.headers.get('Strict-Transport-Security')
            assert 'Content-Security-Policy' not in api_response.headers, '/api/: nginx must not add the SPA CSP'
        print('Frontend container headers and CSP semantics passed on app, deep link, boot script, '
              'worker, manifest, error, and API responses')
    finally:
        subprocess.run(['docker', 'rm', '-f', container], check=False, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
