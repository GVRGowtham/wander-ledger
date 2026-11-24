import ExpoModulesCore
import Foundation
import PDFKit
import UIKit
import UniformTypeIdentifiers

/**
 * Lightweight, zero-external-dependency Expo module using Apple's built-in
 * UIDocumentPickerViewController + PDFKit to import PDFs/images and render
 * PDF pages into crisp white-backed JPEGs for offline ML Kit OCR on iOS.
 */
public final class LocalPdfRendererModule: Module {
  private var activePickerProxy: DocumentPickerProxy?

  public func definition() -> ModuleDefinition {
    Name("LocalPdfRenderer")

    AsyncFunction("pickDocumentAsync") { (promise: Promise) in
      if self.activePickerProxy != nil {
        promise.reject("PICK_IN_PROGRESS", "File picker is already open.")
        return
      }

      guard let currentVC = self.appContext?.utilities?.currentViewController() else {
        promise.reject("NO_VIEW_CONTROLLER", "Unable to locate an active view controller.")
        return
      }

      let picker = UIDocumentPickerViewController(
        forOpeningContentTypes: [.pdf, .image],
        asCopy: true
      )
      picker.allowsMultipleSelection = false

      let proxy = DocumentPickerProxy { [weak self] result in
        self?.activePickerProxy = nil
        switch result {
        case .success(let payload):
          promise.resolve(payload)
        case .failure(let error):
          promise.reject("PICK_COPY_FAILED", error.localizedDescription)
        }
      }

      self.activePickerProxy = proxy
      picker.delegate = proxy
      picker.presentationController?.delegate = proxy
      currentVC.present(picker, animated: true)
    }
    .runOnQueue(.main)

    AsyncFunction("renderPagesAsync") { (uriString: String, maxPages: Int, maxWidth: Int) -> [String] in
      let pdfURL = try self.resolveLocalURL(from: uriString)
      let didStartAccessing = pdfURL.startAccessingSecurityScopedResource()
      defer {
        if didStartAccessing {
          pdfURL.stopAccessingSecurityScopedResource()
        }
      }

      guard FileManager.default.fileExists(atPath: pdfURL.path) else {
        throw NSError(
          domain: "LocalPdfRenderer",
          code: 404,
          userInfo: [NSLocalizedDescriptionKey: "PDF file does not exist: \(pdfURL.lastPathComponent)"]
        )
      }

      guard let document = PDFDocument(url: pdfURL) else {
        throw NSError(
          domain: "LocalPdfRenderer",
          code: 422,
          userInfo: [NSLocalizedDescriptionKey: "Unable to open PDF document: \(pdfURL.lastPathComponent)"]
        )
      }

      let clampedMaxPages = max(1, min(maxPages, 5))
      let totalPages = min(document.pageCount, clampedMaxPages)
      let targetMaxW = CGFloat(max(600, min(maxWidth, 2200)))

      let outDir = try self.ensureCacheSubdir("wl_pdf_pages")
      let timestamp = Int(Date().timeIntervalSince1970 * 1000)
      var outUris: [String] = []

      for index in 0..<totalPages {
        guard let page = document.page(at: index) else { continue }

        let bounds = page.bounds(for: .mediaBox)
        let rotation = ((page.rotation % 360) + 360) % 360
        let isQuarterTurn = (rotation == 90 || rotation == 270)
        let rawW = max(1.0, isQuarterTurn ? bounds.height : bounds.width)
        let rawH = max(1.0, isQuarterTurn ? bounds.width : bounds.height)

        let scale = max(1.0, min(targetMaxW / rawW, 3.0))
        let renderSize = CGSize(
          width: max(1.0, (rawW * scale).rounded()),
          height: max(1.0, (rawH * scale).rounded())
        )

        let renderedThumb = page.thumbnail(of: renderSize, for: .mediaBox)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0
        format.opaque = true

        let renderer = UIGraphicsImageRenderer(size: renderSize, format: format)
        let whiteBacked = renderer.image { ctx in
          UIColor.white.setFill()
          ctx.fill(CGRect(origin: .zero, size: renderSize))
          renderedThumb.draw(in: CGRect(origin: .zero, size: renderSize))
        }

        guard let jpegData = whiteBacked.jpegData(compressionQuality: 0.92) else {
          continue
        }

        let outFile = outDir.appendingPathComponent("pdf_p\(index)_\(timestamp).jpg")
        try jpegData.write(to: outFile, options: .atomic)
        outUris.append(outFile.absoluteString)
      }

      return outUris
    }
  }

  private func resolveLocalURL(from uriString: String) throws -> URL {
    let trimmed = uriString.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasPrefix("file://") {
      if let url = URL(string: trimmed) {
        return url
      }
      let stripped = String(trimmed.dropFirst("file://".count))
      let decoded = stripped.removingPercentEncoding ?? stripped
      return URL(fileURLWithPath: decoded)
    }
    if !trimmed.isEmpty {
      return URL(fileURLWithPath: trimmed)
    }
    throw NSError(
      domain: "LocalPdfRenderer",
      code: 400,
      userInfo: [NSLocalizedDescriptionKey: "Invalid PDF path"]
    )
  }

  private func ensureCacheSubdir(_ name: String) throws -> URL {
    guard let cachesDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
      throw NSError(
        domain: "LocalPdfRenderer",
        code: 500,
        userInfo: [NSLocalizedDescriptionKey: "Caches directory unavailable"]
      )
    }
    let dir = cachesDir.appendingPathComponent(name, isDirectory: true)
    if !FileManager.default.fileExists(atPath: dir.path) {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }
    return dir
  }
}

private final class DocumentPickerProxy: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private var completion: ((Result<[String: String]?, Error>) -> Void)?

  init(completion: @escaping (Result<[String: String]?, Error>) -> Void) {
    self.completion = completion
  }

  private func finish(_ result: Result<[String: String]?, Error>) {
    guard let cb = completion else { return }
    completion = nil
    cb(result)
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let sourceURL = urls.first else {
      finish(.success(nil))
      return
    }

    let didStartAccessing = sourceURL.startAccessingSecurityScopedResource()
    defer {
      if didStartAccessing {
        sourceURL.stopAccessingSecurityScopedResource()
      }
    }

    do {
      let ext = sourceURL.pathExtension.lowercased()
      let mimeType: String
      if let utType = UTType(filenameExtension: ext), let preferred = utType.preferredMIMEType {
        mimeType = preferred
      } else if ext == "pdf" {
        mimeType = "application/pdf"
      } else {
        mimeType = "image/jpeg"
      }

      let displayName = sourceURL.lastPathComponent.isEmpty
        ? (mimeType == "application/pdf" ? "document.pdf" : "document.jpg")
        : sourceURL.lastPathComponent

      guard let cachesDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
        throw NSError(
          domain: "LocalPdfRenderer",
          code: 500,
          userInfo: [NSLocalizedDescriptionKey: "Caches directory unavailable"]
        )
      }

      let outDir = cachesDir.appendingPathComponent("wl_picked_docs", isDirectory: true)
      if !FileManager.default.fileExists(atPath: outDir.path) {
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
      }

      let safeName = displayName.replacingOccurrences(
        of: "[^a-zA-Z0-9._-]",
        with: "_",
        options: .regularExpression
      )
      let timestamp = Int(Date().timeIntervalSince1970 * 1000)
      let destURL = outDir.appendingPathComponent("\(timestamp)_\(safeName)")

      if FileManager.default.fileExists(atPath: destURL.path) {
        try FileManager.default.removeItem(at: destURL)
      }
      try FileManager.default.copyItem(at: sourceURL, to: destURL)

      finish(.success([
        "uri": destURL.absoluteString,
        "mimeType": mimeType,
        "name": displayName,
      ]))
    } catch {
      finish(.failure(error))
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(.success(nil))
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish(.success(nil))
  }
}
