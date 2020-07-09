import { NativeModules } from 'react-native';

export type ThumbnailResult = {
  uri: string;
  width: number;
  height: number;
};

type PdfThumbnailType = {
  generate(filePath: string, page: number): Promise<ThumbnailResult>;
  generateAllPages(filePath: string): Promise<ThumbnailResult[]>;
};

const { PdfThumbnail } = NativeModules;

export default PdfThumbnail as PdfThumbnailType;
