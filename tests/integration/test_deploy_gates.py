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
    assert {secret["env"] for secret in document["availableSecrets"]["secretManager"]} >= {
        "GITHUB_CHECKS_TOKEN", "SUPABASE_DIRECT_DATABASE_URL",
    }


def test_cloudbuild_shell_variables_are_escaped_from_substitution():
    import re

    text = (Path(__file__).resolve().parents[2] / "cloudbuild.yaml").read_text()
    # Cloud Build substitutes $NAME and ${NAME}; shell-only syntax must be written $$.
    assert not re.search(r"(?<!\$)\$\(", text)
    for variable in ("URL", "SUPABASE_DIRECT_DATABASE_URL"):
        assert not re.search(rf"(?<!\$)\${variable}\b", text), variable
