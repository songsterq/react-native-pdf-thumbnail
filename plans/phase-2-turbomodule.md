# Phase 2 — TurboModule rewrite (v2.0.0, New Architecture only)

Part of the catch-up plan (Phase 0 → 5). Phase 1 (PR #97) gives a current toolchain and an
RN 0.87 example. Phase 2 replaces the legacy bridge module with a codegen-backed
**TurboModule** on both platforms, so the library no longer depends on React Native's
legacy-module interop layer (deprecated; the legacy architecture itself was removed in RN 0.82).

## Goals

1. A codegen spec is the single source of truth for the native interface.
2. Android: Kotlin TurboModule extending the generated `NativePdfThumbnailSpec`.
3. iOS: Objective-C++ TurboModule conforming to the generated `NativePdfThumbnailSpec`,
   replacing Swift + bridging header.
4. **Behaviour parity with 1.3.2**: same JS API, same results, same error codes and messages.
   Behaviour changes (crop box, iOS password handling, options) are Phase 3, so a regression
   in this phase is unambiguous.
5. Rendering never blocks other native modules or the JS thread.

## Non-goals (deferred)

| Item                                                                                               | Phase                                                                   |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `.cropBox` on iOS (#72), iOS `PASSWORD_PROTECTED` (#73), `INVALID_FILE`, options/downscaling (#77) | 3                                                                       |
| Maestro E2E suite with fixture PDFs                                                                | 4                                                                       |
| README compatibility table, 1.x → 2.0 migration guide, Expo dev-build docs, trusted publishing     | 5                                                                       |
| Releasing 2.0.0                                                                                    | after Phase 3 (crop-box dimensions and iOS rejection are also breaking) |

## Decisions

| Decision                        | Choice                                                            | Why                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architectures                   | New Architecture only                                             | RN removed the legacy architecture in 0.82; supporting both doubles native code. `1.x` serves legacy apps.                                                                                                                                                                                                         |
| `peerDependencies.react-native` | `>= 0.76.0`                                                       | First release with the New Architecture on by default and the current codegen/`BaseReactPackage`/`install_modules_dependencies` APIs. CI smoke-tests 0.76.9 (Android) and latest (Android + iOS); RN 0.76–0.78 iOS can't be built with current Xcode (upstream `fmt` issue), which the README will state honestly. |
| iOS language                    | Objective-C++ (`.mm`)                                             | The template has no Swift option for TurboModules; an ObjC++ class conforms to the generated spec directly, no Swift/C++ bridging layer, no `-Swift.h`/module-map fragility. ~100 lines of PDFKit.                                                                                                                 |
| Spec numeric types              | `number` (→ `double`), converted natively                         | `CodegenTypes.Int32` via `import { CodegenTypes } from 'react-native'` is not available to RN 0.76's codegen, which parses this spec in consumer apps. `number` parses on every supported version. Native side rounds and validates.                                                                               |
| Module lookup in JS             | `TurboModuleRegistry.get` + lazy, descriptive error               | `getEnforcing` throws at import time, crashing apps (e.g. Expo Go, or New Architecture disabled on 0.76–0.81) before any `try/catch`. Keep 1.x's call-time error, reworded to name the New Architecture requirement.                                                                                               |
| Pod name / podspec file         | Keep `react-native-pdf-thumbnail.podspec`                         | Renaming to the template's `PdfThumbnail` churns every consumer's `Podfile.lock` for no benefit. Contents follow the template.                                                                                                                                                                                     |
| Android namespace / package     | Keep `org.songsterq.pdfthumbnail`                                 | Phase 0 fix; `codegenConfig.android.javaPackageName` matches.                                                                                                                                                                                                                                                      |
| Android threading               | Dedicated single-thread executor, shut down in `invalidate()`     | Async TurboModule methods run on the shared native-modules thread; a 300-page `generateAllPages` would block every other module. Serial keeps memory bounded (one page bitmap at a time).                                                                                                                          |
| iOS threading                   | Module-owned serial `dispatch_queue`, `@autoreleasepool` per page | Same isolation; per-page pools stop a long run accumulating `UIImage`/`NSData`.                                                                                                                                                                                                                                    |

## Work items

Branch `feat/turbomodule` off `master` **after PR #97 merges**. One commit per item,
Conventional Commits, no `Co-Authored-By`. Breaking commits use `feat!:`/`BREAKING CHANGE:`
footers so release-it's changelog flags them.

### 1. Codegen spec and JS entry

- `src/NativePdfThumbnail.ts`:
  ```ts
  import { TurboModuleRegistry, type TurboModule } from 'react-native';

  export type ThumbnailResult = { uri: string; width: number; height: number };

  export interface Spec extends TurboModule {
    generate(
      filePath: string,
      page: number,
      quality: number
    ): Promise<ThumbnailResult>;
    generateAllPages(
      filePath: string,
      quality: number
    ): Promise<ThumbnailResult[]>;
  }

  export default TurboModuleRegistry.get<Spec>('PdfThumbnail');
  ```
- `package.json` `codegenConfig`: `name: "PdfThumbnailSpec"`, `type: "modules"`,
  `jsSrcsDir: "src"`, `android.javaPackageName: "org.songsterq.pdfthumbnail"`.
- `src/index.tsx`: same public API (default class with static `generate` /
  `generateAllPages`, exported `ThumbnailResult` type, quality default 80 and clamp 0–100,
  page passed through). Linking error now says the package needs the New Architecture
  (RN ≥ 0.76), a rebuild, and is unavailable in Expo Go.
- `peerDependencies.react-native` → `>= 0.76.0`.
- Tests: mock `TurboModuleRegistry.get` instead of `NativeModules`; keep every existing
  assertion; add one asserting the linking error mentions the New Architecture.

Commit: `feat!: define the native interface with a codegen TurboModule spec`

### 2. Android TurboModule

- `android/build.gradle` → template shape: `ext.PdfThumbnail` defaults (Kotlin 2.x,
  minSdk 24, compileSdk 36), `getExtOrDefault`, AGP/Kotlin classpath, the AGP 9
  `kotlin` extension guard from #95, `apply plugin: "com.facebook.react"` (now needed for
  codegen), `namespace "org.songsterq.pdfthumbnail"`, Java 17, `implementation "com.facebook.react:react-android"`.
  Delete `android/gradle.properties`' obsolete `PdfThumbnail_*` keys if unused.
- Manifests: delete `AndroidManifestNew.xml`; `AndroidManifest.xml` without `package=`;
  drop `supportsNamespace()`.
- `PdfThumbnailModule.kt` extends `NativePdfThumbnailSpec`:
  - Port the Phase 0 logic **unchanged in behaviour** (`withRenderer`, error mapping,
    `PASSWORD_PROTECTED`, `OUT_OF_MEMORY`, cleanup, partial-file deletion, white background,
    output naming).
  - `page`/`quality` arrive as `Double`: convert with `toInt()` (truncation), exactly what
    1.x's bridge did for `Int` parameters. Non-finite `page` → `INVALID_PAGE`. Stricter
    validation (rejecting non-integral pages) is a behaviour change and belongs to Phase 3.
  - Run work on a module-owned `Executors.newSingleThreadExecutor()` (named thread);
    `invalidate()` shuts it down.
  - `Arguments.createMap()` / `createArray()` instead of `WritableNative*`.
- `PdfThumbnailPackage.kt` → `BaseReactPackage` with `ReactModuleInfo(isTurboModule = true)`.

Commit: `feat(android)!: implement the module as a TurboModule`

### 3. iOS TurboModule

- Delete `ios/PdfThumbnail.swift`, `ios/PdfThumbnail-Bridging-Header.h`.
- `ios/PdfThumbnail.h`: `#import <PdfThumbnailSpec/PdfThumbnailSpec.h>`,
  `@interface PdfThumbnail : NSObject <NativePdfThumbnailSpec>`.
- `ios/PdfThumbnail.mm`: port the Swift logic **unchanged in behaviour** (`.mediaBox`,
  `PDFPage thumbnailOfSize:forBox:`, JPEG via `UIImageJPEGRepresentation`, caches dir,
  `<file>-thumbnail-<page>-<random>.jpg`, same reject codes/messages), plus:
  - `getTurboModule:` returning `NativePdfThumbnailSpecJSI`; `+moduleName` → `PdfThumbnail`.
  - Own serial queue (`-methodQueue`), `@autoreleasepool` per page.
  - Truncate `page`/`quality` to `NSInteger` as 1.x's bridge did; non-finite `page` →
    `INVALID_PAGE`; range check stays PDFKit's (`pageAtIndex:` returning nil).
- Podspec → template contents under the existing filename: `min_ios_version_supported`,
  `source_files "ios/**/*.{h,m,mm,cpp}"`, `private_header_files "ios/**/*.h"`,
  `install_modules_dependencies(s)`, frameworks `PDFKit`; keep the `v#{s.version}` tag.

Commit: `feat(ios)!: implement the module as an Objective-C++ TurboModule`

### 4. Example, CI and docs touch-ups

- Example needs no code change; regenerate pods (`Podfile.lock`) for the renamed sources.
- CI: smoke jobs keep the autolinking assertion and add a codegen assertion — the fresh
  app's generated sources contain `NativePdfThumbnailSpec` (Android: under
  `node_modules/react-native-pdf-thumbnail/android/build/generated/source/codegen`; iOS:
  `ios/build/generated/ios/PdfThumbnailSpec`).
- README "Installation"/requirements: RN ≥ 0.76 with the New Architecture; 1.x for legacy apps.
  (Full compatibility table and migration guide are Phase 5.)

Commit: `ci: assert codegen output in smoke builds` and `docs: state 2.x requirements`

## Verification

**Parity harness.** Before touching native code, record 1.3.2 behaviour as the baseline, then
compare after each platform rewrite. Cases, on Android emulator and iOS simulator, using the
Phase 0 fixtures (normal, password-protected, 300-page, 14400×14400 page) plus a missing
file and an out-of-range page:

| Case                           | Baseline (1.3.2) to record                       | 2.x must match                                         |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------ |
| normal p0                      | dims, `uri` pattern, JPEG is white-background    | identical dims & pattern; pixel diff within JPEG noise |
| `generateAllPages` (300 pages) | count, time                                      | count; time not worse by > 20 %                        |
| password-protected             | Android `PASSWORD_PROTECTED`; iOS resolves blank | identical (iOS fix is Phase 3)                         |
| missing file                   | Android `INTERNAL_ERROR`; iOS `FILE_NOT_FOUND`   | identical                                              |
| page −1 / page = count         | `INVALID_PAGE` (both)                            | identical                                              |
| huge page                      | Android OK; iOS OK/behaviour recorded            | identical                                              |
| quality 0 / 100                | file size ordering                               | same ordering                                          |

Drive it with a temporary **parity screen** in the example (not committed, or behind a dev-only
route removed before merge) that runs every case and logs one JSON line per case, so baseline
vs. new is a mechanical diff rather than screenshots.

Also:

- `yarn lint` / `typecheck` / `test` / `prepare`; tarball contains no Swift, no bridging header.
- Example `build:android` / `build:ios`; codegen output present in both.
- Main/JS thread not blocked: while `generateAllPages` (300 pages) runs, a JS `setInterval`
  counter in the parity screen keeps ticking.
- Fresh-app smoke (CI and local): RN 0.76.9 Android, RN latest Android + iOS, plus each app's
  own Jest test.
- Negative check: a fresh RN 0.81 app with `newArchEnabled=false` gets the descriptive
  linking error at call time, not a crash at import.

## Execution notes

- Same split as Phases 0–1: Codex edits the working tree and writes per-item patches; Claude
  commits, runs installs/pods/native builds, the parity harness, and CI.
- Prepare offline material for Codex first: the RN 0.87.1 template reference (already at
  `/private/tmp/pdf-thumbnail-phase1-ref/template`) and the generated codegen headers/classes
  from a local example build, so it can write against the real generated signatures.
- Record the parity baseline **before** Codex starts, from the current `master` build.

## Implementation notes (2026-10-02)

- Codegen output for the spec was generated with RN 0.87.1 and handed to Codex so the native code was
  written against real signatures. RN 0.76.9's codegen parses the same spec into an identical schema.
- **Autolinking cache trap (local only).** The RN Gradle plugin caches `autolinking.json` keyed on the
  _app's_ `package.json`/`react-native.config.js`. The example links the library by path, so adding
  `codegenConfig` did not invalidate it and the module silently failed to register (`TurboModuleRegistry.get`
  → null). Consumers are unaffected (bumping the dependency changes their `package.json`). Documented in
  CONTRIBUTING: delete `example/android/build/generated/autolinking` after codegen changes.
- **Legacy architecture on RN 0.81 (Android) actually works**: TurboModuleRegistry falls back to the
  bridge, and the generated spec extends `ReactContextBaseJavaModule`. Officially still unsupported
  (untested, may break; use 1.x). The plan's requirement — no crash at import — holds.

### Parity results (1.3.2 baseline vs. TurboModule, Android 16 emulator + iOS 27 simulator)

| Check                                                                                 | Result                                                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 24 cases (12 × 2 platforms): results, error codes, messages, dimensions, URI patterns | 23 identical; 1 intended difference (iOS page −1 message now says `-1` instead of `4294967295`)              |
| Output JPEGs (11 files incl. 14400×14400 and quality 0/100)                           | byte-identical sizes, zero pixel difference                                                                  |
| `generateAllPages` 300 pages                                                          | Android 3535 → 3625 ms (+2.5 %), iOS 299 → 266 ms                                                            |
| JS thread during 300-page run                                                         | interval ticks unchanged (Android 50 → 50, iOS 4 → 4)                                                        |
| Android huge page timing                                                              | 6174 → 8910 ms, single sample taken at emulator load average 9.8 — treated as noise, not a regression signal |

### Other verification

| Check                                                        | Result                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `yarn lint` / `typecheck` / `test` (11) / `prepare`          | pass                                                                                              |
| Tarball                                                      | `.kt`, `.h`, `.mm`, spec in `src` + `lib`; no Swift, no bridging header                           |
| Example Android / iOS build with codegen                     | pass; `NativePdfThumbnailSpec.java` and `PdfThumbnailSpec.h` generated                            |
| Fresh RN 0.76.9 app, Android                                 | builds; library Kotlin (incl. positional `ReactModuleInfo`) compiles; module in `autolinking.cpp` |
| Fresh RN 0.81.6 app, `newArchEnabled=false`, Android release | no import crash; calls reach native (rejects with the real ENOENT error)                          |
