import type { Format } from '@/lib/registry/types';

const OOXML_PART = '[Content_Types].xml';

/**
 * The formats that identify themselves in a `mimetype` entry.
 *
 * OpenDocument and EPUB both require it to be the archive's first entry, stored
 * uncompressed, precisely so that a reader can tell what it has without
 * unpacking anything. Kiln writes them that way too.
 */
const BY_MIMETYPE: Record<string, Format> = {
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/epub+zip': 'epub',
};

export interface ArchiveRead {
  format: Format | undefined;
  /**
   * What the archive holds once unpacked, in bytes.
   *
   * The engines work on the unpacked XML, not on the file, and OOXML compresses
   * so hard that the two differ by a factor of ten or a hundred. Predicting
   * memory from the file on disk is therefore hopeless in both directions: it
   * cries wolf over a small text-heavy document and says nothing about a large
   * one full of already-compressed images. Reading the real figure costs
   * nothing, because the archive is being opened anyway to identify it.
   */
  expanded?: number;
}

/**
 * Says which OOXML format a ZIP archive actually holds, and how big it is
 * unpacked.
 *
 * DOCX, XLSX and PPTX are all ZIPs, so only the archive's own content-type map
 * can tell them apart — and reading it needs a zip library. That library is why
 * this lives here rather than in `detect.ts`: this module is imported by the
 * worker alone, so the page never pays for a second copy of JSZip just to
 * identify a dropped file.
 */
export async function sniffOoxml(file: File): Promise<ArchiveRead> {
  const { default: JSZip } = await import('jszip');

  let zip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return { format: undefined };
  }

  const expanded = unpackedSize(zip);

  // Asked first, because it is an exact answer rather than a search: an ODF or
  // EPUB package says what it is in one line.
  const mimetype = zip.file('mimetype');
  if (mimetype) {
    const declared = (await mimetype.async('string')).trim();
    for (const [mime, format] of Object.entries(BY_MIMETYPE)) {
      // Templates carry the same body under `…-template`.
      if (declared.startsWith(mime)) return { format, expanded };
    }
  }

  const types = zip.file(OOXML_PART);
  if (types) {
    const xml = await types.async('string');
    if (xml.includes('wordprocessingml.document.main'))
      return { format: 'docx', expanded };
    if (xml.includes('spreadsheetml.sheet.main')) return { format: 'xlsx', expanded };
    if (xml.includes('presentationml.presentation.main'))
      return { format: 'pptx', expanded };
  }

  // Macro-enabled and template variants carry the same main part under a
  // different content type; fall back to the directory layout.
  const names = Object.keys(zip.files);
  if (names.some((n) => n.startsWith('word/'))) return { format: 'docx', expanded };
  if (names.some((n) => n.startsWith('xl/'))) return { format: 'xlsx', expanded };
  if (names.some((n) => n.startsWith('ppt/'))) return { format: 'pptx', expanded };

  // An EPUB with no `mimetype` entry is malformed but readable, and the
  // container is the part that actually matters for reading it.
  if (names.includes('META-INF/container.xml')) return { format: 'epub', expanded };

  // Likewise an ODF package: `content.xml` beside a manifest is the shape, and
  // the root element inside says which of the three it is.
  if (names.includes('content.xml') && names.includes('META-INF/manifest.xml')) {
    const head = (await zip.file('content.xml')!.async('string')).slice(0, 4096);
    if (head.includes('<office:spreadsheet')) return { format: 'ods', expanded };
    if (head.includes('<office:presentation')) return { format: 'odp', expanded };
    if (head.includes('<office:text')) return { format: 'odt', expanded };
  }

  return { format: undefined, expanded };
}

/** Entry data JSZip records while reading, but does not put in its public type. */
interface SizedEntry {
  dir?: boolean;
  _data?: { uncompressedSize?: number };
}

/**
 * The archive's unpacked size, or `undefined` if JSZip stopped recording it.
 *
 * `_data.uncompressedSize` is read from the zip's own headers, so this costs no
 * decompression. It is not part of JSZip's published type, which is why the
 * result is optional and every caller has a path for not knowing —
 * `archive.test.ts` fails if an upgrade takes the field away.
 */
function unpackedSize(zip: { files: Record<string, unknown> }): number | undefined {
  let total = 0;

  for (const value of Object.values(zip.files)) {
    const entry = value as SizedEntry;
    // A directory entry holds no data and carries no `_data` at all.
    if (entry.dir) continue;

    const size = entry._data?.uncompressedSize;
    if (typeof size !== 'number') return undefined;
    total += size;
  }

  return total > 0 ? total : undefined;
}
