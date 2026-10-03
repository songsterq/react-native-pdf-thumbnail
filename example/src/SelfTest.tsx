import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as FS from '@dr.pogodin/react-native-fs';
import PdfThumbnail, {
  type GenerateOptions,
  type ThumbnailResult,
} from 'react-native-pdf-thumbnail';
import expectations from '../../fixtures/expectations.json';

type Case = {
  name: string;
  file?: string;
  missingFile?: string;
  path?: string;
  absolute?: boolean;
  page?: number;
  all?: boolean;
  options?: GenerateOptions | number;
  expected: { description: string; sizes?: number[][]; code?: string };
};

type Result = {
  pass: boolean;
  code: string | null;
  width: number | number[] | null;
  height: number | number[] | null;
  uri: string | string[] | null;
  message: string | null;
};

const cases: Case[] = expectations;
const inputDirectory = `${FS.DocumentDirectoryPath}/selftest-fixtures`;
const exportDirectory = `${Platform.OS === 'android' ? FS.ExternalDirectoryPath : FS.DocumentDirectoryPath}/selftest`;

function describeError(error: unknown) {
  return {
    code:
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : null,
    message: error instanceof Error ? error.message : String(error),
  };
}

async function prepareFixtures() {
  // Start clean: an old export or accidentally created missing.pdf must not pass.
  for (const directory of [inputDirectory, exportDirectory]) {
    if (await FS.exists(directory)) await FS.unlink(directory);
    await FS.mkdir(directory);
  }
  const files = new Set(
    cases.map((test) => test.file).filter((file) => file !== undefined)
  );
  for (const file of files) {
    if (!file.endsWith('.pdf')) throw new Error(`Unexpected fixture: ${file}`);
    const destination = `${inputDirectory}/${file}`;
    if (Platform.OS === 'android') {
      // The Gradle asset root is fixtures/ itself, so PDFs have no path prefix.
      await FS.copyFileAssets(file, destination);
    } else {
      await FS.copyFile(`${FS.MainBundlePath}/fixtures/${file}`, destination);
    }
  }
}

async function runCase(test: Case): Promise<Result> {
  const localPath = `${inputDirectory}/${test.file ?? test.missingFile}`;
  const input =
    test.path ?? (test.absolute ? localPath : `file://${localPath}`);
  let results: ThumbnailResult[];
  try {
    results = test.all
      ? await PdfThumbnail.generateAllPages(input, test.options)
      : [await PdfThumbnail.generate(input, test.page ?? 0, test.options)];
  } catch (error) {
    const { code, message } = describeError(error);
    return {
      pass: !!test.expected.code && code === test.expected.code,
      code,
      message,
      width: null,
      height: null,
      uri: null,
    };
  }
  const row: Result = {
    pass:
      !test.expected.code &&
      results.length === test.expected.sizes?.length &&
      results.every(
        (result, index) =>
          result.width === test.expected.sizes?.[index]?.[0] &&
          result.height === test.expected.sizes?.[index]?.[1]
      ),
    code: null,
    message: null,
    width: test.all
      ? results.map((result) => result.width)
      : (results[0]?.width ?? null),
    height: test.all
      ? results.map((result) => result.height)
      : (results[0]?.height ?? null),
    uri: test.all
      ? results.map((result) => result.uri)
      : (results[0]?.uri ?? null),
  };
  try {
    const exported: string[] = [];
    for (const [index, result] of results.entries()) {
      const destination = `${exportDirectory}/${test.name}${test.all ? `-${index}` : ''}.jpg`;
      await FS.copyFile(
        decodeURIComponent(result.uri.replace(/^file:\/\//, '')),
        destination
      );
      exported.push(`file://${destination}`);
    }
    row.uri = test.all ? exported : (exported[0] ?? null);
  } catch (error) {
    row.pass = false;
    row.code = 'EXPORT_FAILED';
    row.message = describeError(error).message;
  }
  return row;
}

export default function SelfTest() {
  const started = useRef(false);
  const [rows, setRows] = useState<Record<string, Result>>({});
  const [complete, setComplete] = useState(false);
  const [fatal, setFatal] = useState<string>();
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      try {
        await prepareFixtures();
        const results: Record<string, Result> = {};
        for (const test of cases) {
          results[test.name] = await runCase(test);
          setRows({ ...results });
        }
        await FS.writeFile(
          `${exportDirectory}/selftest-results.json`,
          JSON.stringify(results, null, 2),
          'utf8'
        );
        // Maestro sees the final summary only once all exported files are ready.
        setComplete(true);
      } catch (error) {
        setFatal(describeError(error).message);
      }
    };
    run();
  }, []);
  const passed = Object.values(rows).filter((row) => row.pass).length;
  return (
    <View style={styles.container}>
      <Text testID="selftest-summary" style={styles.summary}>
        {fatal
          ? `FAIL: ${fatal}`
          : complete
            ? `${passed}/${cases.length} passed`
            : `Running ${Object.keys(rows).length}/${cases.length}…`}
      </Text>
      <Text>Exports: {exportDirectory}</Text>
      <ScrollView testID="selftest-cases">
        {cases.map((test) => {
          const row = rows[test.name];
          return (
            <Text
              key={test.name}
              testID={`case-${test.name}`}
              style={styles.row}
            >
              {row ? (row.pass ? 'PASS' : 'FAIL') : 'WAIT'} {test.name}:{' '}
              {test.expected.description}
              {row
                ? ` | ${row.code ?? 'rendered'}: ${Array.isArray(row.width) ? `${row.width.length} pages, widths ${row.width.slice(0, 5).join(',')}` : `${row.width}×${row.height}`}${row.message ? ` (${row.message})` : ''}`
                : ''}
            </Text>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  summary: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  row: { fontSize: 12, marginVertical: 8 },
});
