import { beforeEach, expect, it, jest } from '@jest/globals';

const thumbnail = { uri: 'file:///thumbnail.jpg', width: 100, height: 200 };
const nativeModule = {
  generate: jest.fn<typeof import('../index').default.generate>(),
  generateAllPages:
    jest.fn<typeof import('../index').default.generateAllPages>(),
};

function loadWrapper(native: typeof nativeModule | null = nativeModule) {
  jest.resetModules();
  jest.doMock('react-native', () => ({
    NativeModules: native ? { PdfThumbnail: native } : {},
    Platform: { select: () => '' },
  }));
  return (require('../index') as typeof import('../index')).default;
}

beforeEach(() => {
  jest.clearAllMocks();
  nativeModule.generate.mockResolvedValue(thumbnail);
  nativeModule.generateAllPages.mockResolvedValue([thumbnail]);
});

it('forwards the file and page with default quality 80', async () => {
  const PdfThumbnail = loadWrapper();
  await expect(PdfThumbnail.generate('/document.pdf', 2)).resolves.toEqual(
    thumbnail
  );
  expect(nativeModule.generate).toHaveBeenCalledTimes(1);
  expect(nativeModule.generate).toHaveBeenCalledWith('/document.pdf', 2, 80);
});

it('forwards generateAllPages with default quality 80', async () => {
  const PdfThumbnail = loadWrapper();
  await expect(PdfThumbnail.generateAllPages('/document.pdf')).resolves.toEqual(
    [thumbnail]
  );
  expect(nativeModule.generateAllPages).toHaveBeenCalledTimes(1);
  expect(nativeModule.generateAllPages).toHaveBeenCalledWith(
    '/document.pdf',
    80
  );
});

it.each([
  [-10, 0],
  [0, 0],
  [45, 45],
  [100, 100],
  [110, 100],
])('clamps quality %i to %i for both methods', async (quality, expected) => {
  const PdfThumbnail = loadWrapper();
  await PdfThumbnail.generate('content://document/1', 3, quality);
  await PdfThumbnail.generateAllPages('content://document/1', quality);
  expect(nativeModule.generate).toHaveBeenCalledWith(
    'content://document/1',
    3,
    expected
  );
  expect(nativeModule.generateAllPages).toHaveBeenCalledWith(
    'content://document/1',
    expected
  );
});

it('rejects with the linking error for both methods when the native module is missing', async () => {
  const PdfThumbnail = loadWrapper(null);
  const linkingError = /react-native-pdf-thumbnail.*doesn't seem to be linked/;
  await expect(PdfThumbnail.generate('/document.pdf', 0)).rejects.toThrow(
    linkingError
  );
  await expect(PdfThumbnail.generateAllPages('/document.pdf')).rejects.toThrow(
    linkingError
  );
  expect(nativeModule.generate).not.toHaveBeenCalled();
  expect(nativeModule.generateAllPages).not.toHaveBeenCalled();
});
