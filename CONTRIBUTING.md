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
yarn example build:android
yarn example build:ios
```

Review the published file list and entry points with
`yarn pack --out /tmp/react-native-pdf-thumbnail.tgz`. Builder-bob emits ESM in
`lib/module/`, CommonJS in `lib/commonjs/`, and declarations for each in
`lib/typescript/`. The `exports` map serves ESM to `import` (Metro, bundlers) and
CommonJS to `require` (Jest), so consuming apps need no Jest configuration.

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

Releases are managed with release-it and conventional-changelog:

```sh
yarn release
```

This runs `release-it --only-version`: it prompts for the version and automates
the remaining release steps, including the Git commit, `v${version}` tag, npm
publication, and GitHub release. Run it only when a release is intended and the
checks have passed.

Phase 1 lands unreleased. Its packaging changes ship in 2.0.0 with Phase 2;
maintenance releases for 1.x remain on the `1.x` branch.

## Pull requests

Keep changes focused, describe the resulting behavior, and report which checks
passed. Include tests for behavior changes and update relevant documentation.
Discuss API changes with the maintainers before implementation.
