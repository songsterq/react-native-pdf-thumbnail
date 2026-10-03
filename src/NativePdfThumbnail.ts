import { TurboModuleRegistry, type TurboModule } from 'react-native';

export type ThumbnailResult = { uri: string; width: number; height: number };

export interface Spec extends TurboModule {
  generate(
    filePath: string,
    page: number,
    quality: number
  ): Promise<ThumbnailResult>;
  generateAllPages(
    filePath: string,
    quality: number
  ): Promise<ThumbnailResult[]>;
}

export default TurboModuleRegistry.get<Spec>('PdfThumbnail');
