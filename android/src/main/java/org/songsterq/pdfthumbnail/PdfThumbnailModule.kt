package org.songsterq.pdfthumbnail

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.Random
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

@ReactModule(name = PdfThumbnailModule.NAME)
class PdfThumbnailModule(reactContext: ReactApplicationContext) :
  NativePdfThumbnailSpec(reactContext) {

  private val executor = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "PdfThumbnail-renderer")
  }

  override fun generate(filePath: String, page: Double, quality: Double, promise: Promise) {
    submit(promise) {
      withRenderer(filePath, promise) { renderer ->
        val pageIndex = page.toInt()
        if (!page.isFinite() || pageIndex < 0 || pageIndex >= renderer.pageCount) {
          val invalidPage = if (page.isFinite()) pageIndex.toString() else page.toString()
          throw ThumbnailException("INVALID_PAGE", "Page number $invalidPage is invalid, file has ${renderer.pageCount} pages")
        }
        renderPage(renderer, pageIndex, filePath, quality.toInt())
      }
    }
  }

  override fun generateAllPages(filePath: String, quality: Double, promise: Promise) {
    submit(promise) {
      withRenderer(filePath, promise) { renderer ->
        val result = Arguments.createArray()
        for (page in 0 until renderer.pageCount) {
          result.pushMap(renderPage(renderer, page, filePath, quality.toInt()))
        }
        result
      }
    }
  }

  private fun submit(promise: Promise, action: () -> Unit) {
    try {
      executor.execute { action() }
    } catch (ex: RejectedExecutionException) {
      promise.reject("INTERNAL_ERROR", ex)
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
      val openedDescriptor = getParcelFileDescriptor(filePath)
        ?: throw ThumbnailException("FILE_NOT_FOUND", "File $filePath not found")
      descriptor = openedDescriptor
      val openedRenderer = try {
        PdfRenderer(openedDescriptor)
      } catch (ex: SecurityException) {
        throw ThumbnailException("PASSWORD_PROTECTED", "File $filePath is password-protected or uses an unsupported security scheme", ex)
      }
      renderer = openedRenderer
      action(openedRenderer)
    } catch (ex: ThumbnailException) {
      promise.reject(ex.code, ex.message, ex)
      return
    } catch (ex: IOException) {
      promise.reject("INTERNAL_ERROR", ex)
      return
    } catch (ex: OutOfMemoryError) {
      promise.reject("OUT_OF_MEMORY", "Not enough memory to render file $filePath", ex)
      return
    } catch (ex: Exception) {
      promise.reject("INTERNAL_ERROR", ex)
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
    val uri = Uri.parse(filePath)
    if (ContentResolver.SCHEME_CONTENT == uri.scheme || ContentResolver.SCHEME_FILE == uri.scheme) {
      return this.reactApplicationContext.contentResolver.openFileDescriptor(uri, "r")
    } else if (filePath.startsWith("/")) {
      val file = File(filePath)
      return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }
    return null
  }

  private fun renderPage(pdfRenderer: PdfRenderer, page: Int, filePath: String, quality: Int): WritableMap {
    val currentPage = pdfRenderer.openPage(page)
    try {
      val width = currentPage.width
      val height = currentPage.height
      val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      try {
        bitmap.eraseColor(Color.WHITE)
        currentPage.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

        return writeBitmap(bitmap, width, height, filePath, page, quality)
      } finally {
        bitmap.recycle()
      }
    } finally {
      currentPage.close()
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
