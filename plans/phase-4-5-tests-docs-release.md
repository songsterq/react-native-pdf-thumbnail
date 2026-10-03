# Phases 4 & 5 — End-to-end tests, docs, and the 2.0.0 release

Part of the catch-up plan. After Phase 3 (PR #105) the 2.0.0 code is complete. These two phases
make it **provably correct on every PR** (Phase 4) and **shippable to users** (Phase 5). They are
planned together because the release depends on both.

## Release timeline

| Step | When                                    | What                                                                                                       | Owner                                                        |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| R1   | after Phase 5's release pipeline merges | `2.0.0-rc.1` on npm dist-tag `next`, published by the new trusted-publishing workflow (its first real run) | owner (`yarn release --preRelease=rc`, which pushes the tag) |
| R2   | after R1 has been tried in real apps    | further `rc.N` only if fixes are needed                                                                    | owner                                                        |
| R3   | when the RC is clean                    | `2.0.0` on `latest` via the same workflow                                                                  | owner                                                        |
| R4   | after R3                                | issue/PR housekeeping and announcement                                                                     | owner approves each comment                                  |

Nothing is published by hand: the owner decided (2026-10-02) to let the Phase 5 workflow publish the
first release candidate, so the pipeline is proven before `latest` is touched.

`1.x` stays on `1.3.x` for legacy-architecture apps; fixes there are cherry-picked by hand.

---

## Phase 4 — End-to-end tests

### Goals

1. The Phase 3 behaviour contract (28 cases) runs **in CI on a real Android emulator and iOS
   simulator** on every PR, not just on a maintainer's machine.
2. Rendering **content** is regression-tested (rotation, crop box, downscaling), not only
   dimensions and error codes.
3. The "works in Expo development builds" claim is tested, not asserted.

### Decisions

| Decision                         | Choice                                                                                                                                                                                                                                                                                                                                      | Why                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Test driver                      | **Maestro** (`cli-2.11.0`) driving a self-test screen in the example                                                                                                                                                                                                                                                                        | The checks run inside the app via the real public API; Maestro only launches, taps "Run self-test", and asserts the summary and per-case rows. YAML flows, works for both platforms, no test code compiled into the app. |
| Expectations source of truth     | `fixtures/expectations.json` (case → input → expected code or sizes)                                                                                                                                                                                                                                                                        | The self-test screen, unit tests that validate the file, and the README's behaviour table all read the same data — no drift. Moves the table out of the uncommitted `Expectations.tsx`.                                  |
| Getting fixtures onto the device | Bundle `fixtures/*.pdf` in the example app (Android `assets/fixtures` via a Gradle `sourceSets` entry pointing at `../../fixtures`; iOS folder reference in Copy Bundle Resources) and copy them to the app's documents/files dir at startup with **`@dr.pogodin/react-native-fs`** (example-only dependency, maintained, New Architecture) | Self-contained: no `adb push` / `simctl` container hacks in CI, works on any device. The library itself gains no dependency.                                                                                             |
| Build flavour for E2E            | **Release** builds (JS bundled, no Metro)                                                                                                                                                                                                                                                                                                   | Removes the flaky Metro/bundle-download step seen in local runs; faster and closer to production.                                                                                                                        |
| Content regression               | After the Maestro flow, CI pulls the produced JPEGs (`adb exec-out run-as …` / `simctl get_app_container`) and compares them to **per-platform golden JPEGs** in `fixtures/golden/{android,ios}/` with `scripts/compare-goldens.py` (Pillow; mean absolute difference ≤ 2.0 and max ≤ 64 per channel, sizes must match exactly)             | JPEG encoders differ by platform, so goldens are per platform; tolerances absorb encoder noise but catch wrong rotation, crop or scaling. Goldens are regenerated by one script and reviewed as images in the PR.        |
| Expo                             | New smoke job: `create-expo-app` (latest SDK) → install the packed tarball → `expo prebuild` → Android build + iOS build, plus the app's own Jest test                                                                                                                                                                                      | Proves dev-build support and that no config plugin is needed (the library declares no permissions or native config). Expo Go is documented as unsupported.                                                               |
| Emulator / simulator in CI       | `reactivecircus/android-emulator-runner` (API 36, `google_apis`, x86_64, KVM on `ubuntu-latest`); iOS simulator on `macos-latest` booted via `simctl`                                                                                                                                                                                       | Standard, cached AVD snapshot keeps the Android job ~10 min.                                                                                                                                                             |

### Work items (branch `test/e2e`, one commit each)

1. **Expectations data** — move the 28 cases into `fixtures/expectations.json`; add a Jest test
   that validates its schema and that every referenced fixture exists. `test: …`
2. **Self-test screen** — `example/src/SelfTest.tsx` (committed): copies bundled fixtures, runs every
   case through the public API, renders a summary (`testID="selftest-summary"`, text
   `28/28 passed`) and one row per case (`testID="case-<name>"`, PASS/FAIL + details); reachable from
   the example's main screen via a "Run self-test" button. Bundle fixtures on both platforms;
   add `@dr.pogodin/react-native-fs` to the example. `test(example): …`
3. **Maestro flows** — `.maestro/selftest.yaml` (launch → tap → wait for summary → assert
   `28/28 passed`, assert no row contains `FAIL`), `.maestro/picker-android.yaml` (system picker
   → `content://` URI → thumbnail shown; Android only, best-effort locally, not in CI if flaky).
   `test: …`
4. **Golden images** — `scripts/update-goldens.sh` (runs the self-test on a booted device/simulator
   and pulls outputs) and `scripts/compare-goldens.py`; commit initial goldens for rotation, crop,
   mixed-sizes, `maxWidth` cases. `test: …`
5. **CI** — `e2e-android` and `e2e-ios` jobs (release build → Maestro → golden compare; upload
   Maestro artefacts and produced JPEGs on failure); `smoke-expo` job. Required checks updated in
   the PR description for the owner to set in branch protection. `ci: …`

### Verification

- Locally: both Maestro flows green on `Pixel_API_36` and `iPhone 18 Pro`; goldens generated,
  compared against themselves (0 diff) and against a deliberately broken build (e.g. temporarily
  removing the crop handling) to prove the comparison **fails** when rendering is wrong.
- CI: new jobs green on the PR; total wall time recorded in the PR body.
- Negative control in CI: one temporary commit that flips an expectation must turn `e2e-*` red,
  then is reverted before merge (documented in the PR).

---

## Phase 5 — Docs and release

### Goals

1. A user can install, use, and migrate to 2.x from the README and a migration guide alone.
2. Releases are reproducible, provenance-signed, and need no long-lived npm token.

### Work items (branch `docs/2.0`, one commit each)

1. **README rewrite**
   - What it does, platforms, and a **compatibility table**:

     | Version | React Native | Architecture        | iOS                 | Android |
     | ------- | ------------ | ------------------- | ------------------- | ------- |
     | 2.x     | ≥ 0.76       | New Architecture    | RN's minimum (15.1) | API 24  |
     | 1.x     | ≥ 0.60       | Legacy (or interop) | 11                  | API 21  |

   - Installation for bare RN and **Expo development builds** (`npx expo install`, `expo prebuild`,
     no config plugin; not Expo Go).
   - API reference generated from the TypeScript types' TSDoc (`generate`, `generateAllPages`,
     `GenerateOptions`, `ThumbnailResult`, `PdfThumbnailErrorCodes`), accepted inputs, sizing
     formula, crop box/rotation, error table (rendered from `fixtures/expectations.json`'s codes).
   - Recipes: thumbnails for a list (`maxWidth`), all pages with progress-friendly batching
     guidance, caching (app responsibility, with a short example keyed on path + page + options),
     cleaning up cache files, picking files with `@react-native-documents/picker`.
   - Troubleshooting: linking error text and fixes, Android autolinking cache, pods.
   - Fresh demo screenshots from the new example (Android + iOS).
     `docs: …`
2. **`MIGRATION.md` (1.x → 2.0)** — requirements; every behaviour change with before/after
   (error-code table diff, page validation, crop box and rotation size changes, remote URL
   removal, `TypeError` on invalid options, owner-only encrypted PDFs); "staying on 1.x" section.
   Linked from README and the GitHub release. `docs: …`
3. **TSDoc on the public API** — so editor hovers carry the same contract as the README.
   `docs: …`
4. **Release pipeline**
   - `release-it`: `npm.publish: false`, conventional-changelog `infile: CHANGELOG.md`,
     GitHub release on, `preRelease` support documented (`yarn release --preRelease=rc`).
   - `.github/workflows/release.yml`: on tag `v*`, checkout → setup → `yarn prepare` →
     `npm publish --provenance --access public` using **npm trusted publishing (OIDC)**, dist-tag
     derived from the version (`next` for prereleases, `latest` otherwise); `permissions:
id-token: write, contents: read`. Fails if the tag and `package.json` version differ.
   - `CHANGELOG.md` seeded by release-it on the first run.
   - CONTRIBUTING "Releases" section updated. `ci: …` / `docs: …`
   - Owner one-time setup (documented, not automatable): configure the trusted publisher for
     `songsterq/react-native-pdf-thumbnail` + `release.yml` on npmjs.com; then revoke any old
     automation tokens.
5. **Package metadata** — `description`, `keywords` (`pdf`, `thumbnail`, `pdfkit`, `pdfrenderer`,
   `turbo-module`, `new-architecture`, `expo`), `funding` if wanted; GitHub topics (owner).
   `chore: …`

### Verification

- `npm pack` / `yarn pack` contents reviewed (no fixtures, goldens, plans, example).
- README code samples type-checked: extracted into a scratch `.tsx` and run through `tsc`
  against the built package.
- Release dry run: `yarn release --dry-run` locally; the workflow's first real run is
  `2.0.0-rc.1` (R1), before the final tag.
- `npm view react-native-pdf-thumbnail@next` shows provenance after the workflow publish.

### Housekeeping after 2.0.0 (R4, each comment approved by the owner)

| Item                                       | Action                                              |
| ------------------------------------------ | --------------------------------------------------- |
| #72 crop box, #73 password, #77 large PDFs | close as fixed in 2.0.0                             |
| #80 remote URL, PR #83                     | close as declined with rationale + recipe link      |
| #71 caching                                | close as declined with the README caching recipe    |
| #74 linking on RN 0.64                     | close: use 1.x; link compatibility table            |
| Stale Dependabot PRs                       | close any superseded ones                           |
| Announcement                               | GitHub release notes for 2.0.0 linking MIGRATION.md |

## Execution

Same split as earlier phases: Codex implements each phase from this plan (offline material
prepared first — the RN/Expo template output and current Maestro docs snapshot); Claude commits,
runs local device verification, and drives CI. Phase 4 first, then Phase 5; Phase 5's README
draft can start in parallel since it does not touch the same files.

## Phase 4 implementation notes (2026-10-02)

- Self-test exports its results and output JPEGs to storage readable without `run-as`
  (Android `ExternalDirectoryPath/selftest`, iOS documents dir), because E2E uses release builds.
- Android bundles only `fixtures/*.pdf` as assets (a `copyFixtureAssets` Gradle task), not the README,
  JSON or golden images. iOS uses a folder reference to `fixtures/` (the extra small files are harmless).
- Golden cases are listed once in `fixtures/golden-cases.json` (11 images per platform).
- Pinned: `android-emulator-runner` v2.38.0, `upload-artifact` v7.0.1 (latest at the time).

### Local verification

| Check                                                           | Result                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Maestro `selftest.yaml`, release builds                         | Android 16 emulator **28/28**; iOS 27 simulator **28/28**                                                       |
| Golden images generated and reviewed                            | 11 per platform; rotation, crop, mixed sizes, downscaling correct on both                                       |
| Golden negative control (Android renderer without white fill)   | Maestro still 28/28 (metadata unchanged), **golden compare 0/11 → fails** as required                           |
| Golden positive re-run after restoring code                     | 11/11, zero pixel difference (deterministic)                                                                    |
| Expo smoke, Android (SDK 57 / RN 0.86.3, `blank-typescript`)    | prebuild without config plugin, release build OK, `PdfThumbnailPackage` autolinked; template has no test script |
| `yarn lint` / `typecheck` / `test` (76) / `install --immutable` | pass                                                                                                            |

Not yet verified locally: the Android DocumentsUI picker flow (local-only by design), Expo iOS, and
the CI emulator/simulator jobs themselves — covered by the PR's CI run.

## Phase 5 decision update (2026-10-03)

- The publish job runs in the GitHub environment **`npm-release`** (created 2026-10-03): required
  reviewer `songsterq` (self-review allowed), deployments restricted to tags matching `v*`. Every
  publish therefore waits for the owner's approval in the Actions tab.
- npm trusted publisher (owner configures on npmjs.com): owner `songsterq`, repository
  `react-native-pdf-thumbnail`, workflow `release.yml`, environment `npm-release`, allowed action
  `npm publish`. After the first successful workflow publish: Publishing access → "Require
  two-factor authentication and disallow tokens".
- README screenshots are captured by Claude on devices into `docs/images/` (Codex references the paths).
