import { Platform } from 'react-native';
import NativePdfThumbnail, {
  type Spec,
  type ThumbnailResult,
} from './NativePdfThumbnail';

export type { ThumbnailResult } from './NativePdfThumbnail';

export type GenerateOptions = {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
};

export const PdfThumbnailErrorCodes = Object.freeze({
  UNSUPPORTED_URI: 'UNSUPPORTED_URI',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  INVALID_FILE: 'INVALID_FILE',
  PASSWORD_PROTECTED: 'PASSWORD_PROTECTED',
  INVALID_PAGE: 'INVALID_PAGE',
  OUT_OF_MEMORY: 'OUT_OF_MEMORY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const);

export type PdfThumbnailErrorCode =
  (typeof PdfThumbnailErrorCodes)[keyof typeof PdfThumbnailErrorCodes];

const LINKING_ERROR =
  `The package 'react-native-pdf-thumbnail' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You are using React Native >= 0.76 with the New Architecture enabled\n' +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const PdfThumbnailNativeModule: Spec = NativePdfThumbnail
  ? NativePdfThumbnail
  : new Proxy({} as Spec, {
      get() {
        throw new Error(LINKING_ERROR);
      },
    });

const DEFAULT_QUALITY = 80;

const parseOptions = (
  options: GenerateOptions | number | undefined,
  context: string
): [quality: number, maxWidth: number, maxHeight: number] => {
  if (
    options !== undefined &&
    typeof options !== 'number' &&
    (typeof options !== 'object' || options === null || Array.isArray(options))
  ) {
    throw new TypeError(`Options must be a number or object for ${context}`);
  }
  const parsed = typeof options === 'number' ? { quality: options } : options;
  const suppliedQuality = parsed?.quality;
  const quality =
    suppliedQuality === undefined ? DEFAULT_QUALITY : suppliedQuality;
  // Keep 1.x clamping, including +/-Infinity. NaN cannot become a JPEG quality.
  if (typeof quality !== 'number' || Number.isNaN(quality)) {
    throw new TypeError(
      `Quality must be a number other than NaN for ${context}`
    );
  }
  const size = (name: 'maxWidth' | 'maxHeight'): number => {
    const value = parsed?.[name];
    if (value === undefined) {
      return 0; // Native sentinel: unlimited.
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new TypeError(
        `${name} must be a positive finite number for ${context}`
      );
    }
    return value;
  };
  return [
    Math.min(Math.max(quality, 0), 100),
    size('maxWidth'),
    size('maxHeight'),
  ];
};

export default class PdfThumbnail {
  static async generate(
    filePath: string,
    page: number,
    options?: GenerateOptions | number
  ): Promise<ThumbnailResult> {
    const context = `file ${filePath}, page ${page}`;
    if (!Number.isInteger(page) || page < 0) {
      throw Object.assign(
        new Error(`Page number ${page} is invalid for ${context}`),
        {
          code: PdfThumbnailErrorCodes.INVALID_PAGE,
        }
      );
    }
    return PdfThumbnailNativeModule.generate(
      filePath,
      page,
      ...parseOptions(options, context)
    );
  }

  static async generateAllPages(
    filePath: string,
    options?: GenerateOptions | number
  ): Promise<ThumbnailResult[]> {
    return PdfThumbnailNativeModule.generateAllPages(
      filePath,
      ...parseOptions(options, `file ${filePath}`)
    );
  }
}
