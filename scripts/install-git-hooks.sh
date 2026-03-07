#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/.githooks"
TARGET_DIR="$ROOT_DIR/.git/hooks"

if [ ! -d "$ROOT_DIR/.git" ]; then
    echo "Error: .git directory not found. Run this script from a cloned repository." >&2
    exit 1
fi

mkdir -p "$TARGET_DIR"

for hook in pre-commit pre-push; do
    cp "$SOURCE_DIR/$hook" "$TARGET_DIR/$hook"
    chmod +x "$TARGET_DIR/$hook"
done

echo "Installed git hooks to $TARGET_DIR"
