import { NativeModules } from 'react-native';

type PdfThumbnailType = {
  multiply(a: number, b: number): Promise<number>;
};

const { PdfThumbnail } = NativeModules;

export default PdfThumbnail as PdfThumbnailType;
