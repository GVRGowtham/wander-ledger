/**
 * On-device Google ML Kit Text Recognition wrapper ($0, 100% offline on Android).
 * Safely degrades if invoked in a non-native environment (e.g. Jest or Expo Go).
 */
export interface OcrRecognitionResult {
  text: string | null;
  error?: string;
}

function normalizeImageUri(imageUri: string): string {
  const trimmed = imageUri.trim();
  if (
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  return `file://${trimmed}`;
}

export interface OcrLineFrame {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface OcrLineBox {
  text: string;
  frame?: OcrLineFrame;
}

export interface OcrBlockBox {
  text?: string;
  lines?: OcrLineBox[];
}

/**
 * Reconstructs true visual reading rows from ML Kit's block/line bounding boxes.
 * Fixes 2-column PDF fare tables, hotel folios, and receipts where ML Kit's raw
 * `result.text` otherwise dumps all left-column labels above all right-column numbers.
 */
export function reconstructSpatialTextFromBlocks(blocks: OcrBlockBox[]): string {
  const items: Array<{
    text: string;
    top: number;
    left: number;
    height: number;
    cy: number;
  }> = [];

  for (const block of blocks) {
    for (const line of block.lines ?? []) {
      const clean = line.text?.trim();
      if (!clean || !line.frame) continue;
      const { top, left, height } = line.frame;
      if (!Number.isFinite(top) || !Number.isFinite(left)) continue;
      const h = Number.isFinite(height) && height > 0 ? height : 20;
      items.push({ text: clean, top, left, height: h, cy: top + h / 2 });
    }
  }

  if (items.length === 0) return '';

  // Sort top-to-bottom by vertical center, then left-to-right
  items.sort((a, b) => a.cy - b.cy || a.left - b.left);

  // Cluster segments that belong to the same horizontal visual row
  const rows: Array<typeof items> = [];
  for (const item of items) {
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const rowCy = lastRow.reduce((sum, x) => sum + x.cy, 0) / lastRow.length;
      const rowMinH = Math.min(...lastRow.map((x) => x.height), item.height);
      const tolerance = Math.max(8, rowMinH * 0.6);
      if (Math.abs(item.cy - rowCy) <= tolerance) {
        lastRow.push(item);
        continue;
      }
    }
    rows.push([item]);
  }

  return rows
    .map((row) => {
      row.sort((a, b) => a.left - b.left);
      return row.map((seg) => seg.text).join('  ');
    })
    .join('\n');
}

export async function recognizeTextWithDiagnostics(
  imageUri: string
): Promise<OcrRecognitionResult> {
  try {
    // Dynamic require avoids crashing Jest/non-native test runners
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-ml-kit/text-recognition');
    const TextRecognition = mod?.default ?? mod;
    if (!TextRecognition?.recognize) {
      return { text: null, error: 'On-device OCR module not available in this build.' };
    }

    const normalizedUri = normalizeImageUri(imageUri);
    const result = await TextRecognition.recognize(normalizedUri);
    if (Array.isArray(result?.blocks) && result.blocks.length > 0) {
      const spatial = reconstructSpatialTextFromBlocks(result.blocks);
      if (spatial.trim().length > 0) {
        return { text: spatial.trim() };
      }
    }
    if (result?.text && typeof result.text === 'string' && result.text.trim().length > 0) {
      return { text: result.text.trim() };
    }
    return { text: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: null, error: msg };
  }
}

export async function recognizeTextFromImage(imageUri: string): Promise<string | null> {
  const res = await recognizeTextWithDiagnostics(imageUri);
  return res.text;
}
