# Phase 1 — Tooling reset

Part of the catch-up plan (Phase 0 → 5). Phase 0 shipped `1.3.2`. Phase 1 replaces
the 2023-era toolchain and the RN 0.72 example app with what
`create-react-native-library` generates today, so Phase 2 (TurboModule rewrite,
v2.0.0) starts from a current, green baseline.

## Goals

1. Repo toolchain matches the current official library template
   (`create-react-native-library` 0.63.1 / `react-native-builder-bob` 0.43.1).
2. Example app regenerated on **RN 0.87.1** (New Architecture only), using the
   maintained document picker; it builds and runs on Android and iOS.
3. CI is fully green with **no `continue-on-error`**, and keeps the fresh-app smoke
   tests from Phase 0.
4. Dependencies stay current automatically (grouped Dependabot), and the 8 stale
   Dependabot PRs and 101 security alerts on `master` are cleared by the new lockfile.
5. Commit hooks actually run.

## Non-goals (deferred)

| Item                                                                               | Phase |
| ---------------------------------------------------------------------------------- | ----- |
| Native module code (Kotlin/Swift), `android/build.gradle`, podspec contents & name | 2     |
| `codegenConfig`, TurboModule spec, New-Arch-only peer range                        | 2     |
| Error-code consistency, iOS fixes, options API                                     | 3     |
| Maestro E2E tests                                                                  | 4     |
| npm trusted publishing, README compatibility table                                 | 5     |

Phase 1 touches **no native library code**. The legacy module keeps working on the
RN 0.87 example through the interop layer (proven by the Phase 0 smoke run and the
emulator test on RN 0.87.1).

## Release & branching

- **Prerequisite (owner):** create the maintenance branch before Phase 1 merges —
  `git branch 1.x v1.3.2 && git push origin 1.x`. 1.x keeps its Phase 0 toolchain/CI.
- Phase 1 lands on `master` **unreleased**. Its packaging changes (ESM output,
  `exports` map) reach users in **2.0.0** together with Phase 2.
- Work branch: `chore/phase-1-tooling`, one PR, merge commit.

## Reference

A template project was generated with:

```bash
npx create-react-native-library@latest --no-interactive --slug react-native-pdf-thumbnail \
  --type turbo-module --languages kotlin-objc --example vanilla \
  --tools eslint --tools jest --tools lefthook --tools release-it \
  --react-native-version 0.87.1 ...
```

The implementer regenerates it (same command, `--directory` in a scratch dir) and
uses it as the source of truth for config files. **Port, don't copy blindly** — keep
our package identity (name, namespace `org.songsterq.pdfthumbnail`, podspec name,
native sources, keywords, author, repo) and drop template sample code (`multiply`).

Known template defects to avoid:

- `jest.testEnvironmentOptions.customExportConditions` contains an unrendered
  placeholder `<%- project.sourceCondition -%>` → use `react-native-pdf-thumbnail-source`.
- Template pins RN 0.86.2 → use 0.87.1 everywhere (`--react-native-version 0.87.1`).

## Target versions

| Tool                                 | From                                          | To                                                                                                      |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Node (`.nvmrc`)                      | 22                                            | 24 (LTS)                                                                                                |
| Yarn                                 | 3.6.1 + 2 plugins + custom pod-install plugin | 4.x (template version), no plugins                                                                      |
| react-native-builder-bob             | 0.23                                          | 0.43.x                                                                                                  |
| TypeScript                           | 5.0                                           | 6.0.x (template). **Not 7.x** — the native-Go compiler; verify bob compatibility before adopting, later |
| ESLint                               | 8, `eslintConfig` in package.json             | 9, `eslint.config.mjs` flat config                                                                      |
| Prettier                             | 2                                             | 3                                                                                                       |
| Jest                                 | 28, `preset: react-native`                    | 29, `@react-native/jest-preset`                                                                         |
| @types/react                         | 17 + forced resolution                        | 19 (drop `resolutions`)                                                                                 |
| @types/react-native                  | 0.70                                          | removed (RN ships types)                                                                                |
| Babel preset                         | `metro-react-native-babel-preset`             | `react-native-builder-bob/babel-preset` + `@react-native/babel-preset`                                  |
| turbo                                | 1 (`pipeline`)                                | 2 (`tasks`)                                                                                             |
| commitlint                           | 17                                            | 21                                                                                                      |
| release-it / conventional-changelog  | 15 / 5                                        | 21 / 12 (`release-it --only-version`)                                                                   |
| lefthook                             | `@evilmartians/lefthook` 1.5                  | `lefthook` 2.x                                                                                          |
| react / react-native (dev + example) | 18.2 / 0.72.6                                 | 19.2.x / 0.87.1                                                                                         |
| Document picker (example)            | `react-native-document-picker` 9 (deprecated) | `@react-native-documents/picker` 12                                                                     |
| Metro monorepo setup                 | hand-rolled `blacklistRE`/`extraNodeModules`  | `react-native-monorepo-config`                                                                          |

## Work items

One commit per item, Conventional Commits, no `Co-Authored-By` trailers.

### 1. Yarn 4 and Node 24

- `.nvmrc` → `v24` (pin the minor the template uses).
- `yarn set version` to the template's Yarn 4 release; commit `.yarn/releases/*`.
- `.yarnrc.yml`: `nodeLinker: node-modules`, `nmHoistingLimits: workspaces`,
  `yarnPath` only. Delete `.yarn/plugins/**` (built into Yarn 4) and
  `scripts/pod-install.cjs` (replaced by `automaticPodsInstallation` in item 7).
- Remove the `pod-install` dev dependency.
- `engines.node` → match RN 0.87 (`>= 22.13`); `packageManager` → yarn 4.
- Regenerate `yarn.lock` from scratch.

Commit: `chore: upgrade to Yarn 4 and Node 24`

### 2. Builder-bob 0.43, ESM output, `exports` map

- `react-native-builder-bob` → 0.43.x; targets per template:
  `["module", { "esm": true }]` and `["typescript", { "project": "tsconfig.build.json" }]`.
  Drop the `commonjs` target.
- `package.json` entry points per template: `main: ./lib/module/index.js`,
  `types: ./lib/typescript/src/index.d.ts`, `exports` with the
  `react-native-pdf-thumbnail-source` condition → `./src/index.tsx`.
  Remove `module`, `react-native`, `source` fields.
- `files`: remove the non-existent `cpp`.
- `babel.config.js` → template (bob preset for own code, RN preset for `node_modules`).
- `tsconfig.json` → template (`moduleResolution: bundler`, `customConditions`,
  `jsx: react-jsx`, `noEmit`); `tsconfig.build.json` excludes `example`, `lib`.
- Verify the build output: `lib/module/index.js` is ESM, `lib/typescript/src/index.d.ts`
  exports `ThumbnailResult` and the default class, and `npm pack --dry-run` lists
  only intended files (compare against 1.3.2's tarball, explain every difference).

Commit: `build: emit ESM with an exports map via builder-bob 0.43`

### 3. ESLint 9 + Prettier 3

- Add `eslint.config.mjs` from template; remove `eslintConfig` / `eslintIgnore` from
  `package.json`. Keep the existing Prettier options (now in `prettier` key only —
  the template rule is `'prettier/prettier': 'error'` reading from that key).
- Ignore `lib/`, `node_modules/`, `example/{android,ios}` build outputs, `.yarn/`.
- **Separate commit** for any mass reformat Prettier 3 produces, so the tooling
  change stays reviewable.

Commits: `chore: migrate to ESLint 9 flat config and Prettier 3`, `style: apply Prettier 3 formatting`

### 4. Jest 29 with `@react-native/jest-preset`

- Jest config per template, with the placeholder bug fixed (see Reference).
- The existing tests in `src/__tests__/index.test.tsx` must pass unchanged in intent;
  adapt only the mocking mechanics if the new preset requires it.

Commit: `test: move to Jest 29 and the React Native jest preset`

### 5. Release and commit tooling

- commitlint 21, release-it 21 + conventional-changelog 12 (config per template;
  keep `tagName: v${version}`), `release` script → `release-it --only-version`.
- lefthook 2 (`lefthook` package) with the template's `lefthook.yml`
  (`{staged_files}`), which fixes Phase 0's hook silently skipping on unpushed
  branches. Verify by committing on a fresh unpushed branch with a lint error: the
  hook must block it.

Commit: `chore: upgrade commitlint, release-it and lefthook`

### 6. Turbo 2

- `turbo.json` → template (`tasks`, `globalDependencies`, env lists for new-arch
  flags). Example build scripts use `react-native build-android` / `build-ios`
  as in the template.

Commit: `chore: upgrade turbo to v2`

### 7. Regenerate the example app on RN 0.87.1

- Replace `example/` wholesale with the template's example (RN 0.87.1, Hermes,
  New Architecture, `react-native-monorepo-config` Metro config, bob babel config,
  `react-native.config.js` with `automaticPodsInstallation`).
- Keep the example identity: Android `applicationId`/namespace and iOS bundle id
  `org.songsterq.pdfthumbnail.example` (decide once, document in the commit body).
- Port `example/src/App.tsx` to `@react-native-documents/picker`
  (`pick({ type: [types.pdf] })`, `isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED`).
  Keep the current UX (pick → thumbnail + uri/size, or error code/message) and add
  a **"Generate all pages"** button that shows the page count, so both API methods
  are exercisable by hand.
- Commit the generated `Podfile.lock` and `Gemfile.lock`; `example/vendor/` stays ignored.
- Delete leftover RN 0.72 artifacts (Flipper classes, `File.swift`, bridging header, etc.)
  — they disappear naturally with the wholesale replacement.

Commit: `chore(example): regenerate example app on React Native 0.87`

### 8. CI

Start from the template workflow and setup action, then re-apply our Phase 0 decisions:

- Triggers: `master` (+ `merge_group`); `permissions: contents: read`; concurrency.
  Drop `1.x` from triggers — `1.x` keeps its own workflow file from v1.3.2.
- **Pin actions by commit SHA** with a `# vX.Y.Z` comment (template style), using the
  latest releases (checkout v7, setup-node v7, cache v6, setup-java v6 as of Phase 0).
  Dependabot (item 9) keeps the pins current.
- Jobs: `lint` (lint + typecheck), `test`, `build-library`, `build-android`,
  `build-ios` — **remove `continue-on-error`**. Pin Xcode with
  `maxim-lobanov/setup-xcode` to the newest stable Xcode on the runner; use
  `RCT_USE_RN_DEP=1` / `RCT_USE_PREBUILT_RNCORE=1` as the template does.
- Keep the `smoke` matrix (RN `0.76.9` × android, `latest` × android/ios), packing with
  `yarn pack --out` (Phase 0 lesson: `npm pack` re-runs `prepare` and pollutes stdout).
  Add a step that runs the fresh app's own `npm test` (its default App test renders
  `App.tsx`, which imports the library) — this proves consumer Jest setups can
  transform the new ESM output.
- Keep the autolinking assertion (class name present, `com.pdfthumbnail.` absent).

Commit: `ci: adopt the current template workflow and pin actions`

### 9. Dependabot

`.github/dependabot.yml`:

- `npm` for `/` and `/example`, weekly, **grouped** (one PR for dev-tooling minors/
  patches, one for React Native + `@react-native/*` together, majors individually).
  Ignore `react`/`react-native` majors in `/` (moved deliberately with the example).
- `github-actions`, weekly, grouped.
- `bundler` for `/example`, monthly.

Commit: `chore: configure grouped Dependabot updates`

### 10. Docs and repo hygiene

- `CONTRIBUTING.md`: refresh from the template, adapted (Node 24, Yarn 4, how to run
  the example, lefthook, commit conventions, release via `yarn release`).
- `README.md`: only the "Demo"/dev instructions that changed; the compatibility table
  is Phase 5.
- Add the template's `.github/ISSUE_TEMPLATE` (bug report form asking for RN version,
  architecture, platform, library version).
- `.gitignore`, `.editorconfig`, `.gitattributes`, `.watchmanconfig` → template.

Commit: `docs: update contributing guide and add issue templates`

## Verification

Local (toolchain from Phase 0 is installed: JDK 17, Android SDK + `Pixel_API_36`,
Xcode 27 + iOS 27 simulator, Ruby 3.3 + CocoaPods):

1. `yarn install --immutable` after the lockfile is committed; `yarn lint`,
   `yarn typecheck`, `yarn test`, `yarn prepare` all pass.
2. Tarball review: `yarn pack --out /tmp/x.tgz` — file list and `package.json`
   entry points as intended; diff against the published 1.3.2 tarball.
3. Example: `yarn example build:android` and `yarn example build:ios` succeed.
4. Runtime, both platforms: run the example on `Pixel_API_36` and an iPhone
   simulator; with the Phase 0 fixture PDFs (pushed to the emulator / dragged into
   the simulator's Files app) confirm:
   - normal PDF → thumbnail + dimensions; "Generate all pages" → correct count
   - password-protected → `PASSWORD_PROTECTED` on Android (iOS behaviour unchanged, record it)
   - picker cancel → no error shown
5. Consumer check: in a fresh RN 0.87.1 app with the packed tarball, `npm test`
   passes and Android/iOS build (same as the CI smoke job).
6. Hooks: lefthook blocks a commit with a lint error on an unpushed branch;
   commitlint rejects a non-conventional message.

CI: every job green, no `continue-on-error`.

## After merge (owner)

1. Close the stale Dependabot PRs (#84, #88, #89, #91–#94) that the new lockfile
   supersedes, with a short comment; Dependabot may already have closed some itself.
2. Check the Security tab: the 101 alerts should mostly resolve; triage any left.
3. Decline PR #83 (remote URLs) with the agreed rationale.

## Execution notes (from Phase 0)

- Codex's sandbox cannot write `.git` or reach the network: run `yarn install`,
  lockfile generation, and template scaffolding outside it; let Codex edit the
  working tree only, and let Claude commit per item and run native verification.
- Watch for the implementer continuing after it reports "done" — wait for its
  session to go idle before touching the working tree.

## Implementation notes (2026-10-02)

Deviations found during implementation and local verification:

- **Dual ESM + CommonJS output instead of ESM-only.** With ESM-only output, a fresh RN 0.87
  app's unmodified Jest setup fails to import the library (`Cannot use import statement outside
a module`): the RN Jest preset only transforms packages named exactly `react-native/…`. Every
  consumer would have had to add a `transformIgnorePatterns` override. Builder-bob's supported
  dual layout (`commonjs` + `module` targets, `exports` with `import`/`require` conditions,
  `main` → CommonJS) fixes this; verified by running a fresh app's own Jest test against the
  packed tarball with no Jest changes.
- **Example adopts the UIScene life cycle.** The RN 0.87 template's window-based `AppDelegate`
  is refused at launch by apps built with the iOS 27 SDK ("UIScene life cycle is required").
  The example now starts React Native from a `SceneDelegate`. This is a template issue that
  will affect any RN 0.87 app built with Xcode 27; it does not involve the library.
- **Action pins** resolved with network access after Codex's offline pass: checkout v7.0.1,
  setup-node v7.0.0, cache v6.1.0, setup-java v6.0.1, setup-xcode v1.7.0.
- **`yarn.lock` is its own commit** (too large to review inside a tooling commit);
  `Gemfile.lock`/`Podfile.lock` and the Pods integration live in the example commit.
- **`.prettierignore`** excludes Xcode-managed `*.xcassets` JSON.

Local verification results:

| Check                                                                  | Result                                                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn lint` / `typecheck` / `test` (8 tests) / `prepare` on Node 24.13 | pass                                                                                                                                                  |
| Tarball                                                                | `lib/{commonjs,module}` + `lib/typescript/{commonjs,module}`, `src`, native sources, podspec                                                          |
| Fresh RN 0.87.1 app, unmodified Jest, packed tarball                   | pass                                                                                                                                                  |
| lefthook: lint error on unpushed branch / non-conventional message     | both blocked                                                                                                                                          |
| Example build Android (AAB) / iOS                                      | pass / pass                                                                                                                                           |
| Android 16 emulator (system picker, `content://` URIs)                 | normal → 612×792 + white background; all pages → 3; password-protected → `PASSWORD_PROTECTED`; cancel → no error                                      |
| iOS 27 simulator (system picker)                                       | normal → 612×792; all pages (300-page file) → 300; cancel → no error; password-protected → **resolves with a blank 612×792 image** (iOS #73, Phase 3) |
