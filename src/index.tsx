import { NativeModules, Platform } from 'react-native';

export type ThumbnailResult = {
  uri: string;
  width: number;
  height: number;
};

type NativeType = {
  generate(
    filePath: string,
    page: number,
    quality: number
  ): Promise<ThumbnailResult>;
  generateAllPages(
    filePath: string,
    quality: number
  ): Promise<ThumbnailResult[]>;
};

const LINKING_ERROR =
  `The package 'react-native-pdf-thumbnail' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const PdfThumbnailNativeModule: NativeType = NativeModules.PdfThumbnail
  ? NativeModules.PdfThumbnail
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

const DEFAULT_QUALITY = 80;

const sanitizeQuality = (quality?: number): number => {
  if (quality === undefined) {
    quality = DEFAULT_QUALITY;
  }
  return Math.min(Math.max(quality, 0), 100);
};

export default class PdfThumbnail {
  static async generate(
    filePath: string,
    page: number,
    quality?: number
  ): Promise<ThumbnailResult> {
    return PdfThumbnailNativeModule.generate(
      filePath,
      page,
      sanitizeQuality(quality)
    );
  }

  static async generateAllPages(
    filePath: string,
    quality?: number
  ): Promise<ThumbnailResult[]> {
    return PdfThumbnailNativeModule.generateAllPages(
      filePath,
      sanitizeQuality(quality)
    );
  }
}
