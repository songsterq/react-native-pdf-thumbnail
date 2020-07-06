import PDFKit

@objc(PdfThumbnail)
class PdfThumbnail: NSObject {
    
    func getCachesDirectory() -> URL {
        let paths = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
        return paths[0]
    }
    
    @available(iOS 11.0, *)
    @objc(generate:withPage:withResolver:withRejecter:)
    func generate(filePath: String, page: Int, resolve:RCTPromiseResolveBlock, reject:RCTPromiseRejectBlock) -> Void {
        guard let fileUrl = URL(string: filePath) else {
            reject("FILE_NOT_FOUND", "File \(filePath) not found", nil)
            return
        }
        guard let pdfDocument = PDFDocument(url: fileUrl) else {
            reject("FILE_NOT_FOUND", "File \(filePath) not found", nil)
            return
        }
        guard let pdfPage = pdfDocument.page(at: page) else {
            reject("INVALID_PAGE", "Page number \(page) is invalid, file has \(pdfDocument.pageCount) pages", nil)
            return
        }
        
        let pageRect = pdfPage.bounds(for: .mediaBox)
        let image = pdfPage.thumbnail(of: CGSize(width: pageRect.width, height: pageRect.height), for: .mediaBox)
        let random = Int.random(in: 0 ..< 10000)
        let outputFile = getCachesDirectory().appendingPathComponent("pdf-thumbnail-\(random).jpg")
        guard let data = image.jpegData(compressionQuality: 80) else {
            reject("INTERNAL_ERROR", "Cannot get image data", nil)
            return
        }
        do {
            try data.write(to: outputFile)
            resolve([
                "uri": outputFile.absoluteString,
                "width": pageRect.width,
                "height": pageRect.height,
            ])
        } catch {
            reject("INTERNAL_ERROR", "Cannot write image data", error)
        }
    }
}
