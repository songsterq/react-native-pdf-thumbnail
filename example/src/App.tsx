import * as React from 'react';
import { Button, Image, StyleSheet, Text, View } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import PdfThumbnail, { ThumbnailResult } from 'react-native-pdf-thumbnail';

export default function App() {
  const [thumbnail, setThumbnail] = React.useState<
    ThumbnailResult | undefined
  >();
  const [error, setError] = React.useState<
    { code: string; message: string } | undefined
  >();

  const onPress = async () => {
    try {
      const { uri } = await DocumentPicker.pick({
        type: [DocumentPicker.types.pdf],
      });
      const result = await PdfThumbnail.generate(uri, 0);
      setThumbnail(result);
      setError(undefined);
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        // User cancelled the picker, exit any dialogs or menus and move on
      } else {
        setThumbnail(undefined);
        setError(err);
      }
    }
  };

  const thumbnailResult = thumbnail ? (
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
  ) : null;

  const thumbnailError = error ? (
    <>
      <Text style={styles.thumbnailError}>Error code: {error.code}</Text>
      <Text style={styles.thumbnailError}>Error message: {error.message}</Text>
    </>
  ) : null;

  return (
    <View style={styles.container}>
      <View style={styles.thumbnailPreview}>
        {thumbnailResult}
        {thumbnailError}
      </View>
      <Button onPress={onPress} title="Pick PDF File" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
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
