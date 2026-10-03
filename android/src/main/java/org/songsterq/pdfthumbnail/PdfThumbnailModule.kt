package org.songsterq.pdfthumbnail

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.util.Random
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import kotlin.math.floor
import kotlin.math.min

@ReactModule(name = PdfThumbnailModule.NAME)
class PdfThumbnailModule(reactContext: ReactApplicationContext) :
  NativePdfThumbnailSpec(reactContext) {

  private val executor = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "PdfThumbnail-renderer")
  }

  override fun generate(filePath: String, page: Double, quality: Double, maxWidth: Double, maxHeight: Double, promise: Promise) {
    submit(filePath, promise) {
      withRenderer(filePath, promise) { renderer ->
        val pageIndex = page.toInt()
        if (!page.isFinite() || page != floor(page) || pageIndex < 0 || pageIndex >= renderer.pageCount) {
          val invalidPage = page.toString()
          throw ThumbnailException("INVALID_PAGE", "Page number $invalidPage is invalid for file $filePath, file has ${renderer.pageCount} pages")
        }
        renderPage(renderer, pageIndex, filePath, quality.toInt(), maxWidth, maxHeight)
      }
    }
  }

  override fun generateAllPages(filePath: String, quality: Double, maxWidth: Double, maxHeight: Double, promise: Promise) {
    submit(filePath, promise) {
      withRenderer(filePath, promise) { renderer ->
        val result = Arguments.createArray()
        for (page in 0 until renderer.pageCount) {
          result.pushMap(renderPage(renderer, page, filePath, quality.toInt(), maxWidth, maxHeight))
        }
        result
      }
    }
  }

  private fun submit(filePath: String, promise: Promise, action: () -> Unit) {
    try {
      executor.execute { action() }
    } catch (ex: RejectedExecutionException) {
      promise.reject("INTERNAL_ERROR", "Cannot generate thumbnail for file $filePath: ${ex.message}", ex)
    }
  }

  override fun invalidate() {
    executor.shutdown()
    super.invalidate()
  }

  private class ThumbnailException(val code: String, message: String, cause: Throwable? = null) :
    Exception(message, cause)

  /**
   * Opens [filePath], runs [action] with a renderer and settles [promise] exactly once.
   * Every failure rejects the promise instead of crashing the app, and the renderer and
   * file descriptor are always closed.
   */
  private fun withRenderer(filePath: String, promise: Promise, action: (PdfRenderer) -> Any) {
    var descriptor: ParcelFileDescriptor? = null
    var renderer: PdfRenderer? = null
    val result = try {
      val openedDescriptor = try {
        getParcelFileDescriptor(filePath)
          ?: throw ThumbnailException("FILE_NOT_FOUND", "File $filePath cannot be opened for reading")
      } catch (ex: FileNotFoundException) {
        throw ThumbnailException("FILE_NOT_FOUND", "File $filePath cannot be opened for reading", ex)
      } catch (ex: SecurityException) {
        throw ThumbnailException("FILE_NOT_FOUND", "File $filePath cannot be opened for reading", ex)
      } catch (ex: IOException) {
        throw ThumbnailException("FILE_NOT_FOUND", "File $filePath cannot be opened for reading", ex)
      }
      descriptor = openedDescriptor
      val openedRenderer = try {
        PdfRenderer(openedDescriptor)
      } catch (ex: SecurityException) {
        throw ThumbnailException("PASSWORD_PROTECTED", "File $filePath requires a password or uses unsupported PDF security", ex)
      } catch (ex: IOException) {
        throw ThumbnailException("INVALID_FILE", "File $filePath is not a readable PDF", ex)
      }
      renderer = openedRenderer
      if (openedRenderer.pageCount == 0) {
        throw ThumbnailException("INVALID_FILE", "File $filePath has no readable PDF pages")
      }
      action(openedRenderer)
    } catch (ex: ThumbnailException) {
      promise.reject(ex.code, ex.message, ex)
      return
    } catch (ex: IOException) {
      promise.reject("INTERNAL_ERROR", "Cannot generate thumbnail for file $filePath: ${ex.message}", ex)
      return
    } catch (ex: OutOfMemoryError) {
      promise.reject("OUT_OF_MEMORY", "Not enough memory to render file $filePath", ex)
      return
    } catch (ex: Exception) {
      promise.reject("INTERNAL_ERROR", "Cannot generate thumbnail for file $filePath: ${ex.message}", ex)
      return
    } finally {
      closeQuietly(renderer)
      closeQuietly(descriptor)
    }
    promise.resolve(result)
  }

  private fun closeQuietly(closeable: AutoCloseable?) {
    try {
      closeable?.close()
    } catch (ignored: Exception) {
      // Thumbnails are already written or the promise already rejected; nothing to report.
    }
  }

  private fun getParcelFileDescriptor(filePath: String): ParcelFileDescriptor? {
    if (filePath.startsWith("/")) {
      return ParcelFileDescriptor.open(File(filePath), ParcelFileDescriptor.MODE_READ_ONLY)
    }
    val uri = Uri.parse(filePath)
    when {
      filePath.startsWith("content://") && uri.scheme == ContentResolver.SCHEME_CONTENT ->
        return reactApplicationContext.contentResolver.openFileDescriptor(uri, "r")
      filePath.startsWith("file://") && uri.scheme == ContentResolver.SCHEME_FILE &&
        (uri.authority.isNullOrEmpty() || uri.authority == "localhost") &&
        uri.path?.startsWith("/") == true ->
        return ParcelFileDescriptor.open(File(uri.path!!), ParcelFileDescriptor.MODE_READ_ONLY)
      else -> throw ThumbnailException("UNSUPPORTED_URI", "Unsupported URI for file $filePath; use an absolute path, file:// URI or content:// URI")
    }
  }

  private fun renderPage(pdfRenderer: PdfRenderer, page: Int, filePath: String, quality: Int, maxWidth: Double, maxHeight: Double): WritableMap {
    try {
      pdfRenderer.openPage(page).use { currentPage ->
        // PdfRenderer/PDFium exposes the effective crop box in displayed orientation:
        // width/height and rendered content already include intrinsic /Rotate.
        // The matrix only scales these displayed coordinates; rotating again would
        // double-rotate the page. Verify both rotations and offset crops on devices.
        val pageWidth = currentPage.width
        val pageHeight = currentPage.height
        if (pageWidth <= 0 || pageHeight <= 0) {
          throw ThumbnailException("INVALID_FILE", "File $filePath, page $page has invalid dimensions")
        }
        var scale = 1.0
        if (maxWidth > 0) scale = min(scale, maxWidth / pageWidth)
        if (maxHeight > 0) scale = min(scale, maxHeight / pageHeight)
        // Same positive rounding as Math.round in JS and floor(x + 0.5) on iOS.
        val width = maxOf(1, floor(pageWidth * scale + 0.5).toInt())
        val height = maxOf(1, floor(pageHeight * scale + 0.5).toInt())
        val matrix = Matrix().apply {
          setScale(width.toFloat() / pageWidth, height.toFloat() / pageHeight)
        }
        // Allocate only the final bitmap, including for huge pages.
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        try {
          bitmap.eraseColor(Color.WHITE)
          currentPage.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
          return writeBitmap(bitmap, width, height, filePath, page, quality)
        } finally {
          bitmap.recycle()
        }
      }
    } catch (ex: ThumbnailException) {
      throw ex
    } catch (ex: OutOfMemoryError) {
      throw ThumbnailException("OUT_OF_MEMORY", "Not enough memory to render file $filePath, page $page", ex)
    } catch (ex: Exception) {
      throw ThumbnailException("INTERNAL_ERROR", "Cannot render or write file $filePath, page $page: ${ex.message}", ex)
    }
  }

  private fun writeBitmap(bitmap: Bitmap, width: Int, height: Int, filePath: String, page: Int, quality: Int): WritableMap {
    val outputFile = File.createTempFile(getOutputFilePrefix(filePath, page), ".jpg", reactApplicationContext.cacheDir)
    var completed = false
    try {
      FileOutputStream(outputFile).use { out ->
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)) {
          throw IOException("Cannot compress thumbnail for file $filePath, page $page")
        }
        out.flush()
      }

      val map = Arguments.createMap()
      map.putString("uri", Uri.fromFile(outputFile).toString())
      map.putInt("width", width)
      map.putInt("height", height)
      completed = true
      return map
    } finally {
      if (!completed) {
        outputFile.delete()
      }
    }
  }

  private fun getOutputFilePrefix(filePath: String, page: Int): String {
    val tokens = filePath.split("/")
    val originalFilename = tokens[tokens.lastIndex]
    val prefix = originalFilename.replace(".", "-")
    val generator = Random()
    val random = generator.nextInt(Integer.MAX_VALUE)
    return "$prefix-thumbnail-$page-$random"
  }

  companion object {
    const val NAME = NativePdfThumbnailSpec.NAME
  }
}
