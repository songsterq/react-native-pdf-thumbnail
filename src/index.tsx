import { NativeModules, Platform } from 'react-native';

export type ThumbnailResult = {
  uri: string;
  width: number;
  height: number;
};

type PdfThumbnailType = {
  generate(filePath: string, page: number): Promise<ThumbnailResult>;
  generateAllPages(filePath: string): Promise<ThumbnailResult[]>;
};

const LINKING_ERROR =
  `The package 'react-native-pdf-thumbnail' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo managed workflow\n';

const PdfThumbnail = NativeModules.PdfThumbnail
  ? NativeModules.PdfThumbnail
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export default PdfThumbnail as PdfThumbnailType;
