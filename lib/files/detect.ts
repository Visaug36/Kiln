import { FORMATS, type Format } from '@/lib/registry';

/** Formats with no magic bytes of their own, identified by extension. */
const TEXTUAL = new Set<Format>(['md', 'txt', 'csv', 'html', 'json']);

/** Extensions that map onto a format under a different name. */
const ALIASES: Record<string, Format> = {
  markdown: 'md',
  mdown: 'md',
  mkd: 'md',
  text: 'txt',
  tsv: 'csv',
  htm: 'html',
  xhtml: 'html',
  fodt: 'odt',
  ott: 'odt',
  ots: 'ods',
  otp: 'odp',
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
  /** What Recast will actually treat the file as. */
  format?: Format;
  /** What the extension claimed, when it disagreed with the contents. */
  claimed?: Format;
  /** Set when the extension lied, so the row can say so. */
  mismatch: boolean;
  /** Set when the bytes are a format Recast does not handle at all. */
  reason?: string;
  /**
   * The leading bytes are a ZIP, so which OOXML type it is can only be settled
   * by opening the archive — which needs a library, and therefore the worker.
   */
  needsArchiveCheck?: boolean;
}

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
 * Decides what a file really is, as far as its leading bytes can say.
 *
 * Binary formats are identified by signature; the extension is only trusted for
 * the plain-text formats, which have none to read. A ZIP could be any of DOCX,
 * XLSX or PPTX, and telling those apart means opening the archive — so this
 * returns `needsArchiveCheck` and the caller asks the worker, where the zip
 * library already lives. Doing it here would put a second copy of JSZip in the
 * page's bundle, downloaded by everyone who drops an Office file.
 */
export async function detectFormat(file: File): Promise<Detection> {
  const claimed = formatFromExtension(file.name);

  if (file.size === 0) {
    return { format: claimed, claimed, mismatch: false };
  }

  const head = await readHead(file, 8);
  return detectFromHead(head, claimed);
}

/** The synchronous part: everything decidable from the first eight bytes. */
export function detectFromHead(head: Uint8Array, claimed: Format | undefined): Detection {
  const settle = (format: Format | undefined, reason?: string): Detection => ({
    format,
    claimed,
    mismatch: Boolean(format && claimed && format !== claimed),
    reason,
  });

  // ZIP — could be any OOXML type, or something else entirely. Only the
  // archive's own content-type map can say which.
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    return { claimed, mismatch: false, needsArchiveCheck: true };
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

  // No signature left to check. Text formats carry none, so the extension is
  // all there is — and saying so is more honest than sniffing for `<html` or a
  // leading brace, which would misread a Markdown file that opens with either.
  if (TEXTUAL.has(claimed as Format)) {
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

/** Folds the worker's answer about an archive back into a Detection. */
export function settleArchive(
  claimed: Format | undefined,
  format: Format | undefined,
): Detection {
  if (!format) {
    return {
      claimed,
      mismatch: false,
      reason:
        'This is a ZIP archive, not a document Recast can read. Unzip it and drop what is inside.',
    };
  }
  return {
    format,
    claimed,
    mismatch: Boolean(claimed && format !== claimed),
  };
}
