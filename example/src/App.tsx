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
  const [fileUri, setFileUri] = useState<string>();
  const [thumbnail, setThumbnail] = useState<ThumbnailResult>();
  const [pageCount, setPageCount] = useState<number>();
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
      setPageCount(undefined);
      setThumbnail(await PdfThumbnail.generate(document.uri, 0, 100));
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
    setPageCount(undefined);
    try {
      const results = await PdfThumbnail.generateAllPages(fileUri, 100);
      setThumbnail(results[0]);
      setPageCount(results.length);
    } catch (e) {
      setThumbnail(undefined);
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
        {pageCount !== undefined ? (
          <Text style={styles.thumbnailInfo}>Page count: {pageCount}</Text>
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
      <Button onPress={pickPdf} title="Pick PDF File" disabled={busy} />
      <Button
        onPress={generateAllPages}
        title="Generate all pages"
        disabled={busy || !fileUri}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
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
