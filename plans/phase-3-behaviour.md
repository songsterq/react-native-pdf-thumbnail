# Phase 3 — Correct, consistent behaviour (completes the 2.0.0 feature set)

Part of the catch-up plan (Phase 0 → 5). Phase 2 (PR #104) made the module a TurboModule with
byte-for-byte parity to 1.3.2. Phase 3 is where behaviour is allowed to change: fix the remaining
platform bugs, make both platforms behave the same, and add the one API the issues ask for.
Everything here ships in **2.0.0**, so breaking changes are acceptable if they are deliberate,
documented, and flagged with `BREAKING CHANGE:` footers.

## Goals

1. **Same input → same outcome on Android and iOS**: same success/failure, same error code, same
   output dimensions.
2. Fix the open bugs: iOS crop box (#72), iOS password-protected PDFs (#73), rotated pages.
3. Let callers bound output size so large pages stop exhausting memory (#77).
4. Public, typed error codes.

## Non-goals

| Item                                            | Decision                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Remote URLs (#80, PR #83)                       | Declined (agreed earlier). Rejected with a clear code; downloading is the app's job. |
| Thumbnail cache (#71)                           | Declined (agreed earlier). Results are plain file URIs; apps can cache.              |
| Password parameter to unlock PDFs               | Not requested; can be added later without breaking the API.                          |
| Output formats other than JPEG, page ranges     | Not requested.                                                                       |
| Maestro E2E suite                               | Phase 4 (this phase adds the fixtures it will use).                                  |
| Migration guide, compatibility table, Expo docs | Phase 5.                                                                             |

## Behaviour contract for 2.x

### Inputs

| Input                    | Rule (both platforms)                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filePath`               | `file://` URI or absolute path on both; `content://` on Android. Anything else (`http(s)://`, `ph://`, relative paths, empty) → `UNSUPPORTED_URI`.                                                                                                                                                                                                                |
| `page`                   | Integer ≥ 0, validated **in JS** before calling native → otherwise `INVALID_PAGE`. Native still rejects `page ≥ pageCount` with `INVALID_PAGE`. (1.x silently truncated `1.7` → page 1.)                                                                                                                                                                          |
| `quality`                | Number, clamped to 0–100, default 80 (unchanged).                                                                                                                                                                                                                                                                                                                 |
| `maxWidth` / `maxHeight` | Optional positive numbers. The page is scaled down, preserving aspect ratio, to fit inside the box; never scaled up. Omitted → no limit (1.x behaviour). `scale = min(1, maxWidth / w, maxHeight / h)`; output size = `max(1, round(w × scale))` × `max(1, round(h × scale))`, computed once (in JS-visible terms) and implemented identically on both platforms. |

### Rendering

- **Page box: crop box** on both platforms (what PDF viewers display). Android's `PdfRenderer`
  already does this; iOS switches from `.mediaBox` to `.cropBox` (#72).
- **Rotation (`/Rotate`)** is applied on both platforms; `width`/`height` are the rotated
  (as-displayed) dimensions.
- White background (unchanged).
- `width` / `height` in the result are the **pixel dimensions of the written JPEG**. Unscaled, that
  is 1 px per PDF point (current behaviour on both platforms, now documented).

### Error codes (exported as a TypeScript union and a frozen constant object)

| Code                 | When                                                | Change vs 1.x                                                                            |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `UNSUPPORTED_URI`    | `filePath` scheme/form not supported                | **new** (Android returned `FILE_NOT_FOUND`; iOS tried to load remote URLs synchronously) |
| `FILE_NOT_FOUND`     | file does not exist or cannot be opened for reading | Android missing file was `INTERNAL_ERROR`                                                |
| `INVALID_FILE`       | file exists but is not a readable PDF               | **new** (Android `INTERNAL_ERROR`; iOS `FILE_NOT_FOUND`)                                 |
| `PASSWORD_PROTECTED` | PDF needs a password to open                        | iOS used to **resolve with a blank image** (#73)                                         |
| `INVALID_PAGE`       | `page` not an integer ≥ 0, or ≥ page count          | non-integers now rejected                                                                |
| `OUT_OF_MEMORY`      | allocation for the page bitmap failed               | Android only (iOS cannot catch it); documented                                           |
| `INTERNAL_ERROR`     | writing the JPEG or anything unexpected             | unchanged                                                                                |

All rejections keep a human-readable `message` naming the file (and page where relevant).

### API

```ts
type GenerateOptions = { quality?: number; maxWidth?: number; maxHeight?: number };

PdfThumbnail.generate(filePath, page, options?: GenerateOptions | number)
PdfThumbnail.generateAllPages(filePath, options?: GenerateOptions | number)
```

A bare `number` third argument keeps meaning `quality`, so 1.x call sites compile and behave the
same. Exports: default class (unchanged), `ThumbnailResult`, `GenerateOptions`,
`PdfThumbnailErrorCode` (union) and `PdfThumbnailErrorCodes` (constant object).

## Decisions

| Decision                                                          | Choice                                                                                                           | Why                                                                                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Where to validate `page` / `quality` / sizes                      | JS, before the native call                                                                                       | One implementation, identical on both platforms, unit-testable; native only checks what needs the document (range, password). |
| Spec change for sizes                                             | Add positional `maxWidth: number, maxHeight: number` (0 = unlimited) to both spec methods                        | Plain numbers parse on every supported codegen version (Phase 2 finding); an object param adds codegen surface for no gain.   |
| Default size limit                                                | None                                                                                                             | A default cap would silently change outputs for existing callers. README recommends `maxWidth`/`maxHeight` for thumbnails.    |
| Downscaled rendering on Android                                   | Render directly at the target size (`PdfRenderer.Page.render` with a scaling `Matrix` into a target-size bitmap) | Avoids allocating the full-size bitmap first — the actual fix for #77.                                                        |
| Downscaled rendering on iOS                                       | `PDFPage.thumbnail(of: targetSize, for: .cropBox)`                                                               | Same API as today, just a smaller size.                                                                                       |
| Encrypted PDFs that open without a password (owner password only) | Treated as normal PDFs on both                                                                                   | That is what both PDFKit and PDFium do; only documents that require a user password are `PASSWORD_PROTECTED`.                 |
| Release                                                           | Publish `2.0.0-rc.1` under npm dist-tag `next` after this phase; `2.0.0` (`latest`) after Phases 4–5             | Lets early adopters try the New Architecture build while E2E tests and docs land.                                             |

## Fixtures (committed)

`fixtures/` at the repo root (not in the npm package), plus `scripts/generate-fixtures.py` that
regenerates them deterministically (stdlib only; `qpdf` for encryption) so they are reviewable:

| Fixture                             | Purpose                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `normal.pdf`                        | 3 pages, 612×792                                                 |
| `cropbox.pdf`                       | media box 612×792, crop box 300×400 at an offset — #72           |
| `rotated-90.pdf`, `rotated-270.pdf` | `/Rotate` with an asymmetric drawing so orientation is checkable |
| `landscape.pdf`                     | 792×612 without rotation                                         |
| `mixed-sizes.pdf`                   | pages of different sizes/rotations — `generateAllPages`          |
| `password-user.pdf`                 | requires a user password → `PASSWORD_PROTECTED`                  |
| `password-owner-only.pdf`           | owner password only → renders normally                           |
| `many-pages.pdf`                    | 300 pages                                                        |
| `huge-page.pdf`                     | 14400×14400 — downscaling, `OUT_OF_MEMORY` path                  |
| `not-a-pdf.pdf`                     | text file with a `.pdf` name → `INVALID_FILE`                    |
| `truncated.pdf`                     | valid header, cut in half → `INVALID_FILE`                       |

## Work items

Branch `feat/consistent-behaviour` off `master` after #104 merges. One commit per item.

1. **Fixtures + generator** — `chore: add PDF fixtures for behaviour tests`.
2. **JS layer** — options parsing (number | object), validation (`INVALID_PAGE`, quality clamp,
   size validation), error-code exports, spec gets `maxWidth`/`maxHeight`; unit tests for every
   rule including 1.x-style call sites. `feat!: validate inputs in JS and export error codes`.
3. **Android** — URI handling (`UNSUPPORTED_URI`), `FileNotFoundException` → `FILE_NOT_FOUND`,
   `PdfRenderer` construction `IOException` → `INVALID_FILE`, target-size rendering via `Matrix`
   (no full-size bitmap), rotation check. `feat(android)!: …`.
4. **iOS** — URI handling (no remote loading), missing file vs. unreadable PDF distinction
   (`FILE_NOT_FOUND` vs `INVALID_FILE`), `isLocked` → `PASSWORD_PROTECTED` (#73), `.cropBox` (#72),
   rotation-aware dimensions, target-size thumbnails. `feat(ios)!: …`.
5. **Example** — "Generate all pages" grid of small thumbnails using `maxWidth`, and a size
   selector, so downscaling is visible by hand. `chore(example): …`.
6. **Docs** — README API section (options, error-code table, result dimensions, crop box/rotation),
   CHANGELOG-worthy commit bodies. `docs: …`.

## Verification

**Cross-platform expectation table.** Extend the (uncommitted) parity harness into an
expectation runner: every fixture × relevant options, with the expected outcome written down
_before_ implementation — the table below is the contract. Run it on the Android emulator and the
iOS simulator; both must produce the same row-for-row result (code, width, height).

| Case                                      | Expected                                          |
| ----------------------------------------- | ------------------------------------------------- |
| normal p0 / p2                            | 612×792                                           |
| normal p0 `maxWidth: 200`                 | 200×259                                           |
| normal p0 `maxWidth: 200, maxHeight: 100` | 77×100                                            |
| normal p0 `maxWidth: 2000`                | 612×792 (no upscaling)                            |
| cropbox p0                                | 300×400                                           |
| rotated-90 p0                             | 792×612, drawing upright                          |
| landscape p0                              | 792×612                                           |
| mixed-sizes, all pages                    | per-page sizes as authored                        |
| huge p0 `maxWidth: 1024`                  | 1024×1024; Android peak memory ≪ full-size bitmap |
| password-user                             | `PASSWORD_PROTECTED`                              |
| password-owner-only                       | renders                                           |
| not-a-pdf / truncated                     | `INVALID_FILE`                                    |
| missing file                              | `FILE_NOT_FOUND`                                  |
| `https://…` / relative path               | `UNSUPPORTED_URI`                                 |
| page −1 / 1.5 / 3 (of 3)                  | `INVALID_PAGE`                                    |
| `generate(path, 0, 50)` (1.x style)       | works, quality 50                                 |

Plus:

- Visual check of rotated and crop-box outputs (orientation and content region correct) against
  macOS Preview renders of the same fixtures.
- Android memory: render `huge-page.pdf` with `maxWidth: 1024` and confirm via
  `dumpsys meminfo` that peak native heap stays far below the 830 MB full-size bitmap.
- 1.x-compatibility: `generate(path, page)`, `generate(path, page, quality)`,
  `generateAllPages(path, quality)` produce the same results as Phase 2 on `normal.pdf`.
- Lint / typecheck / tests / prepare; example builds; CI smoke jobs.

## Execution

Same split as before: Codex implements from this plan, the fixtures and the codegen output for the
updated spec (generated by Claude first); Claude commits, builds, and runs the expectation table on
both platforms.
