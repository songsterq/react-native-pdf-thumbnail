# Migrating from 1.x to 2.0

2.0 keeps the default `PdfThumbnail` export, both method names, and the numeric
quality argument. It moves to TurboModules and makes PDF validation and rendering
consistent across iOS and Android. Review these changes before upgrading; the
[README](README.md) contains the full API and recipes.

## Requirements and installation

| Requirement  | 1.x                               | 2.0                                                                      |
| ------------ | --------------------------------- | ------------------------------------------------------------------------ |
| React Native | >= 0.60; peer dependency `*`      | >= 0.76                                                                  |
| Architecture | Legacy bridge module / interop    | New Architecture required on both platforms                              |
| Android      | minSdk 21                         | minSdk 24; native sources target Java 17                                 |
| iOS          | Minimum 11; Swift bridge module   | RN's minimum (15.1); Objective-C++ TurboModule                           |
| Expo         | Native development build required | Native development build required; no config plugin; Expo Go unsupported |

Upgrade the host app first, enable the New Architecture, update its platform
minimums, install 2.x, run iOS pods, and rebuild the native binaries. CI tests
RN 0.76.9 on Android and latest RN on Android and iOS. RN 0.76–0.78 iOS is blocked
with current Xcode by an upstream `fmt` issue. Running with the New Architecture
disabled (possible on RN 0.76–0.81) is unsupported and untested; stay on 1.x
instead.

```sh
npm install react-native-pdf-thumbnail@^2
cd ios
bundle exec pod install
cd ..
npx react-native run-ios
# Or: npx react-native run-android
```

Before the stable release, test the RC with
`npm install react-native-pdf-thumbnail@next`. Expo apps can use
`npx expo install react-native-pdf-thumbnail@next`, then prebuild and rebuild the
development client.

## Calls that still work

These existing 1.x calls compile and behave the same in 2.0. Quality defaults to
80, clamps to 0–100 (including infinities), and the native encoder uses its
integer part. Outputs are still JPEGs in app cache storage with `file://` URIs.

```ts
import PdfThumbnail, { type ThumbnailResult } from 'react-native-pdf-thumbnail';

declare const localPdf: string;
const first: ThumbnailResult = await PdfThumbnail.generate(localPdf, 0);
const highQuality = await PdfThumbnail.generate(localPdf, 0, 95);
const all = await PdfThumbnail.generateAllPages(localPdf, 80);
console.log(first.uri, highQuality.width, all.length);
```

There is no implicit thumbnail lookup cache. Apps still own reuse, retention and
cleanup; see the [cache recipe](README.md#cache-by-path--page--options).

## Error-code changes

Replace logic that treated missing inputs and invalid documents as the same
failure. Prefer the new frozen `PdfThumbnailErrorCodes` object and its
`PdfThumbnailErrorCode` union over handwritten strings.

| Situation                                   | 1.x                                                                                | 2.0                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Unsupported scheme / relative or empty path | Android: `FILE_NOT_FOUND`; iOS attempted URL loading, often `FILE_NOT_FOUND`       | `UNSUPPORTED_URI` on both platforms                                               |
| Missing or unreadable file                  | Android open failures: `INTERNAL_ERROR`; iOS: `FILE_NOT_FOUND`                     | `FILE_NOT_FOUND` on both platforms                                                |
| Readable non-PDF / truncated PDF            | Android renderer failures: `INTERNAL_ERROR`; iOS: `FILE_NOT_FOUND`                 | `INVALID_FILE` on both platforms                                                  |
| User-password PDF                           | Android: `PASSWORD_PROTECTED`; iOS could resolve with a blank thumbnail            | `PASSWORD_PROTECTED` on both platforms                                            |
| Invalid page                                | `INVALID_PAGE` for out-of-range indexes; fractional values truncated by the bridge | `INVALID_PAGE`, including fractional / non-finite indexes before native rendering |
| Bitmap allocation failure                   | Android: `OUT_OF_MEMORY`; iOS not reliably catchable                               | Same limitation; bound rendering with size options                                |
| JPEG writing / unexpected failure           | `INTERNAL_ERROR`                                                                   | `INTERNAL_ERROR`                                                                  |

Android also reports unsupported PDF security as `PASSWORD_PROTECTED`. Error
messages now include the source file and page where relevant; treat `code` as
the machine-readable contract rather than matching full message strings.

```ts
import PdfThumbnail, {
  PdfThumbnailErrorCodes,
} from 'react-native-pdf-thumbnail';

declare const localPdf: string;
try {
  await PdfThumbnail.generate(localPdf, 0, { maxWidth: 200 });
} catch (error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    switch (error.code) {
      case PdfThumbnailErrorCodes.FILE_NOT_FOUND:
        console.log('Restore access to the file or select it again.');
        break;
      case PdfThumbnailErrorCodes.INVALID_FILE:
        console.log('Choose a readable PDF.');
        break;
      case PdfThumbnailErrorCodes.UNSUPPORTED_URI:
        console.log('Download or copy the document to app storage first.');
        break;
      default:
        throw error;
    }
  } else {
    throw error;
  }
}
```

## Page validation

**Before:** `generate(path, 1.7)` was silently truncated to page 1 by the bridge.
**After:** it rejects with `INVALID_PAGE`. Negative, NaN and infinite pages also
reject in JavaScript before opening the PDF; native code checks the document's
page range. The first page remains index 0.

Validate page selection in the app. If fractional values come from an intentional
UI calculation, explicitly convert them before the call:

```ts
import PdfThumbnail from 'react-native-pdf-thumbnail';

declare const localPdf: string;
declare const selectedPage: number;
const page = Math.trunc(selectedPage);
if (!Number.isFinite(page) || page < 0)
  throw new Error('Invalid page selection');
await PdfThumbnail.generate(localPdf, page, { maxWidth: 200 });
```

## Options and `TypeError`

**Before:** only a numeric quality argument was supported; invalid values could
be coerced or reach native code. **After:** numeric quality still works, and
`GenerateOptions` adds `maxWidth` and `maxHeight`. Invalid option containers,
non-number/NaN quality, and non-positive or non-finite limits reject with a
JavaScript `TypeError`, without a PDF error code. Because the methods are async,
catch this by awaiting the promise.

An omitted size is unlimited; use `undefined` or omit the key instead of zero.
Positive finite fractional limits are accepted. Infinities are permitted for
quality (clamped), but not for size limits.

```ts
import PdfThumbnail, { type GenerateOptions } from 'react-native-pdf-thumbnail';

declare const localPdf: string;
const options: GenerateOptions = { quality: 80, maxWidth: 200 };
try {
  await PdfThumbnail.generate(localPdf, 0, options);
} catch (error) {
  if (error instanceof TypeError) console.log(error.message);
  else throw error;
}
```

## Crop box, rotation and output dimensions

**Before:** iOS used the media box and returned its dimensions, which could differ
from the encoded thumbnail pixels and omit the displayed rotation in metadata.
**After:** both platforms render the crop box, fall back to the media box if it
is absent, and apply intrinsic rotation. iOS accepts absolute filesystem paths
as well as local file URIs. Width and height describe the actual JPEG pixels,
independent of screen density; unbounded rendering uses one pixel per PDF point.

For the test fixtures, a 612×792 media box with a 300×400 crop now yields 300×400
on iOS, matching Android. A 612×792 page rotated 90° / 270° yields 792×612 with
upright content. Update layouts or snapshot expectations that assumed iOS media
box sizes or unrotated metadata. The white background remains unchanged.

Size limits render directly into a smaller bitmap and never upscale. A normal
612×792 page with `maxWidth: 200` yields 200×259; adding `maxHeight: 100` yields
77×100. See the [sizing formula](README.md#sizing-crop-box-and-rotation). There is
no default cap: set limits for thumbnails of large pages and avoid requesting
all pages concurrently.

## Local inputs and remote URL removal

**Before:** iOS attempted synchronous URL loading, including remote URLs;
Android did not support remote URLs. **After:** both platforms reject remote
URLs without loading them, with `UNSUPPORTED_URI`. `ph://`, relative and empty
paths are unsupported too. Download in the app before generating thumbnails.

Local `file://` URIs now require an absolute path and an empty host or
`localhost`; forms such as `file://other-host/document.pdf` are rejected.
Absolute filesystem paths work on both platforms. Android additionally accepts
readable `content://` URIs; iOS does not. Copy picker documents into app storage
when needed; see the [picker recipe](README.md#pick-a-pdf-with-react-native-documentspicker).

This download example uses the example app's existing
`@dr.pogodin/react-native-fs` dependency; install a compatible version in your
app and rebuild before using it.

```ts
import {
  CachesDirectoryPath,
  downloadFile,
  exists,
  unlink,
} from '@dr.pogodin/react-native-fs';
import PdfThumbnail from 'react-native-pdf-thumbnail';

export async function downloadThumbnail(remoteUrl: string) {
  // Use an app-owned, unique destination for each request.
  const destination = `${CachesDirectoryPath}/pdf-${Date.now()}-${Math.random()}.pdf`;
  try {
    const response = await downloadFile({
      fromUrl: remoteUrl,
      toFile: destination,
    }).promise;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Download failed: HTTP ${response.statusCode}`);
    }
    return await PdfThumbnail.generate(destination, 0, { maxWidth: 200 });
  } finally {
    if (await exists(destination)) await unlink(destination);
  }
}
```

Authenticate downloads and choose timeouts according to your app. The JPEG is
separate from the source file and still needs its own cleanup policy.

## Encrypted PDFs

**Before:** iOS could produce a blank thumbnail for a PDF requiring a user
password. **After:** it rejects with `PASSWORD_PROTECTED`, matching Android.
Owner-only encryption with an empty user password still renders normally on
both platforms. There is no password argument in 2.0: to render a locked PDF,
your app must first obtain an unlocked local PDF through another component.

## Staying on 1.x

Legacy-architecture apps should use 1.x, maintained on the
[`1.x` branch](https://github.com/songsterq/react-native-pdf-thumbnail/tree/1.x).
The latest maintenance release is 1.3.2. Fixes are cherry-picked by the maintainer;
2.x features and guarantees do not apply to that line.

```sh
npm install react-native-pdf-thumbnail@^1.3.2
```

Keep your existing legacy native setup. Upgrade to 2.x once the host app can meet
the RN, architecture and platform requirements above.
