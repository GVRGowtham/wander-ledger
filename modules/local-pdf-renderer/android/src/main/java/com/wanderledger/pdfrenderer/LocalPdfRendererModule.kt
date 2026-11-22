package com.wanderledger.pdfrenderer

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Lightweight, zero-external-dependency Expo module using Android's built-in
 * ACTION_OPEN_DOCUMENT picker + PdfRenderer to import PDFs/images and convert
 * PDF pages into crisp white-backed JPEGs for offline ML Kit OCR.
 */
class LocalPdfRendererModule : Module() {
  private var pendingPickPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("LocalPdfRenderer")

    AsyncFunction("pickDocumentAsync") { promise: Promise ->
      if (pendingPickPromise != null) {
        promise.reject("PICK_IN_PROGRESS", "File picker is already open.", null)
        return@AsyncFunction
      }
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/pdf", "image/*"))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      pendingPickPromise = promise
      try {
        appContext.throwingActivity.startActivityForResult(intent, PICK_REQUEST_CODE)
      } catch (e: Exception) {
        pendingPickPromise = null
        promise.reject("PICK_FAILED", e.message ?: "Unable to launch file picker", e)
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != PICK_REQUEST_CODE) return@OnActivityResult
      val promise = pendingPickPromise ?: return@OnActivityResult
      pendingPickPromise = null

      val uri = payload.data?.data
      if (payload.resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(null)
        return@OnActivityResult
      }

      try {
        val context = appContext.reactContext
          ?: throw IllegalStateException("React context unavailable")
        val mimeType = context.contentResolver.getType(uri) ?: ""
        val displayName = resolveDisplayName(context, uri)
          ?: if (mimeType == "application/pdf") "document.pdf" else "document.jpg"

        val outDir = File(context.cacheDir, "wl_picked_docs")
        if (!outDir.exists()) outDir.mkdirs()
        val safeName = displayName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val destFile = File(outDir, "${System.currentTimeMillis()}_$safeName")

        context.contentResolver.openInputStream(uri)?.use { input ->
          FileOutputStream(destFile).use { output ->
            input.copyTo(output)
          }
        } ?: throw IllegalStateException("Unable to read selected file")

        promise.resolve(
          mapOf(
            "uri" to Uri.fromFile(destFile).toString(),
            "mimeType" to mimeType,
            "name" to displayName
          )
        )
      } catch (e: Exception) {
        promise.reject("PICK_COPY_FAILED", e.message ?: "Unable to copy selected file", e)
      }
    }

    AsyncFunction("renderPagesAsync") { uriString: String, maxPages: Int, maxWidth: Int ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")

      val pfd: ParcelFileDescriptor = openPdfDescriptor(context, uriString)
      val outUris = mutableListOf<String>()

      pfd.use { descriptor ->
        PdfRenderer(descriptor).use { renderer ->
          val total = min(renderer.pageCount, maxPages.coerceIn(1, 5))
          val targetMaxW = maxWidth.coerceIn(600, 2200)
          val outDir = File(context.cacheDir, "wl_pdf_pages")
          if (!outDir.exists()) outDir.mkdirs()

          for (i in 0 until total) {
            renderer.openPage(i).use { page ->
              val rawW = page.width.coerceAtLeast(1)
              val rawH = page.height.coerceAtLeast(1)
              val scale = min(targetMaxW.toFloat() / rawW.toFloat(), 3.0f).coerceAtLeast(1.0f)
              val bmpW = (rawW * scale).roundToInt().coerceAtLeast(1)
              val bmpH = (rawH * scale).roundToInt().coerceAtLeast(1)

              val bitmap = Bitmap.createBitmap(bmpW, bmpH, Bitmap.Config.ARGB_8888)
              try {
                val canvas = Canvas(bitmap)
                canvas.drawColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                val outFile = File(outDir, "pdf_p${i}_${System.currentTimeMillis()}.jpg")
                FileOutputStream(outFile).use { fos ->
                  bitmap.compress(Bitmap.CompressFormat.JPEG, 92, fos)
                }
                outUris.add(Uri.fromFile(outFile).toString())
              } finally {
                bitmap.recycle()
              }
            }
          }
        }
      }

      return@AsyncFunction outUris
    }
  }

  private fun resolveDisplayName(context: android.content.Context, uri: Uri): String? {
    return try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun openPdfDescriptor(context: android.content.Context, uriString: String): ParcelFileDescriptor {
    val parsed = Uri.parse(uriString)
    if (parsed.scheme == "content") {
      return context.contentResolver.openFileDescriptor(parsed, "r")
        ?: throw IllegalArgumentException("Unable to open PDF content URI")
    }
    val path = if (parsed.scheme == "file") parsed.path else uriString
    val file = File(path ?: throw IllegalArgumentException("Invalid PDF path"))
    if (!file.exists()) {
      throw IllegalArgumentException("PDF file does not exist: ${file.name}")
    }
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  companion object {
    private const val PICK_REQUEST_CODE = 8741
  }
}
