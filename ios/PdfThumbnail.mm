#import "PdfThumbnail.h"
#import <PDFKit/PDFKit.h>
#import <UIKit/UIKit.h>
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

- (NSDictionary *)generatePage:(PDFPage *)pdfPage
                      filePath:(NSString *)filePath
                          page:(NSInteger)page
                       quality:(NSInteger)quality
{
  CGRect pageRect = [pdfPage boundsForBox:kPDFDisplayBoxMediaBox];
  UIImage *image = [pdfPage thumbnailOfSize:pageRect.size forBox:kPDFDisplayBoxMediaBox];
  NSURL *cachesDirectory = [[[NSFileManager defaultManager]
      URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask] firstObject];
  NSURL *outputFile = [cachesDirectory URLByAppendingPathComponent:[self outputFilename:filePath page:page]];
  NSData *data = UIImageJPEGRepresentation(image, (CGFloat)quality / 100);
  if (!data || ![data writeToURL:outputFile options:0 error:NULL]) {
    return nil;
  }
  return @{
    @"uri": outputFile.absoluteString,
    @"width": @((NSInteger)pageRect.size.width),
    @"height": @((NSInteger)pageRect.size.height),
  };
}

- (void)generate:(NSString *)filePath
            page:(double)page
         quality:(double)quality
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  @autoreleasepool {
    NSURL *fileURL = [NSURL URLWithString:filePath];
    PDFDocument *document = fileURL ? [[PDFDocument alloc] initWithURL:fileURL] : nil;
    if (!document) {
      reject(@"FILE_NOT_FOUND", [NSString stringWithFormat:@"File %@ not found", filePath], nil);
      return;
    }
    // NSNumber performs the same truncation toward zero as the former bridge.
    NSInteger pageIndex = std::isfinite(page) ? [@(page) integerValue] : 0;
    PDFPage *pdfPage = std::isfinite(page) ? [document pageAtIndex:(NSUInteger)pageIndex] : nil;
    if (!pdfPage) {
      NSString *invalidPage = std::isfinite(page)
          ? [NSString stringWithFormat:@"%ld", (long)pageIndex] : [@(page) description];
      reject(@"INVALID_PAGE", [NSString stringWithFormat:@"Page number %@ is invalid, file has %lu pages",
                                                       invalidPage, (unsigned long)document.pageCount], nil);
      return;
    }
    NSDictionary *result = [self generatePage:pdfPage filePath:filePath page:pageIndex
                                     quality:[@(quality) integerValue]];
    if (result) {
      resolve(result);
    } else {
      reject(@"INTERNAL_ERROR", @"Cannot write image data", nil);
    }
  }
}

- (void)generateAllPages:(NSString *)filePath
                 quality:(double)quality
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
  @autoreleasepool {
    NSURL *fileURL = [NSURL URLWithString:filePath];
    PDFDocument *document = fileURL ? [[PDFDocument alloc] initWithURL:fileURL] : nil;
    if (!document) {
      reject(@"FILE_NOT_FOUND", [NSString stringWithFormat:@"File %@ not found", filePath], nil);
      return;
    }
    NSMutableArray *result = [NSMutableArray arrayWithCapacity:document.pageCount];
    NSInteger jpegQuality = [@(quality) integerValue];
    for (NSUInteger page = 0; page < document.pageCount; page++) {
      @autoreleasepool {
        PDFPage *pdfPage = [document pageAtIndex:page];
        if (!pdfPage) {
          reject(@"INVALID_PAGE", [NSString stringWithFormat:@"Page number %lu is invalid, file has %lu pages",
                                                           (unsigned long)page, (unsigned long)document.pageCount], nil);
          return;
        }
        NSDictionary *pageResult = [self generatePage:pdfPage filePath:filePath page:(NSInteger)page
                                             quality:jpegQuality];
        if (!pageResult) {
          reject(@"INTERNAL_ERROR", @"Cannot write image data", nil);
          return;
        }
        [result addObject:pageResult];
      }
    }
    resolve(result);
  }
}

@end
