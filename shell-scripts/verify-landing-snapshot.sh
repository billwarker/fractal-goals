#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-fractal-goals}"
PROJECT_NUMBER="${PROJECT_NUMBER:-195572181270}"
SNAPSHOT_URL="${1:-https://storage.googleapis.com/${PROJECT_ID}-landing-public-${PROJECT_NUMBER}/landing-examples.json}"
EXPECTED_REVISION="${2:-}"
ORIGIN="${ORIGIN:-https://fractalgoals.com}"
headers_file="$(mktemp)"
body_file="$(mktemp)"
trap 'rm -f "$headers_file" "$body_file"' EXIT

curl --fail --silent --show-error --compressed \
  -D "$headers_file" \
  -H "Origin: ${ORIGIN}" \
  -H "Accept-Encoding: gzip" \
  "$SNAPSHOT_URL" \
  -o "$body_file"

grep -Eiq '^content-type: application/json' "$headers_file"
grep -Eiq '^content-encoding: gzip' "$headers_file"
grep -Eiq '^cache-control: .*max-age=0.*must-revalidate.*no-transform' "$headers_file"
grep -Eiq "^access-control-allow-origin: ${ORIGIN//./\.}" "$headers_file"

jq -e '
  (.revision | type == "string" and length > 0)
  and (.published_at | type == "string" and length > 0)
  and (.schema_version | type == "number")
  and (.examples | type == "array" and length > 0)
' "$body_file" >/dev/null

if [[ -n "$EXPECTED_REVISION" ]]; then
  jq -e --arg revision "$EXPECTED_REVISION" '.revision == $revision' "$body_file" >/dev/null
fi

jq '{revision, published_at, schema_version, examples: (.examples | length)}' "$body_file"
