package com.wanderledger.pdfrenderer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Lightweight, zero-dependency Expo module using Android's built-in PdfRenderer
 * to convert local file:// or content:// PDFs into crisp white-backed JPEGs
 * for offline ML Kit OCR.
 */
class LocalPdfRendererModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LocalPdfRenderer")

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
              // Render at crisp ~2x-3x PDF points (capped to targetMaxW) so small receipt/folio text is razor sharp for ML Kit OCR
              val rawW = page.width.coerceAtLeast(1)
              val rawH = page.height.coerceAtLeast(1)
              val scale = min(targetMaxW.toFloat() / rawW.toFloat(), 3.0f).coerceAtLeast(1.0f)
              val bmpW = (rawW * scale).roundToInt().coerceAtLeast(1)
              val bmpH = (rawH * scale).roundToInt().coerceAtLeast(1)

              val bitmap = Bitmap.createBitmap(bmpW, bmpH, Bitmap.Config.ARGB_8888)
              try {
                // Fill opaque white background (PDFs often have transparent backgrounds!)
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
}
