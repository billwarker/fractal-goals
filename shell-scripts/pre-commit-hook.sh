#!/bin/bash

# Deprecated compatibility wrapper. Prefer scripts/install-git-hooks.sh.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT_DIR/.githooks/pre-commit"
