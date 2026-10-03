import { TurboModuleRegistry, type TurboModule } from 'react-native';

export type ThumbnailResult = { uri: string; width: number; height: number };

export interface Spec extends TurboModule {
  // maxWidth / maxHeight: 0 means unlimited. Inputs are validated in JS.
  generate(
    filePath: string,
    page: number,
    quality: number,
    maxWidth: number,
    maxHeight: number
  ): Promise<ThumbnailResult>;
  generateAllPages(
    filePath: string,
    quality: number,
    maxWidth: number,
    maxHeight: number
  ): Promise<ThumbnailResult[]>;
}

export default TurboModuleRegistry.get<Spec>('PdfThumbnail');
