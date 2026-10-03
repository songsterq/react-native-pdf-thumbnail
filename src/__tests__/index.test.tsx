import { beforeEach, expect, it, jest } from '@jest/globals';
import type { Spec } from '../NativePdfThumbnail';
import type { GenerateOptions, PdfThumbnailErrorCode } from '../index';

const thumbnail = { uri: 'file:///thumbnail.jpg', width: 100, height: 200 };
const nativeModule = {
  generate: jest.fn<Spec['generate']>(),
  generateAllPages: jest.fn<Spec['generateAllPages']>(),
};

function loadExports(native: typeof nativeModule | null = nativeModule) {
  jest.resetModules();
  jest.doMock('react-native', () => ({
    TurboModuleRegistry: {
      get: jest.fn((name: string) => (name === 'PdfThumbnail' ? native : null)),
    },
    Platform: { select: () => '' },
  }));
  return require('../index') as typeof import('../index');
}

beforeEach(() => {
  jest.clearAllMocks();
  nativeModule.generate.mockResolvedValue(thumbnail);
  nativeModule.generateAllPages.mockResolvedValue([thumbnail]);
});

it.each([undefined, {}, { quality: undefined }])(
  'uses quality 80 and unlimited sizes for %p on both methods',
  async (options) => {
    const PdfThumbnail = loadExports().default;
    await expect(
      PdfThumbnail.generate('/document.pdf', 2, options)
    ).resolves.toEqual(thumbnail);
    await expect(
      PdfThumbnail.generateAllPages('/document.pdf', options)
    ).resolves.toEqual([thumbnail]);
    expect(nativeModule.generate).toHaveBeenCalledWith(
      '/document.pdf',
      2,
      80,
      0,
      0
    );
    expect(nativeModule.generateAllPages).toHaveBeenCalledWith(
      '/document.pdf',
      80,
      0,
      0
    );
  }
);

it.each([
  [-Infinity, 0],
  [Infinity, 100],
  [-10, 0],
  [0, 0],
  [45.9, 45.9],
  [50, 50],
  [100, 100],
  [110, 100],
])(
  'clamps quality %p to %p in both options forms and methods',
  async (quality, expected) => {
    const PdfThumbnail = loadExports().default;
    for (const options of [quality, { quality }]) {
      await PdfThumbnail.generate('content://document/1', 3, options);
      await PdfThumbnail.generateAllPages('content://document/1', options);
    }
    expect(nativeModule.generate).toHaveBeenCalledTimes(2);
    expect(nativeModule.generateAllPages).toHaveBeenCalledTimes(2);
    expect(nativeModule.generate).toHaveBeenCalledWith(
      'content://document/1',
      3,
      expected,
      0,
      0
    );
    expect(nativeModule.generateAllPages).toHaveBeenCalledWith(
      'content://document/1',
      expected,
      0,
      0
    );
  }
);

it.each([
  [{ maxWidth: 200 }, 80, 200, 0],
  [{ maxHeight: 100 }, 80, 0, 100],
  [{ quality: 50, maxWidth: 200, maxHeight: 100 }, 50, 200, 100],
  [{ maxWidth: 2000 }, 80, 2000, 0],
  [{ maxWidth: 0.5, maxHeight: 1.25 }, 80, 0.5, 1.25],
] as [GenerateOptions, number, number, number][])(
  'forwards positive sizes in %p without rounding',
  async (options, quality, width, height) => {
    const PdfThumbnail = loadExports().default;
    await PdfThumbnail.generate('file:///document.pdf', 0, options);
    await PdfThumbnail.generateAllPages('file:///document.pdf', options);
    expect(nativeModule.generate).toHaveBeenCalledWith(
      'file:///document.pdf',
      0,
      quality,
      width,
      height
    );
    expect(nativeModule.generateAllPages).toHaveBeenCalledWith(
      'file:///document.pdf',
      quality,
      width,
      height
    );
  }
);

it.each([-1, 1.5, NaN, Infinity, -Infinity, '0', null, undefined])(
  'rejects invalid page %p in JS without calling native',
  async (page) => {
    const PdfThumbnail = loadExports().default;
    const error = PdfThumbnail.generate('/document.pdf', page as number);
    await expect(error).rejects.toMatchObject({
      code: 'INVALID_PAGE',
      message: expect.stringContaining('/document.pdf'),
    });
    expect(nativeModule.generate).not.toHaveBeenCalled();
  }
);

it.each([0, 2, 3, Number.MAX_SAFE_INTEGER])(
  'forwards nonnegative integer page %p for native range checking',
  async (page) => {
    await loadExports().default.generate('/document.pdf', page);
    expect(nativeModule.generate).toHaveBeenCalledWith(
      '/document.pdf',
      page,
      80,
      0,
      0
    );
  }
);

it.each([NaN, '50', null])(
  'rejects invalid quality %p in both methods',
  async (quality) => {
    const PdfThumbnail = loadExports().default;
    for (const options of [quality, { quality }]) {
      await expect(
        PdfThumbnail.generate('/document.pdf', 0, options as GenerateOptions)
      ).rejects.toThrow(TypeError);
      await expect(
        PdfThumbnail.generateAllPages(
          '/document.pdf',
          options as GenerateOptions
        )
      ).rejects.toThrow(TypeError);
    }
    expect(nativeModule.generate).not.toHaveBeenCalled();
    expect(nativeModule.generateAllPages).not.toHaveBeenCalled();
  }
);

it.each([0, -1, NaN, Infinity, -Infinity, '200', null])(
  'rejects invalid size %p on either axis in both methods',
  async (size) => {
    const PdfThumbnail = loadExports().default;
    for (const name of ['maxWidth', 'maxHeight']) {
      const options = { [name]: size } as GenerateOptions;
      await expect(
        PdfThumbnail.generate('/document.pdf', 0, options)
      ).rejects.toThrow(/positive finite number.*document.pdf/);
      await expect(
        PdfThumbnail.generateAllPages('/document.pdf', options)
      ).rejects.toThrow(/positive finite number.*document.pdf/);
    }
    expect(nativeModule.generate).not.toHaveBeenCalled();
    expect(nativeModule.generateAllPages).not.toHaveBeenCalled();
  }
);

it.each([null, '50', [], true])(
  'rejects invalid options container %p',
  async (options) => {
    const PdfThumbnail = loadExports().default;
    await expect(
      PdfThumbnail.generate('/document.pdf', 0, options as GenerateOptions)
    ).rejects.toThrow(TypeError);
    await expect(
      PdfThumbnail.generateAllPages('/document.pdf', options as GenerateOptions)
    ).rejects.toThrow(TypeError);
    expect(nativeModule.generate).not.toHaveBeenCalled();
    expect(nativeModule.generateAllPages).not.toHaveBeenCalled();
  }
);

it('exports a frozen constant object and a matching error-code union', () => {
  const { PdfThumbnailErrorCodes } = loadExports();
  const code: PdfThumbnailErrorCode = PdfThumbnailErrorCodes.INVALID_FILE;
  expect(code).toBe('INVALID_FILE');
  expect(Object.isFrozen(PdfThumbnailErrorCodes)).toBe(true);
  expect(PdfThumbnailErrorCodes).toEqual({
    UNSUPPORTED_URI: 'UNSUPPORTED_URI',
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    INVALID_FILE: 'INVALID_FILE',
    PASSWORD_PROTECTED: 'PASSWORD_PROTECTED',
    INVALID_PAGE: 'INVALID_PAGE',
    OUT_OF_MEMORY: 'OUT_OF_MEMORY',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  });
});

it('passes native rejections through unchanged for both methods', async () => {
  const PdfThumbnail = loadExports().default;
  const error = Object.assign(
    new Error('File /document.pdf is not a readable PDF'),
    { code: 'INVALID_FILE' }
  );
  nativeModule.generate.mockRejectedValue(error);
  nativeModule.generateAllPages.mockRejectedValue(error);
  await expect(PdfThumbnail.generate('/document.pdf', 0)).rejects.toBe(error);
  await expect(PdfThumbnail.generateAllPages('/document.pdf')).rejects.toBe(
    error
  );
});

it('reports linking requirements at call time for both methods', async () => {
  const PdfThumbnail = loadExports(null).default;
  await expect(PdfThumbnail.generate('/document.pdf', 0)).rejects.toThrow(
    /React Native >= 0\.76 with the New Architecture enabled/
  );
  await expect(PdfThumbnail.generateAllPages('/document.pdf')).rejects.toThrow(
    /react-native-pdf-thumbnail.*doesn't seem to be linked/
  );
});

it('looks up PdfThumbnail through TurboModuleRegistry', () => {
  loadExports();
  const { TurboModuleRegistry } = require('react-native');
  expect(TurboModuleRegistry.get).toHaveBeenCalledTimes(1);
  expect(TurboModuleRegistry.get).toHaveBeenCalledWith('PdfThumbnail');
});
