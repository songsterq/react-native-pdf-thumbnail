# Contributing

Contributions are welcome. Please follow the [code of conduct](CODE_OF_CONDUCT.md)
in your interactions with the project.

## Development workflow

This repository uses Yarn workspaces: the library lives at the root and the
React Native 0.87.1 example lives in `example/`. Use Node 24 (the exact version is
in `.nvmrc`) and the checked-in Yarn 4.11.0 release.

```sh
nvm install
nvm use
corepack enable
yarn install --immutable
```

Use Yarn for development so the two workspaces share the same dependency graph.
If Corepack is unavailable, invoke the checked-in release directly:
`node .yarn/releases/yarn-4.11.0.cjs install --immutable`.

The example resolves the library's TypeScript source through the
`react-native-pdf-thumbnail-source` export condition. JavaScript changes refresh
through Metro; native changes require rebuilding the example.

Start Metro in one terminal, then run the example in another:

```sh
yarn example start
yarn example android
# Or, on macOS with Xcode and CocoaPods:
yarn example ios
```

The React Native CLI installs iOS pods automatically. To install them manually:

```sh
cd example
bundle install
bundle exec pod install --project-directory=ios
```

Open `example/android` in Android Studio, or
`example/ios/PdfThumbnailExample.xcworkspace` in Xcode. The library's native
sources appear under the `react-native-pdf-thumbnail` development dependency.
Both apps use the identity `org.songsterq.pdfthumbnail.example`, Hermes, and the
New Architecture.

In the example, **Pick PDF File** renders the first page and shows the thumbnail
URI and dimensions. **Generate all pages** uses the selected PDF and shows the
page count. Picker cancellation leaves no error; generation failures show their
code and message.

Run the checks from the root:

```sh
yarn lint
yarn typecheck
yarn test
yarn prepare
yarn docs:check
yarn example build:android
yarn example build:ios
```

Review the published file list and entry points with
`yarn pack --out /tmp/react-native-pdf-thumbnail.tgz`. Builder-bob emits ESM in
`lib/module/`, CommonJS in `lib/commonjs/`, and declarations for each in
`lib/typescript/`. The `exports` map serves ESM to `import` (Metro, bundlers) and
CommonJS to `require` (Jest), so consuming apps need no Jest configuration.

The native interface is defined by the codegen spec in
`src/NativePdfThumbnail.ts`. After changing it or `codegenConfig` in
`package.json`, rerun `pod install` for iOS, and delete
`example/android/build/generated/autolinking` before the next Android build: the
React Native Gradle plugin caches autolinking keyed on the example's own
`package.json`, so it does not notice library-side codegen changes and the module
silently fails to register.

To apply formatting fixes, use `yarn lint --fix`. Keep broad formatting changes
in a separate `style:` commit so implementation changes stay easy to review.

## Testing a consuming app

CI's `smoke` jobs pack the library, install the tarball into freshly generated
React Native apps, run each app's own unmodified Jest test, bundle with Metro, and
build natively. Reproduce one locally by installing a `yarn pack` tarball into a
new app created with `npx @react-native-community/cli init`.

## Commit hooks and conventions

Lefthook installs Git hooks when dependencies are installed. If hooks need to be
restored, run `yarn lefthook install`. The pre-commit hook lints staged JavaScript
and TypeScript files and runs the project typecheck. It works on branches without
an upstream. The commit-msg hook checks the message with commitlint.

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `fix:` for bug fixes.
- `feat:` for features.
- `refactor:` for implementation changes without a behavior change.
- `test:` for tests.
- `build:`, `ci:`, and `chore:` for build, CI, and tooling changes.
- `docs:` for documentation and `style:` for formatting.

A scope is optional, for example `chore(example): update the example app`.

## Releases

The owner runs release-it locally to update the version, generate conventional
release notes in `CHANGELOG.md` (header `# Changelog`), commit
`chore: release ${version}`, tag `v${version}`, push, and create the GitHub
release. GitHub notes include the [migration guide](MIGRATION.md). release-it
has `npm.publish: false`: the tag-triggered workflow publishes the package.
The first run creates the changelog with history; do not seed it by hand.

Run from a clean, up-to-date `master` with a configured upstream and passing CI.
Use `gh auth login` beforehand; the command below supplies a GitHub
credential from the owner's CLI session. Review the version and generated notes
with a dry run before making a release:

```sh
yarn lint
yarn typecheck
yarn test --watchman=false
yarn prepare
yarn docs:check
yarn pack --out /tmp/react-native-pdf-thumbnail.tgz
GITHUB_TOKEN=$(gh auth token) yarn release --preRelease=rc --dry-run
```

The first candidate must be **2.0.0-rc.1**. `preReleaseBase: 1` starts candidate
numbering at 1; the merged breaking commits recommend the major bump. Verify
that exact version in the dry-run output (or specify `2.0.0-rc.1` explicitly).
A dry run previews writes and pushes but still needs network access for release
checks. Review the [first-RC checklist](#first-rc-checklist) before proceeding.

To release a candidate, or later a stable version:

```sh
GITHUB_TOKEN=$(gh auth token) yarn release --preRelease=rc
# When the candidate has been tried in real apps and is ready for latest:
GITHUB_TOKEN=$(gh auth token) yarn release
```

Subsequent candidates increment `rc.N` when fixes are needed. For the stable
release, verify that the selected version is `2.0.0`. Keep 1.3.x maintenance
releases on the `1.x` branch; cherry-pick fixes there manually.

### One-time trusted-publisher setup

On npmjs.com, open the existing `react-native-pdf-thumbnail` package settings
and configure a GitHub Actions trusted publisher with these exact values:

| Setting              | Value                        |
| -------------------- | ---------------------------- |
| Organization or user | `songsterq`                  |
| Repository           | `react-native-pdf-thumbnail` |
| Workflow filename    | `release.yml`                |
| Environment          | `npm-release`                |
| Allowed action       | `npm publish`                |

The GitHub `npm-release` environment was created with required reviewer
`songsterq` (self-review allowed) and deployments restricted to tags matching
`v*`. Confirm these settings before the first publish. The workflow grants
`contents: read` and `id-token: write`; npm >= 11.5.1 exchanges the GitHub OIDC
identity for publish authorization. No long-lived npm publishing credential is
needed in local release-it configuration or Actions secrets.

**After the first successful workflow publish**, set npm Publishing access to
**"Require two-factor authentication and disallow tokens"**, then revoke any
old automation tokens. Do this after proving trusted publishing works.

### First-RC checklist

1. Merge the docs/release changes and require the existing CI checks to pass.
   Capture the Android and iOS demo screenshots in `docs/images/` before release.
2. Complete the trusted-publisher setup above and inspect the packed file list:
   no fixtures, docs, plans, scripts or example app should ship. README and
   standard package/license files may be included automatically by the packer.
3. Run the checks and release-it dry run above. Inspect the proposed
   `2.0.0-rc.1`, `v2.0.0-rc.1`, release commit, changelog and GitHub notes. The
   npm publish must occur only in Actions, under dist-tag `next`.
4. Run the owner candidate command. It pushes the release tag, triggering
   `.github/workflows/release.yml`. In the Actions tab, review that tag's
   **Release** run and approve the **npm-release** deployment. Each publish
   requires this approval, including the first candidate and the final release.
5. Confirm the workflow checks npm's version, rejects a mismatched package/tag,
   builds with `yarn prepare`, and publishes using
   `npm publish --provenance --access public`. Versions with a prerelease part
   go to `next`; stable versions go to `latest`.
6. Check `npm view react-native-pdf-thumbnail@next version dist.integrity dist.attestations`
   and the npm package page for the expected version and provenance linked to
   this workflow/tag. Confirm the existing `latest` tag remains on 1.3.2 during
   candidate testing. Install `@next` in real RN and Expo development builds.
7. Apply the npm disallow-tokens setting above. Publish further candidates only
   as needed; publish 2.0.0 to `latest` through this same approval flow once clean.

If publication fails, fix the cause and rerun the failed workflow for the same
tag only after checking whether npm already contains that version. npm versions
cannot be overwritten. If it was published, make a new version for corrections.
GitHub release creation and npm publication are separate operations: creating a
GitHub release does not prove that the package has reached npm.

## Pull requests

Keep changes focused, describe the resulting behavior, and report which checks
passed. Include tests for behavior changes and update relevant documentation.
Discuss API changes with the maintainers before implementation.
