import { TurboModuleRegistry, type TurboModule } from 'react-native';

/** A generated JPEG in app cache storage; the app owns retention and cleanup. */
export type ThumbnailResult = {
  /** Plain file:// URI. Each call creates a new file; the OS may evict it. */
  uri: string;
  /** Actual JPEG width in pixels, independent of screen density. */
  width: number;
  /** Actual JPEG height in pixels, independent of screen density. */
  height: number;
};

/**
 * Positional native codegen contract used by the public JavaScript wrapper.
 * @internal
 */
export interface Spec extends TurboModule {
  /** Renders one page; size 0 is the native unlimited sentinel. JS validates inputs. */
  generate(
    filePath: string,
    page: number,
    quality: number,
    maxWidth: number,
    maxHeight: number
  ): Promise<ThumbnailResult>;
  /** Renders all pages in order; size 0 is the native unlimited sentinel. */
  generateAllPages(
    filePath: string,
    quality: number,
    maxWidth: number,
    maxHeight: number
  ): Promise<ThumbnailResult[]>;
}

/** Native registration, or null when unavailable; the public wrapper supplies the linking error. @internal */
export default TurboModuleRegistry.get<Spec>('PdfThumbnail');
