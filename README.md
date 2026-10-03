# react-native-pdf-thumbnail

A react native module for generating thumbnail for PDF files.

A wrapper for:
- PDFKit on iOS (requires iOS 11+)
- PdfRenderer on Android (requires API level 21 - LOLLIPOP)

No other JavaScript or native dependencies.

Note: This module **does not** work in Expo.

## Installation

```sh
npm install react-native-pdf-thumbnail
```

## Usage

```js
import PdfThumbnail from "react-native-pdf-thumbnail";

// For iOS, the filePath can be a file URL.
// For Android, the filePath can be either a content URI, a file URI or an absolute path.
const filePath = 'file:///mnt/sdcard/myDocument.pdf';
const page = 0;

// The thumbnail image is stored in caches directory, file uri is returned.
// Image dimensions are also available to help you display it correctly.
const { uri, width, height } = await PdfThumbnail.generate(filePath, page);

// Generate thumbnails for all pages, returning an array of the object above.
const results = await PdfThumbnail.generateAllPages(filePath);

// Default compression quality is 80, you can optionally specify a quality between 0 and 100.
const { uri, width, height } = await PdfThumbnail.generate(filePath, page, 95);
const results = await PdfThumbnail.generateAllPages(filePath, 90);
```

## Error codes

Both methods return promises. Handle failures with `try`/`catch` or `.catch()`;
rejections include a `code` and a human-readable message.

| Code | Android | iOS (unchanged) |
| --- | --- | --- |
| `FILE_NOT_FOUND` | Unsupported path form or no file descriptor returned. | Invalid file URL, or PDFKit cannot open the document. |
| `INVALID_PAGE` | Page index is outside the document's page range. | PDFKit cannot retrieve the requested page. |
| `INTERNAL_ERROR` | File I/O failures (including missing files and corrupt PDFs), permission denial when opening a URI, JPEG compression/write failures, or other runtime exceptions. | Cannot create or write JPEG image data. |
| `PASSWORD_PROTECTED` | New in 1.3.2: Android's PDF renderer rejects a password-protected PDF or unsupported PDF security. | Not used. |
| `OUT_OF_MEMORY` | New in 1.3.2: insufficient memory while generating thumbnails. | Not used. |

Password/security and memory failures on Android reject the promise so the app
can handle them. iOS password-protected document handling is unchanged.

## Demo

The React Native 0.87.1 example uses a PDF document picker. **Pick PDF File**
generates a thumbnail and displays its URI and dimensions. **Generate all pages**
uses the selected PDF and displays the page count.

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

iOS | Android
------- | ---
![86563759-d103db80-bf19-11ea-98a2-77788efe4938](https://user-images.githubusercontent.com/3325682/86644851-bfaae580-bf92-11ea-8b2b-f065784b3425.png) | ![86564313-dca3d200-bf1a-11ea-99fe-6f08a3302b20](https://user-images.githubusercontent.com/3325682/86644858-c174a900-bf92-11ea-8a01-79476b1050a1.png)

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT
