import type { Format } from '@/lib/registry/types';

const OOXML_PART = '[Content_Types].xml';

/**
 * Says which OOXML format a ZIP archive actually holds.
 *
 * DOCX, XLSX and PPTX are all ZIPs, so only the archive's own content-type map
 * can tell them apart — and reading it needs a zip library. That library is why
 * this lives here rather than in `detect.ts`: this module is imported by the
 * worker alone, so the page never pays for a second copy of JSZip just to
 * identify a dropped file.
 */
export async function sniffOoxml(file: File): Promise<Format | undefined> {
  const { default: JSZip } = await import('jszip');

  let zip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return undefined;
  }

  const types = zip.file(OOXML_PART);
  if (types) {
    const xml = await types.async('string');
    if (xml.includes('wordprocessingml.document.main')) return 'docx';
    if (xml.includes('spreadsheetml.sheet.main')) return 'xlsx';
    if (xml.includes('presentationml.presentation.main')) return 'pptx';
  }

  // Macro-enabled and template variants carry the same main part under a
  // different content type; fall back to the directory layout.
  const names = Object.keys(zip.files);
  if (names.some((n) => n.startsWith('word/'))) return 'docx';
  if (names.some((n) => n.startsWith('xl/'))) return 'xlsx';
  if (names.some((n) => n.startsWith('ppt/'))) return 'pptx';

  return undefined;
}
