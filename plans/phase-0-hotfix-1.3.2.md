# Phase 0 — 1.3.2 hotfix

Part of the catch-up plan (Phase 0 → 5). Phase 0 ships a **patch release on the
current 1.x codebase** so existing users are unblocked before the tooling reset
(Phase 1) and the New Architecture rewrite (Phase 2, v2.0.0).

## Goals

1. Android builds again on React Native ≥ 0.76 (issue #81) and on AGP 9 (PR #95).
2. Android no longer crashes the app on password-protected PDFs (#73), unexpected
   runtime exceptions, or out-of-memory on large pages (#77); every failure path
   rejects the promise instead.
3. Android peak memory per page is halved (#77).
4. The podspec `:source` tag matches the tags release-it actually creates.
5. CI actually runs, is green, and proves the library builds in a freshly
   generated app on the oldest and newest React Native versions we care about.

## Non-goals (deferred)

| Item | Phase |
|---|---|
| iOS `.cropBox` instead of `.mediaBox` (#72) — changes output dimensions | 3 |
| iOS locked/password-protected document handling (#73 on iOS) | 3 |
| Down-scaling / `maxWidth` options for large PDFs (#77) | 3 |
| Cross-platform error-code consistency (e.g. `INVALID_FILE` for corrupt PDFs) | 3 |
| TurboModule / codegen, removing `AndroidManifestNew.xml` & `supportsNamespace()` | 2 |
| Toolchain upgrades (Yarn 4, bob 0.4x, ESLint 9, example app regeneration) | 1 |
| Dependabot PRs #84–#94, PR #83 | 1 (closed after lockfile regen) / declined |

## Semver contract for 1.3.2

1.3.2 is a strict patch: **no input that rejects today may reject with a different
code**. New codes are only introduced for paths that currently crash the app.
Existing codes stay as they are: `FILE_NOT_FOUND`, `INVALID_PAGE`, `INTERNAL_ERROR`.

| Situation (Android) | Today | 1.3.2 |
|---|---|---|
| Unsupported path form / null descriptor | `FILE_NOT_FOUND` | unchanged |
| `IOException` (incl. `FileNotFoundException`, corrupt PDF) | `INTERNAL_ERROR` | unchanged |
| `PdfRenderer(...)` throws `SecurityException` (password / unsupported security) | **crash** | `PASSWORD_PROTECTED` |
| `OutOfMemoryError` while allocating/rendering a page | **crash** | `OUT_OF_MEMORY` |
| Any other `Exception` (e.g. `SecurityException` from `ContentResolver`, `IllegalArgumentException`, `IllegalStateException`) | **crash** | `INTERNAL_ERROR` |

## Work items

Work on a local branch `fix/1.3.2-hotfix` off `master`. One logical change per
commit, Conventional Commits messages (commitlint enforces this). Do **not** add
any `Co-Authored-By` trailer. Do **not** bump `package.json` version (release-it
does that at release time).

### 1. Merge community PR #95 (AGP 9 built-in Kotlin)

Preserve the contributor's authorship and let GitHub auto-close the PR when it
lands on `master`:

```bash
git fetch origin pull/95/head:pr-95
git merge --no-ff pr-95 -m "Merge pull request #95 from gabrieldonadel/fix/agp9-built-in-kotlin-songsterq"
```

Expected diff: only `android/build.gradle`, wrapping `apply plugin: "kotlin-android"`
in `if (project.extensions.findByName('kotlin') == null)`.

### 2. Fix the Android namespace (#81)

`android/build.gradle` declares `namespace "com.pdfthumbnail"` while the Kotlin
sources and the legacy manifest use `org.songsterq.pdfthumbnail`. React Native
CLI autolinking (RN ≥ 0.76) derives the `PackageList` import from the namespace,
producing `import com.pdfthumbnail.PdfThumbnailPackage;`, which does not exist.

- Change to `namespace "org.songsterq.pdfthumbnail"`.
- **Keep** `supportsNamespace()`, `AndroidManifest.xml` (with `package=`) and
  `AndroidManifestNew.xml` — 1.x still supports AGP < 7.3 hosts. Removal is Phase 2.

Commit: `fix(android): align namespace with Kotlin package for autolinking`

### 3. Stop applying the React Native Gradle plugin in the library

`android/build.gradle` applies `com.facebook.react` when `newArchEnabled=true`
(the default since RN 0.76). The library has no codegen spec and no
`codegenConfig`, so the plugin has nothing to do and only adds a failure surface
on new-arch hosts. Dependency substitution of `react-native:+` →
`react-android` is configured by the **app's** plugin across all projects, so it
is unaffected.

- Remove `isNewArchitectureEnabled()` and the conditional `apply plugin: "com.facebook.react"`.
- Validated by the smoke-test jobs in item 7 (new-arch hosts). If those show the
  plugin is in fact needed, revert this commit and note why in the PR.

Commit: `fix(android): do not apply the React Native gradle plugin to the library`

### 4. Harden Android error handling (#73, crash paths)

File: `android/src/main/java/org/songsterq/pdfthumbnail/PdfThumbnailModule.kt`.

- Factor the duplicated open/close logic of `generate` and `generateAllPages` into
  one private helper (e.g. `withRenderer(filePath, promise) { renderer -> ... }`)
  so both methods share identical error handling and cleanup.
- Construct `PdfRenderer` in its own `try` so a `SecurityException` from it maps
  to `PASSWORD_PROTECTED` and is distinguishable from a `SecurityException`
  thrown by `ContentResolver.openFileDescriptor` (permission denial → `INTERNAL_ERROR`).
- Catch order: `IOException` → `INTERNAL_ERROR` (unchanged); `OutOfMemoryError`
  → `OUT_OF_MEMORY`; `Exception` → `INTERNAL_ERROR`. Do not catch `Throwable`
  broadly — only `OutOfMemoryError` among `Error`s.
- Always pass the throwable to `promise.reject(code, message, throwable)` and
  give a human-readable message (include the file path, as existing messages do).
- Guarantee exactly one `resolve`/`reject` per call on every path.
- Cleanup must run on every path, including mid-render failures:
  - `PdfRenderer.Page` closed in `finally` (today a throwing `render` leaks the
    open page, and the next `openPage` on that renderer throws `IllegalStateException`).
  - `PdfRenderer` and `ParcelFileDescriptor` closed in `finally` (as today).
  - `FileOutputStream` via `.use { }`.
  - Bitmap recycled in `finally`.
  - Use explicit `try/finally` for `PdfRenderer` / `PdfRenderer.Page`; do **not**
    rely on `AutoCloseable.use` (needs Kotlin ≥ 1.8 stdlib; the default here is 1.7).
- If writing the JPEG fails part-way, delete the partially written output file.
- Check `Bitmap.compress(...)`'s boolean result; `false` → `INTERNAL_ERROR`.

Commit: `fix(android): reject instead of crashing on protected PDFs and runtime errors`

### 5. Halve Android memory per page (#77)

`renderPage` allocates a full-size ARGB_8888 bitmap, erases it to white, renders,
then copies it into a **second** full-size bitmap via `Canvas` "to add a white
background". The copy has been redundant since c2c1f41 moved `eraseColor(WHITE)`
before `render` — and it never added white anyway (the new bitmap starts
transparent).

- Delete the second bitmap and `Canvas`; compress the original bitmap directly.
- Drop now-unused imports (`Canvas`).

Commit: `perf(android): drop redundant full-size bitmap copy when rendering`

### 6. Fix podspec source tag

release-it creates tags `v${version}` (`v1.3.1` exists; `1.3.1` does not).

- `s.source = { :git => "...", :tag => "v#{s.version}" }`
- Remove trailing whitespace on the `end` line while there.

Commit: `fix(ios): point podspec source tag at the v-prefixed release tags`

### 7. Make CI run, and prove the fix on fresh apps

`.github/workflows/ci.yml` triggers on `main`; the branch is `master`, so CI has
never run.

- Triggers: `push` to `master` and `1.x`; `pull_request` to `master` and `1.x`.
  Add `concurrency` (cancel in-progress for the same ref) and least-privilege
  `permissions: contents: read`.
- Bump actions to current majors: `actions/checkout`, `actions/setup-node`,
  `actions/cache`, `actions/setup-java` (verify latest major tags exist).
- `.nvmrc` → `v22` (Node 18 is EOL; new RN versions require ≥ 22.13).
- `setup-java`: `zulu`, `17`.
- Keep the existing `lint`, `test`, `build-library`, `build-android`, `build-ios`
  jobs (example app on RN 0.72). If `build-ios` fails because the hosted Xcode
  can no longer build RN 0.72 (a toolchain problem unrelated to this library),
  pin an older Xcode/runner if one is still available; otherwise set
  `continue-on-error: true` with a comment pointing to Phase 1 (example app
  regeneration). Do not silently skip it.
- **New `smoke` jobs** — install the packed library into a freshly generated app,
  which is exactly what users do and what broke in #81:
  - Matrix `rn: ['0.76', 'latest']` × platform (`android` on `ubuntu-latest`,
    `ios` on `macos-latest`).
  - Steps: setup → `yarn prepare` → `npm pack` → in `$RUNNER_TEMP`
    `npx @react-native-community/cli@latest init SmokeApp --version <rn> --skip-git-init --install-pods false --pm npm`
    → `npm install <tarball>` → modify `App.tsx` to import the library and call
    `PdfThumbnail.generate` (so Metro bundling of the import is exercised) →
    build:
    - Android: `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` (JDK 17).
    - iOS: `bundle install && bundle exec pod install`, then `xcodebuild` Debug
      for `iphonesimulator`, no code signing.
  - Assert autolinking: on Android, `grep` the generated `PackageList.java` for
    `import org.songsterq.pdfthumbnail.PdfThumbnailPackage;`.
  - Use Node 22 explicitly in these jobs.

Commits: `ci: run on master and modernize actions`, `ci: add fresh-app smoke builds on RN 0.76 and latest`

### 8. Test

`src/__tests__/index.test.tsx` is `it.todo`. Add real JS tests (Jest, existing
`react-native` preset), mocking `NativeModules.PdfThumbnail`:

- `generate` forwards `filePath`, `page`, and quality defaulting to 80.
- Quality is clamped to `[0, 100]` for both methods.
- `generateAllPages` forwards correctly.
- Calling a method when the native module is missing throws the linking error.

Commit: `test: cover JS wrapper argument handling`

### 9. Docs

- README: add an **Error codes** section listing all codes and when each occurs
  (Android: `PASSWORD_PROTECTED`, `OUT_OF_MEMORY` new in 1.3.2; iOS unchanged).
- Do not hand-edit a CHANGELOG — release-it's conventional-changelog generates it.

Commit: `docs: document error codes`

## Verification

Local (this machine has Node 22 and Xcode 27; no JDK, Android SDK or CocoaPods):

- `yarn install` succeeds (lockfile may change only if strictly necessary — explain why).
- `yarn lint`, `yarn typecheck`, `yarn test`, `yarn prepare` all pass.
- Kotlin can't be compiled locally; review it carefully for Kotlin 1.7 compatibility.

CI (on the PR — this is the real native gate):

- All jobs green, including the four `smoke` combinations, or `build-ios` is
  explicitly marked `continue-on-error` with justification.
- Android smoke log shows the `PackageList.java` assertion passing on both RN versions.

Manual runtime check (owner, before release, on an Android emulator using the example app):

- Normal PDF → thumbnail renders with white background.
- Password-protected PDF → promise rejects with `PASSWORD_PROTECTED`; app keeps running.
- Large multi-page PDF via `generateAllPages` → no crash.

## Release (owner)

1. Merge the PR into `master` (squash is **not** allowed — it would lose PR #95's merge commit).
2. `yarn release` → choose patch → publishes `1.3.2`, tags `v1.3.2`, creates the GitHub release.
3. `git branch 1.x v1.3.2 && git push origin 1.x` — the maintenance line for
   old-architecture users before Phase 1 starts rewriting `master`.
4. Comment on and close #81 and #73 (Android part; keep #73 open for iOS → Phase 3).
   Leave #77 open (partial fix; full fix in Phase 3).

## Deliverable from the implementer

- Branch `fix/1.3.2-hotfix` with the commits above, **not pushed**.
- A short report: what changed per item, local verification output, anything
  deviating from this plan and why, and any risk to watch in CI.

## Implementation notes (2026-10-02)

Deviations found during implementation and local verification:

- **Smoke matrix uses `0.76.9`, not `0.76`** — the RN CLI `init --version` needs an exact version.
- **RN 0.76 × iOS excluded from the smoke matrix** — RN 0.76's bundled `fmt` fails with `consteval`
  errors on current Xcode (27); unrelated to this library. RN latest × iOS covers the iOS build.
- **Autolinking assertion matches the class name, not the import line** — RN 0.76 emits
  `import org.songsterq.pdfthumbnail.PdfThumbnailPackage;`, RN 0.87 emits the fully
  qualified name inline. The check also asserts `com.pdfthumbnail.` is absent.
- **`build-ios` (RN 0.72 example) is `continue-on-error`** — its pod scripts pass `quirks_mode` to
  `JSON.parse` (rejected by current json gems) and its 12.4 deployment target is below Xcode 27's
  minimum of 15.0. Regenerating the example is Phase 1.
- **Close failures are ignored, not reported** — once thumbnails are written, a failure closing the
  renderer/descriptor must not turn success into a rejection.
- **lefthook pre-commit is a no-op on unpushed branches** (`git diff @{push}` fails) — fix in Phase 1.

Local verification results:

| Check | Result |
|---|---|
| `yarn lint` / `typecheck` / `test` (8 tests) / `prepare` | pass |
| Example app (RN 0.72) Android build | pass; `PackageList` imports `org.songsterq.pdfthumbnail.PdfThumbnailPackage` |
| Fresh RN 0.76.9 app — Android | pass, autolinking assertion passes |
| Fresh RN 0.87.1 app — Android / iOS | pass / pass |
| Runtime on Android 16 emulator (RN 0.87.1, interop layer) | normal → OK 612×792 (white background); password-protected → `PASSWORD_PROTECTED`; 14400×14400 page → OK, no crash; missing file → `INTERNAL_ERROR` (unchanged); 300-page `generateAllPages` → OK; app never crashed |

Not exercised: the `OUT_OF_MEMORY` path (the emulator had enough native heap for an ~830 MB bitmap).
