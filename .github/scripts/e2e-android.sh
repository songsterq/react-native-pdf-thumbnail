#!/usr/bin/env bash
# Keep the pull inside emulator-runner: it shuts down the emulator on exit.
set -euo pipefail
mkdir -p artifacts/android
trap 'adb logcat -d > artifacts/android/logcat.txt || true; adb pull /sdcard/Android/data/org.songsterq.pdfthumbnail.example/files/selftest artifacts/android/selftest || true' EXIT

# A freshly restored emulator snapshot can report "booted" and then briefly drop
# off adb ("device offline"). Require several consecutive healthy checks.
wait_for_stable_device() {
  local healthy=0
  for _ in $(seq 1 60); do
    if adb wait-for-device >/dev/null 2>&1 &&
      [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] &&
      adb shell pm path android >/dev/null 2>&1; then
      healthy=$((healthy + 1))
      [ "$healthy" -ge 3 ] && return 0
    else
      healthy=0
    fi
    sleep 2
  done
  echo "Emulator did not become stable" >&2
  return 1
}

run_selftest() {
  local attempt=$1
  maestro test --format junit --output "artifacts/android/maestro-$attempt.xml" \
    --test-output-dir "artifacts/android/maestro-$attempt" \
    --debug-output "artifacts/android/maestro-debug-$attempt" .maestro/selftest.yaml
}

wait_for_stable_device
adb install -r example/android/app/build/outputs/apk/release/app-release.apk

if run_selftest 1; then
  exit 0
fi

# Retry once, and only for emulator/adb infrastructure failures. Assertion
# failures (anything other than "28/28 passed") are never retried.
if grep -rqsE 'device offline|DeviceServerDiedException|UNAVAILABLE' artifacts/android/maestro-1 artifacts/android/maestro-debug-1; then
  echo "Maestro lost the emulator connection; retrying once after it stabilises." >&2
  wait_for_stable_device
  run_selftest 2
else
  exit 1
fi
