# Changelog

# [2.0.0-rc.1](https://github.com/songsterq/react-native-pdf-thumbnail/compare/v1.3.2...v2.0.0-rc.1) (2026-10-03)

* feat(ios)!: honor crop boxes, rotation and locked PDFs ([b5bd162](https://github.com/songsterq/react-native-pdf-thumbnail/commit/b5bd162b1e07ff0a3085aa476d9dedab99734a5c))
* feat(android)!: unify PDF errors and bound rendering ([ebc0db4](https://github.com/songsterq/react-native-pdf-thumbnail/commit/ebc0db45d5863ac88c7c4f0053eacf961894bad3))
* feat!: validate inputs in JS and export error codes ([45d9510](https://github.com/songsterq/react-native-pdf-thumbnail/commit/45d95107aa74439cfdece24c2164ef181d3fe0bd))
* feat(ios)!: implement the module as an Objective-C++ TurboModule ([5e155e2](https://github.com/songsterq/react-native-pdf-thumbnail/commit/5e155e294e4fb083a7f69e70672ef45d3a8dd038))
* feat(android)!: implement the module as a TurboModule ([7e87dde](https://github.com/songsterq/react-native-pdf-thumbnail/commit/7e87dde8029ef288fdb40a058c8f3bffa3964d40))
* feat!: define the native interface with a codegen TurboModule spec ([b49b5dc](https://github.com/songsterq/react-native-pdf-thumbnail/commit/b49b5dcacec314d5fb85d4ec94be84064f952106))

### BREAKING CHANGES

* Android uses a codegen-backed TurboModule and requires the New Architecture. The library's Android minimum SDK is now 24 and its sources target Java 17.
* Fractional and otherwise invalid page indexes now reject
  with INVALID_PAGE before native rendering instead of being truncated.
  Invalid option containers, NaN or non-number quality, and non-positive or
  non-finite size limits reject with TypeError before reaching native code.
* iOS now rejects unsupported URI forms with UNSUPPORTED_URI,
  readable non-PDFs with INVALID_FILE, and PDFs requiring a user password
  with PASSWORD_PROTECTED instead of producing blank thumbnails. Outputs
  use the rotated crop box and explicit one-pixel-per-point dimensions;
  absolute filesystem paths are now supported.
* iOS requires the New Architecture and uses an Objective-C++ TurboModule instead of the Swift bridge module. The minimum iOS version follows the host React Native version.
* Requires React Native >= 0.76 with the New Architecture enabled. Apps using the legacy architecture must remain on version 1.x.
* Unsupported paths now reject with UNSUPPORTED_URI,
  missing or unreadable inputs reject with FILE_NOT_FOUND, and renderer
  construction failures for invalid PDFs reject with INVALID_FILE rather
  than INTERNAL_ERROR. Local file URIs require an absolute path and an
  empty host or localhost.
