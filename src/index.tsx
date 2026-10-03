import { Platform } from 'react-native';
import NativePdfThumbnail, {
  type Spec,
  type ThumbnailResult,
} from './NativePdfThumbnail';

/** A generated cache JPEG and its actual pixel dimensions. */
export type { ThumbnailResult } from './NativePdfThumbnail';

/**
 * JPEG encoding and output-size options for either generation method.
 *
 * @remarks
 * Size limits preserve aspect ratio, never upscale, and render directly into
 * the target bitmap. For displayed crop-box dimensions w and h, the scale is
 * min(1, maxWidth / w, maxHeight / h), ignoring omitted limits. Each output
 * dimension is max(1, Math.round(dimension * scale)); without limits, rendering
 * uses one pixel per PDF point, independent of screen density.
 *
 * Invalid containers, non-number/NaN quality, or non-positive/non-finite limits
 * reject with a JavaScript TypeError without a PDF error code.
 */
export type GenerateOptions = {
  /** JPEG quality; defaults to 80, clamps to 0–100 (including infinities), then truncates to an integer. */
  quality?: number;
  /** Positive finite maximum output width in pixels. Omit for unlimited width. */
  maxWidth?: number;
  /** Positive finite maximum output height in pixels. Omit for unlimited height. */
  maxHeight?: number;
};

/**
 * Frozen, named PDF failure codes shared by both generation methods.
 *
 * @remarks
 * Rejections include code and a human-readable message naming the file and
 * page where relevant. Option TypeErrors and the linking error have no PDF
 * code. Owner-only encrypted PDFs with an empty user password render normally;
 * there is no password parameter to unlock PDFs requiring a user password.
 */
export const PdfThumbnailErrorCodes = Object.freeze({
  /** Unsupported input scheme or path form; iOS also rejects content://. */
  UNSUPPORTED_URI: 'UNSUPPORTED_URI',
  /** Input does not exist or cannot be opened for reading, including permission failures. */
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  /** Input is readable but is not a readable PDF, or has no readable pages / invalid dimensions. */
  INVALID_FILE: 'INVALID_FILE',
  /** PDF requires a user password; Android also uses this for unsupported PDF security. */
  PASSWORD_PROTECTED: 'PASSWORD_PROTECTED',
  /** Page is not an integer >= 0 or is outside the document page range. */
  INVALID_PAGE: 'INVALID_PAGE',
  /** Android rendering allocation failed; iOS allocation failures cannot reliably be caught. */
  OUT_OF_MEMORY: 'OUT_OF_MEMORY',
  /** JPEG creation/writing or another unexpected failure. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const);

/** Union of the string values in {@link PdfThumbnailErrorCodes}. */
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

/**
 * Generates local JPEG thumbnails using iOS PDFKit and Android PdfRenderer.
 *
 * @remarks
 * Requires React Native >= 0.76 with the New Architecture; Expo development
 * builds work without a config plugin, while Expo Go is unsupported.
 * Both platforms render the rotated crop box (media box fallback) on white.
 * Each call creates new cache files: lookup caching, retention, invalidation
 * and cleanup belong to the app, and the OS may evict the files.
 */
export default class PdfThumbnail {
  /**
   * Renders one zero-based PDF page into a cache JPEG.
   *
   * @param filePath - Absolute filesystem path or local file:// URI (absolute
   * path; empty host or localhost). Android also accepts readable content://
   * URIs. Remote URLs, ph://, relative and empty paths are unsupported.
   * @param page - Integer >= 0. Fractional, negative or non-finite indexes
   * reject with INVALID_PAGE in JavaScript; native code checks page range.
   * @param options - Size/quality options, or a legacy numeric JPEG quality.
   * Defaults to quality 80 with no size cap; use limits for large pages.
   * @returns A JPEG file:// URI with actual width and height in pixels.
   * @throws A promise rejection with a PdfThumbnailErrorCodes code for PDF
   * failures, a TypeError for invalid options, or an Error if not linked.
   */
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

  /**
   * Renders every page, resolving once with results in document order.
   *
   * @param filePath - Absolute filesystem path or local file:// URI (absolute
   * path; empty host or localhost); Android also accepts readable content://.
   * Download remote PDFs or copy provider documents to app storage first.
   * @param options - Size/quality options, or a legacy numeric JPEG quality.
   * Defaults to quality 80 with no size cap; use limits for large pages.
   * @returns All generated cache JPEGs and their actual pixel dimensions.
   * @remarks
   * No progress callback, page ranges or cancellation. For progress, call
   * generate sequentially when the app already knows the page count. If a
   * page fails, the promise rejects and earlier output files may remain.
   * @throws A promise rejection with a PdfThumbnailErrorCodes code for PDF
   * failures, a TypeError for invalid options, or an Error if not linked.
   */
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
