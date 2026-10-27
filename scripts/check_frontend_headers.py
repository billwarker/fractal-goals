#!/usr/bin/env python3
"""Verify the built nginx image, including SPA fallbacks and error responses."""
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


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
        for path in ('/', '/index.html', '/a/deep/spa/link', '/sw.js', '/manifest.webmanifest', '/assets/missing.js'):
            try:
                response = urlopen(origin + path, timeout=5)
            except HTTPError as error:
                response = error
            with response:
                for header in ('Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options',
                               'Referrer-Policy', 'Permissions-Policy', 'X-Frame-Options', 'Cache-Control'):
                    assert response.headers.get(header), f'{path}: missing {header}'
                assert 'https://drive.google.com' in response.headers['Content-Security-Policy']
                assert 'https://www.dropbox.com' in response.headers['Content-Security-Policy']
                if path == '/assets/missing.js':
                    assert response.status == 404
                if path in ('/', '/index.html', '/a/deep/spa/link'):
                    assert response.headers['Cache-Control'] == 'no-store'
                if path in ('/sw.js', '/manifest.webmanifest'):
                    assert response.headers['Cache-Control'] == 'no-cache'
        print('Frontend container headers passed on app, deep link, worker, manifest and error responses')
    finally:
        subprocess.run(['docker', 'rm', '-f', container], check=False, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
