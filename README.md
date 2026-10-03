# react-native-pdf-thumbnail

A react native module for generating thumbnail for PDF files.

A wrapper for:

- PDFKit on iOS (minimum iOS version follows the host React Native version)
- PdfRenderer on Android (requires API level 24+)

No other JavaScript or native dependencies.

Note: This module **does not** work in Expo Go.

## Installation

Version 2.x requires **React Native >= 0.76 with the New Architecture enabled**.
Use version 1.x for apps using the legacy architecture.

```sh
npm install react-native-pdf-thumbnail
```

Rebuild your native app after installation. On iOS, run `pod install` first.

CI smoke-tests React Native 0.76.9 on Android and the latest React Native on
Android and iOS. React Native 0.76–0.78 iOS builds are blocked with current Xcode
by an upstream `fmt` compilation issue.

## Usage

```ts
import PdfThumbnail, {
  PdfThumbnailErrorCodes,
  type GenerateOptions,
  type PdfThumbnailErrorCode,
  type ThumbnailResult,
} from 'react-native-pdf-thumbnail';

// Both platforms accept file:// URIs and absolute paths.
// Android also accepts content:// URIs from document providers.
const filePath = 'file:///path/to/myDocument.pdf';
const options: GenerateOptions = { quality: 80, maxWidth: 200, maxHeight: 200 };

const thumbnail: ThumbnailResult = await PdfThumbnail.generate(
  filePath,
  0,
  options
);
const pages = await PdfThumbnail.generateAllPages(filePath, options);

// 1.x-style quality arguments remain supported; omitted quality defaults to 80.
await PdfThumbnail.generate(filePath, 0);
await PdfThumbnail.generate(filePath, 0, 95);
await PdfThumbnail.generateAllPages(filePath, 90);

try {
  await PdfThumbnail.generate(filePath, 0, options);
} catch (error) {
  const failure = error as { code?: PdfThumbnailErrorCode; message: string };
  if (failure.code === PdfThumbnailErrorCodes.PASSWORD_PROTECTED) {
    console.log('This PDF requires a password.');
  }
}
```

### API

```ts
type ThumbnailResult = { uri: string; width: number; height: number };
type GenerateOptions = { quality?: number; maxWidth?: number; maxHeight?: number };

PdfThumbnail.generate(filePath: string, page: number, options?: GenerateOptions | number): Promise<ThumbnailResult>;
PdfThumbnail.generateAllPages(filePath: string, options?: GenerateOptions | number): Promise<ThumbnailResult[]>;
```

`page` is a zero-based integer. Negative, fractional and non-finite pages reject
with `INVALID_PAGE` in JavaScript before native rendering; an index outside the
document also rejects with `INVALID_PAGE`. Unlike 1.x, fractional pages are never
silently truncated.

`quality` is a number clamped to 0–100, default 80 (including infinities). The native JPEG encoder
uses its integer part, as in 1.x. A bare number means quality for either method.
`maxWidth` and `maxHeight` are optional positive finite numbers. Invalid options,
quality (`NaN` or a non-number) or sizes reject with a JavaScript `TypeError` (no PDF error code).
Omit a size to leave that axis unlimited; passing zero is invalid in the public API.

Use size limits for thumbnails, especially with very large PDFs: both platforms
render directly into a bitmap of the target size. There is no default limit and
no upscaling. For displayed page dimensions `w` and `h`, the scale is
`min(1, maxWidth / w, maxHeight / h)` with omitted limits ignored. Each output
dimension is `max(1, round(dimension × scale))`. A 612×792 page with `maxWidth: 200`
produces 200×259 pixels; adding `maxHeight: 100` produces 77×100 pixels.

Results are JPEG files in the app's cache directory. `uri` is a plain `file://`
URI; `width` and `height` are the actual JPEG **pixel dimensions**, independent of
screen density. Without limits, rendering uses 1 pixel per PDF point. Both
platforms display the **crop box**, falling back to the media box when absent,
and apply the page's `/Rotate`. A rotated 612×792 page displays at 792×612.
The background is white. `generateAllPages` preserves document page order.
There is no thumbnail lookup cache; apps can retain results and manage their
lifetime as needed.

### Error codes

Both methods return promises. PDF failures include a `code` and a human-readable
`message` naming the input file (and page when relevant). `PdfThumbnailErrorCode`
is a TypeScript union; `PdfThumbnailErrorCodes` is the frozen constant object
containing these same codes.

| Code                 | When                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `UNSUPPORTED_URI`    | Unsupported scheme or path form: remote URLs, `ph://`, relative paths, or empty paths. iOS also rejects `content://`. |
| `FILE_NOT_FOUND`     | The file does not exist or cannot be opened for reading, including permission failures.                               |
| `INVALID_FILE`       | The file can be read but is not a readable PDF.                                                                       |
| `PASSWORD_PROTECTED` | A user password is required to open the PDF. Android also reports this for unsupported PDF security.                  |
| `INVALID_PAGE`       | The page is not an integer ≥ 0, or is outside the document's page range.                                              |
| `OUT_OF_MEMORY`      | Android cannot allocate memory for rendering. iOS allocation failure cannot reliably be caught.                       |
| `INTERNAL_ERROR`     | JPEG creation/writing or another unexpected failure.                                                                  |

Encrypted PDFs with only an owner password (empty user password) render normally.
There is no password argument to unlock PDFs. Download remote files in your app
before calling this module; both platforms reject remote URLs without loading them.
Local file URIs use an empty host or `localhost` and an absolute file path.

These 2.x changes are deliberate: unsupported paths, missing files and invalid
PDFs have distinct codes; iOS rejects locked PDFs instead of returning a blank
image; iOS uses the crop box; and fractional page indexes are rejected.

## Demo

The React Native 0.87.1 example uses a PDF document picker. **Pick PDF File**
generates a thumbnail and displays its URI and pixel dimensions. Choose a maximum
output width of 100, 200 or 400 pixels before generating. **Generate all pages**
uses that width and displays a grid with each page's dimensions and the page count.

Use Node 24 (see `.nvmrc`) and Yarn 4.11.0. From the repository root:

```sh
corepack enable
yarn install --immutable
yarn example start
# In a second terminal:
yarn example ios
# Or:
yarn example android
```

The iOS command installs pods automatically. See [CONTRIBUTING.md](CONTRIBUTING.md)
for native setup, build commands, and checks.

| iOS                                                                                                                                                   | Android                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![86563759-d103db80-bf19-11ea-98a2-77788efe4938](https://user-images.githubusercontent.com/3325682/86644851-bfaae580-bf92-11ea-8b2b-f065784b3425.png) | ![86564313-dca3d200-bf1a-11ea-99fe-6f08a3302b20](https://user-images.githubusercontent.com/3325682/86644858-c174a900-bf92-11ea-8a01-79476b1050a1.png) |

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT
