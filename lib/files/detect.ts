import { FORMATS, type Format } from '@/lib/registry';

/** Extensions that map onto a format under a different name. */
const ALIASES: Record<string, Format> = {
  markdown: 'md',
  mdown: 'md',
  mkd: 'md',
  text: 'txt',
  tsv: 'csv',
};

/** The part after the final dot, lowercased. Empty when there is no extension. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

/** `report.final.docx` → `report.final`. Used to name the converted file. */
export function baseName(filename: string): string {
  const ext = extensionOf(filename);
  return ext ? filename.slice(0, filename.length - ext.length - 1) : filename;
}

/** What the filename claims, before the bytes get a say. */
export function formatFromExtension(filename: string): Format | undefined {
  const ext = extensionOf(filename);
  if (!ext) return undefined;
  if (ext in ALIASES) return ALIASES[ext];
  return FORMATS.find((f) => f === ext);
}

export interface Detection {
  /** What Kiln will actually treat the file as. */
  format?: Format;
  /** What the extension claimed, when it disagreed with the contents. */
  claimed?: Format;
  /** Set when the extension lied, so the row can say so. */
  mismatch: boolean;
  /** Set when the bytes are a format Kiln does not handle at all. */
  reason?: string;
}

const OOXML_PART = '[Content_Types].xml';

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * The first `length` bytes of a file.
 *
 * Browsers hand back a Blob from `slice()` that can be read on its own, which
 * is what we want — there is no reason to pull a 90 MB file into memory to look
 * at eight bytes. jsdom's sliced Blob has no `arrayBuffer`, so tests fall back
 * to reading the whole (tiny) fixture.
 */
async function readHead(file: File, length: number): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  if (typeof slice.arrayBuffer === 'function') {
    return new Uint8Array(await slice.arrayBuffer());
  }
  return new Uint8Array(await file.arrayBuffer()).subarray(0, length);
}

/**
 * OOXML files are ZIPs. The only honest way to tell a DOCX from an XLSX from a
 * PPTX is to open the archive and read the content-type map, which names the
 * main part. Extensions get swapped by hand and by mail gateways constantly.
 */
async function sniffOoxml(file: File): Promise<Format | undefined> {
  const { default: JSZip } = await import('jszip');
  let zip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return undefined;
  }

  const types = zip.file(OOXML_PART);
  if (!types) return undefined;

  const xml = await types.async('string');
  if (xml.includes('wordprocessingml.document.main')) return 'docx';
  if (xml.includes('spreadsheetml.sheet.main')) return 'xlsx';
  if (xml.includes('presentationml.presentation.main')) return 'pptx';

  // Macro-enabled and template variants carry the same main part under a
  // different content type; fall back to looking at the directory layout.
  const names = Object.keys(zip.files);
  if (names.some((n) => n.startsWith('word/'))) return 'docx';
  if (names.some((n) => n.startsWith('xl/'))) return 'xlsx';
  if (names.some((n) => n.startsWith('ppt/'))) return 'pptx';

  return undefined;
}

/**
 * Decides what a file really is. Binary formats are identified by their leading
 * bytes and, for OOXML, by the archive's content-type map. The extension is
 * only trusted for the plain-text formats, which have no signature to read.
 */
export async function detectFormat(file: File): Promise<Detection> {
  const claimed = formatFromExtension(file.name);

  if (file.size === 0) {
    return { format: claimed, claimed, mismatch: false };
  }

  const head = await readHead(file, 8);

  const settle = (format: Format | undefined, reason?: string): Detection => ({
    format,
    claimed,
    mismatch: Boolean(format && claimed && format !== claimed),
    reason,
  });

  // ZIP — could be any OOXML type, or something else entirely.
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    const ooxml = await sniffOoxml(file);
    if (ooxml) return settle(ooxml);
    return settle(
      undefined,
      'This is a ZIP archive, not a document Kiln can read. Unzip it and drop what is inside.',
    );
  }

  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return settle('pdf'); // %PDF

  // {\rtf
  if (startsWith(head, [0x7b, 0x5c, 0x72, 0x74, 0x66])) return settle('rtf');

  // The old binary Word/Excel/PowerPoint container. Users hit this constantly
  // because renaming .doc to .docx looks like it should work.
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return settle(
      undefined,
      'This is an old binary Office file (.doc, .xls or .ppt), not the newer XML format. Open it and save it as .docx, .xlsx or .pptx first.',
    );
  }

  // No signature left to check. Text formats are told apart by extension only.
  if (claimed === 'md' || claimed === 'txt' || claimed === 'csv') {
    return settle(claimed);
  }

  if (claimed) {
    // Named like a binary format but carrying none of its bytes.
    return settle(
      undefined,
      `This file is named .${claimed} but its contents are not ${claimed.toUpperCase()}.`,
    );
  }

  return settle(undefined);
}
