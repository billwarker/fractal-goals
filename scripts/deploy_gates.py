#!/usr/bin/env python3
"""Release gates run by cloudbuild.yaml. Standard library only, so any Python image works.

    require-ci       Refuse to deploy a commit whose required GitHub checks did not all pass,
                     waiting for checks still running (Cloud Build starts on the same push).
    smoke-backend    Check a candidate (no-traffic) backend revision before promotion.
    smoke-frontend   Check a candidate frontend revision: shell, CSP, and its API proxy.
    tag-url          Print a Cloud Run traffic tag's URL from `gcloud run services describe --format=json` on stdin.

Every gate fails closed: a missing token, an unreachable endpoint, or an unexpected
answer exits non-zero, which stops the build before traffic moves.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

# Job names from .github/workflows/*.yml; GitHub reports each job as a check run.
REQUIRED_CHECKS = ("migration-health", "coverage", "production-image", "frontend", "browser")
TIMEOUT_SECONDS = 15
# CI takes ~15-25 min on hosted runners; cloudbuild.yaml's build timeout leaves room for this.
CI_WAIT_SECONDS = 40 * 60
CI_POLL_SECONDS = 30


class GateError(RuntimeError):
    pass


def _request(url, *, headers=None, method="GET"):
    request = urllib.request.Request(url, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers or {}), error.read()
    except (urllib.error.URLError, TimeoutError) as error:
        raise GateError(f"{url} unreachable: {error}") from error


def check_runs_state(check_runs, required=REQUIRED_CHECKS):
    """Split the required checks into (failed, pending); both empty means pass.

    A missing check is pending, not failed: its workflow may not have started yet.
    """
    latest = {}
    for run in check_runs:
        name = run.get("name")
        # Keep the newest run per name; reruns supersede earlier attempts.
        if name and (name not in latest or run.get("id", 0) > latest[name].get("id", 0)):
            latest[name] = run
    failed, pending = [], []
    for name in required:
        run = latest.get(name)
        if run is None:
            pending.append(f"{name}: missing")
        elif run.get("status") != "completed":
            pending.append(f"{name}: {run.get('status')}/{run.get('conclusion')}")
        elif run.get("conclusion") != "success":
            failed.append(f"{name}: {run.get('status')}/{run.get('conclusion')}")
    return failed, pending


def check_runs_verdict(check_runs, required=REQUIRED_CHECKS):
    """Return the required checks that are missing or did not succeed (empty means pass)."""
    failed, pending = check_runs_state(check_runs, required)
    return failed + pending


def _fetch_check_runs(repo, sha, token):
    status, _, body = _request(
        f"https://api.github.com/repos/{repo}/commits/{sha}/check-runs?per_page=100",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    )
    if status != 200:
        # A private repo answers 404, not 403, to a token that cannot see it.
        hint = {
            401: "the token is invalid or expired",
            403: "the token lacks Checks: read",
            404: f"the token cannot see {repo} (check its repository access)",
        }.get(status, "unexpected response")
        raise GateError(f"GitHub check-runs lookup failed with {status}: {hint}")
    return json.loads(body).get("check_runs", [])


def require_ci(repo, sha, token, *, wait_seconds=CI_WAIT_SECONDS, poll_seconds=CI_POLL_SECONDS,
               fetch=_fetch_check_runs, sleep=time.sleep, clock=time.monotonic):
    if not token:
        raise GateError("GITHUB_CHECKS_TOKEN is not set; refusing to deploy an unverified commit")
    deadline = clock() + wait_seconds
    while True:
        failed, pending = check_runs_state(fetch(repo, sha, token))
        if failed:
            raise GateError("Required CI checks failed: " + "; ".join(failed + pending))
        if not pending:
            break
        if clock() + poll_seconds > deadline:
            raise GateError(f"Required CI checks still not finished after {wait_seconds // 60} min: " + "; ".join(pending))
        print(f"Waiting for CI on {sha[:12]}: " + "; ".join(pending), flush=True)
        sleep(poll_seconds)
    print(f"CI gate passed for {sha[:12]}: {', '.join(REQUIRED_CHECKS)}")


def _retrying(check, attempts=10, delay=3):
    for attempt in range(1, attempts + 1):
        try:
            return check()
        except GateError:
            if attempt == attempts:
                raise
            time.sleep(delay)
    return None


def smoke_backend(base_url):
    base_url = base_url.rstrip("/")

    def ready():
        status, _, _ = _request(f"{base_url}/api/readyz")
        if status != 200:
            raise GateError(f"/api/readyz returned {status}")

    _retrying(ready)
    status, _, _ = _request(f"{base_url}/api/healthz")
    if status != 200:
        raise GateError(f"/api/healthz returned {status}")
    # Auth wiring: an anonymous identity request must be refused, never served or 5xx.
    status, _, _ = _request(f"{base_url}/api/auth/me")
    if status != 401:
        raise GateError(f"/api/auth/me returned {status} without credentials (expected 401)")
    print(f"Backend smoke passed: {base_url}")


def smoke_frontend(base_url):
    base_url = base_url.rstrip("/")
    status, headers, body = _retrying(lambda: _checked(f"{base_url}/", 200))
    policy = {key.lower(): value for key, value in headers.items()}.get("content-security-policy", "")
    if "script-src 'self'" not in policy or "'unsafe-inline'" in policy.split("script-src", 1)[1].split(";", 1)[0]:
        raise GateError("App shell is missing the strict script-src policy")
    if b"/boot/shell.js" not in body:
        raise GateError("App shell does not reference /boot/shell.js")
    _checked(f"{base_url}/boot/shell.js", 200)
    _checked(f"{base_url}/api/healthz", 200)  # nginx proxy to the backend
    print(f"Frontend smoke passed: {base_url}")


def tag_url(service_description, tag):
    for target in service_description.get("status", {}).get("traffic", []):
        if target.get("tag") == tag and target.get("url"):
            return target["url"]
    raise GateError(f"No traffic tag {tag!r} on the service")


def _checked(url, expected):
    status, headers, body = _request(url)
    if status != expected:
        raise GateError(f"{url} returned {status} (expected {expected})")
    return status, headers, body


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    ci = commands.add_parser("require-ci")
    ci.add_argument("--repo", required=True)
    ci.add_argument("--sha", required=True)
    ci.add_argument("--wait-seconds", type=int, default=CI_WAIT_SECONDS)
    for name in ("smoke-backend", "smoke-frontend"):
        commands.add_parser(name).add_argument("--url", required=True)
    commands.add_parser("tag-url").add_argument("--tag", required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "tag-url":
            print(tag_url(json.load(sys.stdin), args.tag))
        elif args.command == "require-ci":
            require_ci(args.repo, args.sha, os.environ.get("GITHUB_CHECKS_TOKEN", ""), wait_seconds=args.wait_seconds)
        elif args.command == "smoke-backend":
            smoke_backend(args.url)
        else:
            smoke_frontend(args.url)
    except GateError as error:
        print(f"GATE FAILED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
