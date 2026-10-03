import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { format } from 'prettier';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const libraryTypes = path.join(root, pkg.types);
let declarations;
try {
  declarations = await readFile(libraryTypes, 'utf8');
} catch {
  throw new Error('Built package types are missing. Run yarn prepare first.');
}

// Keep the method reference derived from the built declarations and their TSDoc.
const source = ts.createSourceFile(
  libraryTypes,
  declarations,
  ts.ScriptTarget.Latest,
  true
);
const api = source.statements.find(ts.isClassDeclaration);
if (!api) throw new Error('PdfThumbnail declaration is missing.');
const signature = api
  .getFullText(source)
  .trim()
  .replace('export default class', 'declare class');
const reference = [
  "import type { GenerateOptions, ThumbnailResult } from 'react-native-pdf-thumbnail';",
  '',
  signature,
].join('\n');
const marker =
  /(?<=<!-- api-reference:start -->\n)[\s\S]*?(?=\n<!-- api-reference:end -->)/;
const readmePath = path.join(root, 'README.md');
let readme = await readFile(readmePath, 'utf8');
const generated =
  '\n```ts\n' +
  (
    await format(reference, { ...pkg.prettier, parser: 'typescript' })
  ).trimEnd() +
  '\n```\n';
if (!marker.test(readme))
  throw new Error('README API reference markers are missing.');
if (process.argv.includes('--write-api')) {
  readme = readme.replace(marker, () => generated);
} else if (readme.match(marker)?.[0] !== generated) {
  throw new Error(
    'README API reference is stale. Run yarn docs:check --write-api.'
  );
}

// Render the fixture rejection codes with descriptions from the public TSDoc.
// Allocation/unexpected failures are exported too, although fixtures do not force them.
const cases = JSON.parse(
  await readFile(path.join(root, 'fixtures/expectations.json'), 'utf8')
);
const codes = source.statements
  .filter(ts.isVariableStatement)
  .flatMap((statement) => statement.declarationList.declarations)
  .find(
    (declaration) =>
      declaration.name.getText(source) === 'PdfThumbnailErrorCodes'
  );
const members = codes?.type?.typeArguments?.[0]?.members;
if (!members) throw new Error('Public error-code declarations are missing.');
const rows = members.map((member) => {
  const code = member.name.getText(source);
  const description = ts
    .getJSDocCommentsAndTags(member)
    .filter(ts.isJSDoc)
    .map((doc) => doc.comment)
    .join(' ');
  if (!description) throw new Error(`Missing TSDoc for ${code}.`);
  return { code, description };
});
for (const code of new Set(
  cases.map((entry) => entry.expected.code).filter(Boolean)
)) {
  if (!rows.some((row) => row.code === code)) {
    throw new Error(`Fixture error code ${code} is not exported.`);
  }
}
const errorMarker =
  /(?<=<!-- error-codes:start -->\n)[\s\S]*?(?=\n<!-- error-codes:end -->)/;
const errorTable =
  '\n' +
  (await format(
    [
      '| Code | When |',
      '| --- | --- |',
      ...rows.map(
        ({ code, description }) => '| `' + code + '` | ' + description + ' |'
      ),
    ].join('\n'),
    { ...pkg.prettier, parser: 'markdown' }
  ));
if (!errorMarker.test(readme))
  throw new Error('README error table markers are missing.');
if (process.argv.includes('--write-api')) {
  readme = readme.replace(errorMarker, () => errorTable);
  await writeFile(readmePath, readme);
} else if (readme.match(errorMarker)?.[0] !== errorTable) {
  throw new Error(
    'README error table is stale. Run yarn docs:check --write-api.'
  );
}

const scratch = await mkdtemp(path.join(tmpdir(), 'pdf-thumbnail-docs-'));
try {
  await symlink(
    path.join(root, 'node_modules'),
    path.join(scratch, 'node_modules'),
    'dir'
  );
  const files = [];
  for (const document of ['README.md', 'MIGRATION.md']) {
    let markdown;
    try {
      markdown = await readFile(path.join(root, document), 'utf8');
    } catch (error) {
      // Item 1 can be checked before the migration guide is added in item 2.
      if (document === 'MIGRATION.md' && error.code === 'ENOENT') continue;
      throw error;
    }
    const lines = markdown.split('\n');
    let fence = null;
    let sample = 0;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!fence) {
        const opening = /^```(ts|tsx)\s*$/.exec(line);
        if (opening) fence = { extension: opening[1], start: index, lines: [] };
      } else if (/^```\s*$/.test(line)) {
        sample++;
        const filename = `${document.replace('.md', '')}-${sample}-line-${fence.start + 2}.${fence.extension}`;
        await writeFile(
          path.join(scratch, filename),
          fence.lines.join('\n') + '\nexport {};\n'
        );
        files.push(filename);
        fence = null;
      } else {
        fence.lines.push(line);
      }
    }
    if (fence) throw new Error(`Unclosed TypeScript fence in ${document}.`);
  }
  if (!files.length)
    throw new Error('No TypeScript documentation samples found.');

  // These recipe dependencies already belong to the example workspace. Resolve
  // their installed declarations rather than inventing permissive module stubs.
  const paths = { [pkg.name]: [libraryTypes] };
  const exampleRequire = createRequire(path.join(root, 'example/package.json'));
  for (const name of [
    '@react-native-documents/picker',
    '@dr.pogodin/react-native-fs',
  ]) {
    const manifest = exampleRequire.resolve(`${name}/package.json`);
    const dependency = JSON.parse(await readFile(manifest, 'utf8'));
    paths[name] = [path.resolve(path.dirname(manifest), dependency.types)];
  }
  await writeFile(
    path.join(scratch, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          noUncheckedIndexedAccess: true,
          noEmit: true,
          skipLibCheck: true,
          esModuleInterop: true,
          lib: ['ESNext'],
          types: ['react', 'react-native'],
          paths,
        },
        files,
      },
      null,
      2
    )
  );
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('typescript/bin/tsc'),
      '--noEmit',
      '--project',
      path.join(scratch, 'tsconfig.json'),
    ],
    { cwd: root, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else
    console.log(
      `Type-checked ${files.length} documentation samples against ${pkg.types}.`
    );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
