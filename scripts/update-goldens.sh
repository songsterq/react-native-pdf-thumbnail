#!/usr/bin/env bash
# Requires an installed Release example on a booted Android device/iOS simulator,
# Maestro 2.11.0, Python 3 and Pillow (python3 -m pip install pillow).
# Runs the committed flow, pulls the complete export, then adopts the single
# selection in fixtures/golden-cases.json via compare-goldens.py --update.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
PLATFORM=${1:-}
DEVICE=${2:-}
APP_ID=org.songsterq.pdfthumbnail.example
if [[ "$PLATFORM" != android && "$PLATFORM" != ios ]] || [[ $# -gt 2 ]]; then
  echo "Usage: $0 <android|ios> [adb-serial|simulator-udid]" >&2
  exit 2
fi
if ! maestro --version 2>&1 | grep -qx "2.11.0"; then
  echo 'Requires Maestro 2.11.0' >&2
  exit 1
fi
WORK=$(mktemp -d "${TMPDIR:-/tmp}/pdf-thumbnail-goldens.XXXXXX")
echo "Keeping Maestro output and pulled JPEGs in $WORK"
if [[ "$PLATFORM" == android ]]; then
  ADB=(adb)
  if [[ -n "$DEVICE" ]]; then ADB+=(-s "$DEVICE"); fi
  DEVICE=$("${ADB[@]}" get-serialno)
else
  DEVICE=$(xcrun simctl getenv "${DEVICE:-booted}" SIMULATOR_UDID)
fi
# The app remains installed; clearState gives each run fresh inputs/exports.
maestro --device "$DEVICE" test --format junit --output "$WORK/maestro.xml" \
  --test-output-dir "$WORK/maestro" --debug-output "$WORK/maestro-debug" .maestro/selftest.yaml
if [[ "$PLATFORM" == android ]]; then
  "${ADB[@]}" pull "/sdcard/Android/data/$APP_ID/files/selftest" "$WORK/selftest"
else
  CONTAINER=$(xcrun simctl get_app_container "$DEVICE" "$APP_ID" data)
  cp -R "$CONTAINER/Documents/selftest" "$WORK/selftest"
fi
python3 scripts/compare-goldens.py "$PLATFORM" "$WORK/selftest" --update
