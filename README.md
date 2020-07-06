# react-native-pdf-thumbnail

A react native module for generating thumbnail for PDF files.

A wrapper for:
- PDFKit on iOS (requires iOS 11+)
- PdfRenderer on Android (requires API level 21 - LOLLIPOP)

No other JavaScript or native dependencies needed.

## Installation

```sh
npm install react-native-pdf-thumbnail
```

## Usage

```js
import PdfThumbnail from "react-native-pdf-thumbnail";

// fileUri can use `file` scheme on iOS, `file` and `content` schemes on Android

const { uri, width, height } = await PdfThumbnail.generate(fileUri, 0);

```

The example app contains a document picker, it generates thumbnail for the selected PDF file.
![iOS example app](https://user-images.githubusercontent.com/3325682/86563759-d103db80-bf19-11ea-98a2-77788efe4938.png)
![Android example app](https://user-images.githubusercontent.com/3325682/86564313-dca3d200-bf1a-11ea-99fe-6f08a3302b20.png)

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT
