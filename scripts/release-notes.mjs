import { readFile } from 'node:fs/promises';

// release-it writes CHANGELOG.md before invoking this command. Only the current
// version belongs in its GitHub release, even when the first run seeds history.
// A stable release that follows its own pre-releases (e.g. 2.0.0 after
// 2.0.0-rc.1) has an empty section of its own, so its notes also include the
// directly following sections of those pre-releases.
const version = process.argv[2];
if (
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    version ?? ''
  )
) {
  throw new Error('Pass the release version as the first argument.');
}
const lines = (await readFile('CHANGELOG.md', 'utf8')).split(/\r?\n/);
const isHeading = (line) => /^#{1,2} /.test(line);
const headingVersion = (line) =>
  line
    .replace(/^#{1,2} /, '')
    .replace(/^\[/, '')
    .split(/[\] ]/)[0];
const start = lines.findIndex(
  (line) => isHeading(line) && headingVersion(line) === version
);
if (start < 0) throw new Error(`CHANGELOG.md has no section for ${version}.`);
const isOwnPrerelease = (line) =>
  !version.includes('-') && headingVersion(line).startsWith(`${version}-`);
let end = lines.findIndex(
  (line, index) => index > start && isHeading(line) && !isOwnPrerelease(line)
);
if (end < 0) end = lines.length;
const changelog = lines.slice(start, end).join('\n').trim();
console.log(
  `${changelog}\n\nSee the [1.x → 2.0 migration guide](https://github.com/songsterq/react-native-pdf-thumbnail/blob/v${version}/MIGRATION.md).`
);
