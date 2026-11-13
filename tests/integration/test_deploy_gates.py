"""Release gates used by cloudbuild.yaml behave correctly against real and stub services."""
import importlib.util
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest
from werkzeug.serving import make_server

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "deploy_gates.py"


def _gates():
    spec = importlib.util.spec_from_file_location("deploy_gates", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gates = _gates()


def _passing_runs():
    return [{"id": index, "name": name, "status": "completed", "conclusion": "success"}
            for index, name in enumerate(gates.REQUIRED_CHECKS)]


def test_ci_verdict_passes_only_when_every_required_check_succeeded():
    assert gates.check_runs_verdict(_passing_runs()) == []


@pytest.mark.parametrize("mutate, expected", [
    (lambda runs: runs[1:], "migration-health: missing"),
    (lambda runs: [*runs[:-1], {**runs[-1], "conclusion": "failure"}], "browser: completed/failure"),
    (lambda runs: [*runs[:-1], {**runs[-1], "status": "in_progress", "conclusion": None}], "browser: in_progress/None"),
])
def test_ci_verdict_reports_missing_failed_and_pending_checks(mutate, expected):
    assert expected in gates.check_runs_verdict(mutate(_passing_runs()))


def test_ci_verdict_uses_the_newest_rerun_of_a_check():
    runs = _passing_runs()
    runs.append({"id": 99, "name": "coverage", "status": "completed", "conclusion": "failure"})
    assert gates.check_runs_verdict(runs) == ["coverage: completed/failure"]
    runs.append({"id": 100, "name": "coverage", "status": "completed", "conclusion": "success"})
    assert gates.check_runs_verdict(runs) == []


def test_require_ci_fails_closed_without_a_token():
    with pytest.raises(gates.GateError, match="GITHUB_CHECKS_TOKEN"):
        gates.require_ci("owner/repo", "abc123", "")


class _Checks:
    """A GitHub stub answering each poll with the next list of check runs, on a fake clock."""

    def __init__(self, *answers):
        self.answers, self.now, self.polls = list(answers), 0, 0

    def fetch(self, _repo, _sha, _token):
        self.polls += 1
        return self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]

    def sleep(self, seconds):
        self.now += seconds

    def require(self, wait_seconds=600):
        gates.require_ci("owner/repo", "abc123", "token", wait_seconds=wait_seconds, poll_seconds=30,
                         fetch=self.fetch, sleep=self.sleep, clock=lambda: self.now)


def _running(name):
    return [run if run["name"] != name else {**run, "status": "in_progress", "conclusion": None}
            for run in _passing_runs()]


def test_require_ci_waits_for_running_and_unstarted_checks_then_passes():
    checks = _Checks(_passing_runs()[2:], _running("browser"), _passing_runs())
    checks.require()
    assert checks.polls == 3


def test_require_ci_fails_as_soon_as_a_check_fails_without_waiting_for_the_rest():
    failed = [{**run, "conclusion": "failure"} if run["name"] == "coverage" else run for run in _running("browser")]
    checks = _Checks(failed)
    with pytest.raises(gates.GateError, match="coverage: completed/failure"):
        checks.require()
    assert checks.polls == 1


def test_require_ci_gives_up_when_checks_never_finish():
    checks = _Checks(_running("browser"))
    with pytest.raises(gates.GateError, match="still not finished after 10 min: browser: in_progress"):
        checks.require(wait_seconds=600)
    assert checks.now <= 600


def test_require_ci_reads_every_workflow_runs_jobs(monkeypatch):
    jobs = {"1": _passing_runs()[:2], "2": _passing_runs()[2:]}

    def github(url, **_kwargs):
        if "actions/runs?head_sha=abc123" in url:
            return 200, {}, b'{"workflow_runs": [{"id": 1}, {"id": 2}]}'
        run_id = url.split("actions/runs/")[1].split("/")[0]
        return 200, {}, gates.json.dumps({"jobs": jobs[run_id]}).encode()

    monkeypatch.setattr(gates, "_request", github)
    gates.require_ci("owner/repo", "abc123", "token")


@pytest.mark.parametrize("status, hint", [(401, "invalid or expired"), (403, "Actions: read"), (404, "cannot see owner/repo")])
def test_require_ci_explains_why_github_refused_the_token(monkeypatch, status, hint):
    monkeypatch.setattr(gates, "_request", lambda *_args, **_kwargs: (status, {}, b"{}"))
    with pytest.raises(gates.GateError, match=f"failed with {status}: .*{hint}"):
        gates.require_ci("owner/repo", "abc123", "token")


def test_backend_smoke_passes_against_the_real_application(app):
    server = make_server("127.0.0.1", 0, app)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        gates.smoke_backend(f"http://127.0.0.1:{server.server_port}")
    finally:
        server.shutdown()


class _Shell(BaseHTTPRequestHandler):
    policy = "default-src 'self'; script-src 'self' https://apis.google.com; object-src 'none'"

    def do_GET(self):  # noqa: N802 - http.server API
        status = 200 if self.path in ("/", "/boot/shell.js", "/api/healthz") else 404
        self.send_response(status)
        self.send_header("Content-Security-Policy", self.policy)
        self.end_headers()
        self.wfile.write(b'<script src="/boot/shell.js"></script>' if self.path == "/" else b"ok")

    def log_message(self, *_args):
        pass


@pytest.mark.parametrize("policy, passes", [
    (_Shell.policy, True),
    ("default-src 'self'; script-src 'self' 'unsafe-inline'", False),
    ("frame-src https://www.youtube.com", False),
])
def test_frontend_smoke_requires_the_strict_script_policy(policy, passes):
    handler = type("Shell", (_Shell,), {"policy": policy})
    server = HTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{server.server_port}"
        if passes:
            gates.smoke_frontend(url)
        else:
            with pytest.raises(gates.GateError, match="script-src"):
                gates.smoke_frontend(url)
    finally:
        server.shutdown()


def test_tag_url_reads_the_candidate_url_from_the_service_description():
    description = {"status": {"traffic": [
        {"percent": 100, "revisionName": "fractal-backend-00041"},
        {"tag": "candidate", "url": "https://candidate---fractal-backend-abc.run.app", "revisionName": "fractal-backend-00042"},
    ]}}
    assert gates.tag_url(description, "candidate") == "https://candidate---fractal-backend-abc.run.app"
    with pytest.raises(gates.GateError):
        gates.tag_url(description, "missing")


def _cloudbuild_steps():
    import yaml

    document = yaml.safe_load((Path(__file__).resolve().parents[2] / "cloudbuild.yaml").read_text())
    return document, [step["id"] for step in document["steps"]], {step["id"]: step for step in document["steps"]}


def test_cloudbuild_gates_run_in_a_fail_closed_order():
    document, order, steps = _cloudbuild_steps()

    assert order[0] == "Require Passing CI"
    assert order.index("Store Pre-Migration Backup") < order.index("Run Migrations")
    for service in ("Backend", "Frontend"):
        deploy = steps[f"Deploy {service}"]["args"]
        assert "--no-traffic" in deploy and "candidate" in deploy
        assert order.index(f"Deploy {service}") < order.index(f"Smoke {service} Candidate") < order.index(f"Promote {service}")
    # Jobs move to the new image only after the backend is proven and promoted.
    assert order.index("Promote Backend") < order.index("Update Analytics Export Job")
    assert order.index("Promote Backend") < order.index("Update Data Retention Job")
    assert document["substitutions"]["_ALLOW_UNVERIFIED_DEPLOY"] == "false"
    # Room to wait out CI before the deploy's own ~30 min.
    assert int(document["timeout"].rstrip("s")) >= gates.CI_WAIT_SECONDS + 1800
    assert {secret["env"] for secret in document["availableSecrets"]["secretManager"]} >= {
        "GITHUB_CHECKS_TOKEN", "SUPABASE_SESSION_POOLER_URL",
    }


def test_cloudbuild_runs_every_gate_in_a_python_image():
    _, _, steps = _cloudbuild_steps()

    gate_steps = [step for step in steps.values() if "deploy_gates.py" in " ".join(step.get("args", []))]
    assert {step["id"] for step in gate_steps} == {
        "Require Passing CI", "Smoke Backend Candidate", "Smoke Frontend Candidate",
    }
    for step in gate_steps:
        assert step["name"].startswith("python:"), step["id"]


def test_cloudbuild_smoke_steps_read_the_description_their_describe_step_writes():
    _, order, steps = _cloudbuild_steps()

    for service in ("Backend", "Frontend"):
        path = f"/workspace/{service.lower()}-service.json"
        assert f"> {path}" in " ".join(steps[f"Describe {service} Candidate"]["args"])
        assert f"< {path}" in " ".join(steps[f"Smoke {service} Candidate"]["args"])
        assert order.index(f"Deploy {service}") < order.index(f"Describe {service} Candidate") < order.index(f"Smoke {service} Candidate")


def test_cloudbuild_shell_variables_are_escaped_from_substitution():
    import re

    text = (Path(__file__).resolve().parents[2] / "cloudbuild.yaml").read_text()
    # Cloud Build substitutes $NAME and ${NAME}; shell-only syntax must be written $$.
    assert not re.search(r"(?<!\$)\$\(", text)
    for variable in ("URL", "SUPABASE_SESSION_POOLER_URL"):
        assert not re.search(rf"(?<!\$)\${variable}\b", text), variable
