#!/usr/bin/env bash
# Keep the pull inside emulator-runner: it shuts down the emulator on exit.
set -euo pipefail
mkdir -p artifacts/android
trap 'adb logcat -d > artifacts/android/logcat.txt || true; adb pull /sdcard/Android/data/org.songsterq.pdfthumbnail.example/files/selftest artifacts/android/selftest || true' EXIT
adb install -r example/android/app/build/outputs/apk/release/app-release.apk
maestro test --format junit --output artifacts/android/maestro.xml \
  --test-output-dir artifacts/android/maestro --debug-output artifacts/android/maestro-debug .maestro/selftest.yaml
