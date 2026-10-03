import { useState } from 'react';
import {
  Button,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';
import PdfThumbnail, { type ThumbnailResult } from 'react-native-pdf-thumbnail';

import SelfTest from './SelfTest';

type ThumbnailError = { code: string; message: string };

function describeError(error: unknown): ThumbnailError {
  return {
    code:
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : 'UNKNOWN',
    message:
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error),
  };
}

export default function App() {
  const [selfTest, setSelfTest] = useState(false);
  const [fileUri, setFileUri] = useState<string>();
  const [thumbnail, setThumbnail] = useState<ThumbnailResult>();
  const [thumbnails, setThumbnails] = useState<ThumbnailResult[]>([]);
  const [maxWidth, setMaxWidth] = useState(200);
  const [error, setError] = useState<ThumbnailError>();
  const [busy, setBusy] = useState(false);

  const pickPdf = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const [document] = await pick({ type: [types.pdf] });
      if (!document) {
        return;
      }
      setFileUri(document.uri);
      setThumbnail(undefined);
      setThumbnails([]);
      setThumbnail(
        await PdfThumbnail.generate(document.uri, 0, { quality: 100, maxWidth })
      );
    } catch (e) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      setThumbnail(undefined);
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const generateAllPages = async () => {
    if (!fileUri) {
      return;
    }
    setBusy(true);
    setError(undefined);
    setThumbnails([]);
    try {
      const results = await PdfThumbnail.generateAllPages(fileUri, {
        quality: 100,
        maxWidth,
      });
      setThumbnail(results[0]);
      setThumbnails(results);
    } catch (e) {
      setThumbnail(undefined);
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (selfTest) return <SelfTest />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Button
        title="Run self-test"
        testID="run-selftest"
        onPress={() => setSelfTest(true)}
        disabled={busy}
      />
      <View style={styles.thumbnailPreview}>
        {thumbnail ? (
          <>
            <Image
              source={thumbnail}
              resizeMode="contain"
              style={styles.thumbnailImage}
            />
            <Text style={styles.thumbnailInfo}>uri: {thumbnail.uri}</Text>
            <Text style={styles.thumbnailInfo}>width: {thumbnail.width}</Text>
            <Text style={styles.thumbnailInfo}>height: {thumbnail.height}</Text>
          </>
        ) : null}
        {thumbnails.length > 0 ? (
          <Text style={styles.thumbnailInfo}>
            Page count: {thumbnails.length}
          </Text>
        ) : null}
        {error ? (
          <>
            <Text style={styles.thumbnailError}>Error code: {error.code}</Text>
            <Text style={styles.thumbnailError}>
              Error message: {error.message}
            </Text>
          </>
        ) : null}
        {busy ? <Text>Generating…</Text> : null}
      </View>
      <Text>Maximum output width: {maxWidth} pixels (no upscaling)</Text>
      <View style={styles.sizeSelector}>
        {[100, 200, 400].map((size) => (
          <Button
            key={size}
            title={`${size}px${size === maxWidth ? ' ✓' : ''}`}
            disabled={busy}
            onPress={() => setMaxWidth(size)}
          />
        ))}
      </View>
      <Text>Choose a size, then pick a PDF or generate all pages.</Text>
      <Button onPress={pickPdf} title="Pick PDF File" disabled={busy} />
      <Button
        onPress={generateAllPages}
        title="Generate all pages"
        disabled={busy || !fileUri}
      />
      <View style={styles.grid}>
        {thumbnails.map((result, page) => (
          <View key={result.uri} style={styles.gridCell}>
            <Image
              source={result}
              resizeMode="contain"
              style={styles.gridImage}
            />
            <Text>Page {page + 1}</Text>
            <Text>
              {result.width} × {result.height}px
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
  },
  sizeSelector: {
    flexDirection: 'row',
    marginVertical: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  gridCell: {
    width: 140,
    alignItems: 'center',
    padding: 8,
  },
  gridImage: {
    width: 120,
    height: 160,
  },
  thumbnailPreview: {
    padding: 20,
    alignItems: 'center',
  },
  thumbnailImage: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  thumbnailInfo: {
    color: 'darkblue',
  },
  thumbnailError: {
    color: 'crimson',
  },
});
