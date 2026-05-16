import regularFontUrl from '../assets/fonts/NotoSans-Regular.ttf?url';
import boldFontUrl from '../assets/fonts/NotoSans-Bold.ttf?url';

const fontCache = new Map();
export const PDF_FONT_NAME = 'NotoSansUnicode';
const REGULAR_FONT_FILE = 'NotoSans-Regular.ttf';
const BOLD_FONT_FILE = 'NotoSans-Bold.ttf';
const FALLBACK_FONT = 'helvetica';

function resolveFontName(doc) {
  if (doc?.__notoSansApplied) {
    return PDF_FONT_NAME;
  }
  if (doc?.__pdfFallbackFont) {
    return doc.__pdfFallbackFont;
  }
  return FALLBACK_FONT;
}

export function setPdfFont(doc, style = 'normal') {
  if (!doc) return false;
  try {
    const targetFont = resolveFontName(doc);
    doc.setFont(targetFont, style || 'normal');
    return true;
  } catch (error) {
    console.warn('[pdfFonts] Failed to switch PDF font', { style, error });
    if (resolveFontName(doc) !== FALLBACK_FONT) {
      try {
        doc.__pdfFallbackFont = FALLBACK_FONT;
        doc.setFont(FALLBACK_FONT, style || 'normal');
        return true;
      } catch (fallbackError) {
        console.warn('[pdfFonts] Unable to apply fallback font', fallbackError);
      }
    }
    return false;
  }
}

async function fetchFontBase64(url) {
  if (fontCache.has(url)) {
    return fontCache.get(url);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load PDF font: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  const base64 = bufferToBase64(buffer);
  fontCache.set(url, base64);
  return base64;
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

export async function applyPdfUnicodeFont(doc) {
  if (!doc) {
    return;
  }
  if (doc.__notoSansApplied) {
    setPdfFont(doc, 'normal');
    return;
  }
  if (doc.__notoSansFailed) {
    return;
  }
  try {
    const [regularBase64, boldBase64] = await Promise.all([
      fetchFontBase64(regularFontUrl),
      fetchFontBase64(boldFontUrl),
    ]);
    doc.addFileToVFS(REGULAR_FONT_FILE, regularBase64);
    doc.addFont(REGULAR_FONT_FILE, PDF_FONT_NAME, 'normal');
    doc.addFileToVFS(BOLD_FONT_FILE, boldBase64);
    doc.addFont(BOLD_FONT_FILE, PDF_FONT_NAME, 'bold');
    Object.defineProperty(doc, '__notoSansApplied', {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    if (doc.__pdfFallbackFont) {
      delete doc.__pdfFallbackFont;
    }
    setPdfFont(doc, 'normal');
  } catch (error) {
    console.error('[pdfFonts] Failed to apply Unicode font, falling back to defaults.', error);
    Object.defineProperty(doc, '__notoSansFailed', {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    try {
      doc.__pdfFallbackFont = FALLBACK_FONT;
      doc.setFont(FALLBACK_FONT, 'normal');
    } catch (err) {
      console.warn('[pdfFonts] Unable to switch to fallback font', err);
    }
  }
}
