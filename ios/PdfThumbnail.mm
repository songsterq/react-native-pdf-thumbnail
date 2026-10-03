#import "PdfThumbnail.h"
#import <PDFKit/PDFKit.h>
#import <UIKit/UIKit.h>
#include <algorithm>
#include <cmath>
#include <stdint.h>
#include <stdlib.h>

@implementation PdfThumbnail {
  dispatch_queue_t _renderQueue;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _renderQueue = dispatch_queue_create("org.songsterq.pdfthumbnail.renderer", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

+ (NSString *)moduleName
{
  return @"PdfThumbnail";
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return _renderQueue;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativePdfThumbnailSpecJSI>(params);
}

- (NSString *)outputFilename:(NSString *)filePath page:(NSInteger)page
{
  NSString *prefix = [[[filePath componentsSeparatedByString:@"/"] lastObject]
      stringByReplacingOccurrencesOfString:@"." withString:@"-"];
  // Match Swift's nonnegative random Int in 0 ..< Int.max.
  uint64_t random;
  do {
    arc4random_buf(&random, sizeof(random));
    random &= (uint64_t)NSIntegerMax;
  } while (random == (uint64_t)NSIntegerMax);
  return [NSString stringWithFormat:@"%@-thumbnail-%ld-%llu.jpg", prefix ?: @"pdf",
                                    (long)page, (unsigned long long)random];
}

// Both public entry points share URI validation and the document-open errors.
- (PDFDocument *)documentForFile:(NSString *)filePath reject:(RCTPromiseRejectBlock)reject
{
  NSURL *fileURL = nil;
  if ([filePath hasPrefix:@"/"]) {
    fileURL = [NSURL fileURLWithPath:filePath];
  } else if ([filePath hasPrefix:@"file://"]) {
    NSURL *candidate = [NSURL URLWithString:filePath];
    if (candidate.isFileURL && [candidate.path hasPrefix:@"/"] &&
        (candidate.host.length == 0 || [candidate.host isEqualToString:@"localhost"])) {
      fileURL = candidate;
    }
  }
  if (!fileURL) {
    reject(@"UNSUPPORTED_URI", [NSString stringWithFormat:
        @"Unsupported URI for file %@; use an absolute path or file:// URI", filePath], nil);
    return nil;
  }
  NSError *readError = nil;
  // Local read only. Separates unreadable/missing files from readable non-PDFs.
  NSData *data = [NSData dataWithContentsOfURL:fileURL options:NSDataReadingMappedIfSafe error:&readError];
  if (!data) {
    reject(@"FILE_NOT_FOUND", [NSString stringWithFormat:
        @"File %@ cannot be opened for reading", filePath], readError);
    return nil;
  }
  PDFDocument *document = [[PDFDocument alloc] initWithData:data];
  if (!document) {
    reject(@"INVALID_FILE", [NSString stringWithFormat:@"File %@ is not a readable PDF", filePath], nil);
    return nil;
  }
  // isEncrypted also includes owner-only encryption; isLocked means a user
  // password is actually required. Check before pageCount/pageAtIndex/rendering.
  if (document.isLocked) {
    reject(@"PASSWORD_PROTECTED", [NSString stringWithFormat:@"File %@ requires a password", filePath], nil);
    return nil;
  }
  if (document.pageCount == 0) {
    reject(@"INVALID_FILE", [NSString stringWithFormat:@"File %@ has no readable PDF pages", filePath], nil);
    return nil;
  }
  return document;
}

- (NSDictionary *)generatePage:(PDFPage *)pdfPage
                      filePath:(NSString *)filePath
                          page:(NSInteger)page
                       quality:(NSInteger)quality
                      maxWidth:(double)maxWidth
                     maxHeight:(double)maxHeight
                        reject:(RCTPromiseRejectBlock)reject
{
  // PDFKit's boundsForBox returns unrotated page-space bounds intersected with
  // the media box (PDFPage.h). Compute the displayed dimensions explicitly.
  CGRect crop = [pdfPage boundsForBox:kPDFDisplayBoxCropBox];
  double pageWidth = crop.size.width;
  double pageHeight = crop.size.height;
  NSInteger rotation = ((pdfPage.rotation % 360) + 360) % 360;
  if (rotation == 90 || rotation == 270) {
    std::swap(pageWidth, pageHeight);
  }
  if (!std::isfinite(pageWidth) || !std::isfinite(pageHeight) || pageWidth <= 0 || pageHeight <= 0) {
    reject(@"INVALID_FILE", [NSString stringWithFormat:
        @"File %@, page %ld has invalid dimensions", filePath, (long)page], nil);
    return nil;
  }
  double scale = 1;
  if (maxWidth > 0) scale = std::min(scale, maxWidth / pageWidth);
  if (maxHeight > 0) scale = std::min(scale, maxHeight / pageHeight);
  // Exactly the JS Math.round rule for positive dimensions, computed once.
  double width = std::max(1.0, std::floor(pageWidth * scale + 0.5));
  double height = std::max(1.0, std::floor(pageHeight * scale + 0.5));
  CGSize targetSize = CGSizeMake((CGFloat)width, (CGFloat)height);
  UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat defaultFormat];
  format.scale = 1; // Pixel dimensions must not depend on the screen's 2x/3x scale.
  format.opaque = YES;
  format.preferredRange = UIGraphicsImageRendererFormatRangeStandard;
  UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:targetSize format:format];
  pdfPage.displaysAnnotations = YES; // Preserve thumbnailOfSize's annotation rendering.
  UIImage *image = [renderer imageWithActions:^(UIGraphicsImageRendererContext *rendererContext) {
    CGContextRef context = rendererContext.CGContext;
    CGContextSetRGBFillColor(context, 1, 1, 1, 1);
    CGContextFillRect(context, CGRectMake(0, 0, targetSize.width, targetSize.height));
    CGContextTranslateCTM(context, 0, targetSize.height);
    CGContextScaleCTM(context, 1, -1); // UIKit -> PDF's y-up coordinates.
    CGContextClipToRect(context, CGRectMake(0, 0, targetSize.width, targetSize.height));
    CGContextScaleCTM(context, width / pageWidth, height / pageHeight);
    // drawWithBox applies intrinsic rotation and crop-origin translation, clips
    // to the crop box, and retains annotations (documented in PDFPage.h).
    // Do NOT concatenate transformForBox as well: that would apply /Rotate twice.
    [pdfPage drawWithBox:kPDFDisplayBoxCropBox toContext:context];
  }];
  NSURL *cachesDirectory = [[[NSFileManager defaultManager]
      URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask] firstObject];
  NSURL *outputFile = [cachesDirectory URLByAppendingPathComponent:[self outputFilename:filePath page:page]];
  NSData *data = UIImageJPEGRepresentation(image, (CGFloat)quality / 100);
  NSError *writeError = nil;
  if (!data || ![data writeToURL:outputFile options:NSDataWritingAtomic error:&writeError]) {
    reject(@"INTERNAL_ERROR", [NSString stringWithFormat:
        @"Cannot write thumbnail for file %@, page %ld", filePath, (long)page], writeError);
    return nil;
  }
  return @{
    @"uri": outputFile.absoluteString,
    @"width": @(CGImageGetWidth(image.CGImage)),
    @"height": @(CGImageGetHeight(image.CGImage)),
  };
}

- (void)generate:(NSString *)filePath
            page:(double)page
         quality:(double)quality
        maxWidth:(double)maxWidth
       maxHeight:(double)maxHeight
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  @autoreleasepool {
    @try {
      PDFDocument *document = [self documentForFile:filePath reject:reject];
      if (!document) return;
      if (!std::isfinite(page) || page != std::floor(page) || page < 0 || page >= document.pageCount) {
        reject(@"INVALID_PAGE", [NSString stringWithFormat:
            @"Page number %@ is invalid for file %@, file has %lu pages",
            @(page), filePath, (unsigned long)document.pageCount], nil);
        return;
      }
      NSInteger pageIndex = (NSInteger)page;
      PDFPage *pdfPage = [document pageAtIndex:(NSUInteger)pageIndex];
      if (!pdfPage) {
        reject(@"INVALID_FILE", [NSString stringWithFormat:
            @"Cannot read file %@, page %ld", filePath, (long)pageIndex], nil);
        return;
      }
      NSDictionary *result = [self generatePage:pdfPage filePath:filePath page:pageIndex
          quality:[@(quality) integerValue] maxWidth:maxWidth maxHeight:maxHeight reject:reject];
      if (result) resolve(result);
    } @catch (NSException *exception) {
      reject(@"INTERNAL_ERROR", [NSString stringWithFormat:
          @"Cannot generate thumbnail for file %@, page %@: %@", filePath, @(page), exception.reason], nil);
    }
  }
}

- (void)generateAllPages:(NSString *)filePath
                 quality:(double)quality
                maxWidth:(double)maxWidth
               maxHeight:(double)maxHeight
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
  @autoreleasepool {
    NSUInteger page = 0;
    @try {
      PDFDocument *document = [self documentForFile:filePath reject:reject];
      if (!document) return;
      NSMutableArray *result = [NSMutableArray arrayWithCapacity:document.pageCount];
      NSInteger jpegQuality = [@(quality) integerValue];
      for (; page < document.pageCount; page++) {
        @autoreleasepool {
          PDFPage *pdfPage = [document pageAtIndex:page];
          if (!pdfPage) {
            reject(@"INVALID_FILE", [NSString stringWithFormat:
                @"Cannot read file %@, page %lu", filePath, (unsigned long)page], nil);
            return;
          }
          NSDictionary *pageResult = [self generatePage:pdfPage filePath:filePath page:(NSInteger)page
              quality:jpegQuality maxWidth:maxWidth maxHeight:maxHeight reject:reject];
          if (!pageResult) return;
          [result addObject:pageResult];
        }
      }
      resolve(result);
    } @catch (NSException *exception) {
      reject(@"INTERNAL_ERROR", [NSString stringWithFormat:
          @"Cannot generate thumbnail for file %@, page %lu: %@", filePath, (unsigned long)page, exception.reason], nil);
    }
  }
}

@end
