import type { Format, OutputFile, Severity, Warning } from './types';

/**
 * The three ways to write a warning, and the only three.
 *
 * Calling one of these at the point of loss is what makes the hierarchy real
 * rather than cosmetic. The alternative — a component matching on words like
 * "dropped" — breaks the first time somebody rewrites a sentence, and breaks
 * silently, in the direction of under-reporting.
 *
 * `lost` is for something that is in the source and not in the output.
 * `changed` is for something that survived in a different shape.
 * `note` is for how the conversion works, where nothing went missing.
 * `Severity` in `types.ts` has the full test.
 */
const warn =
  (severity: Severity) =>
  (message: string): Warning => ({ severity, message });

/** Something in the source is not in the output. Never collapsed. */
export const lost = warn('lost');

/** Everything is there, in a different shape. */
export const changed = warn('changed');

/** Nothing lost or reshaped — how it works, and what to check. */
export const note = warn('note');

/** MIME type written onto each produced blob. */
export const MIME: Record<Format, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  html: 'text/html',
  epub: 'application/epub+zip',
  md: 'text/markdown',
  txt: 'text/plain',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  json: 'application/json',
};

/**
 * The formats that are a ZIP archive underneath.
 *
 * They share a failure mode — a truncated download or a half-written file reads
 * as a broken archive — and the advice for it is the same: re-save from the app
 * that made it.
 */
const ZIPPED = new Set<Format>(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub']);

/** Longest file Recast will take on. Everything is held in memory. */
export const MAX_BYTES = 100 * 1024 * 1024;

/**
 * An error whose message is meant to be read by the person who dropped the
 * file. Engines throw these; anything else that escapes is replaced with a
 * generic sentence rather than shown raw.
 */
export class RecastError extends Error {
  readonly userFacing = true;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RecastError';
  }
}

/**
 * `cause` is kept so the worker can log what the library actually said. It is
 * never shown in the interface — only the message is.
 */
export function fail(message: string, cause?: unknown): never {
  throw new RecastError(message, cause === undefined ? undefined : { cause });
}

/**
 * Unwraps a CommonJS module loaded through `import()`.
 *
 * mammoth and SheetJS are CJS. Depending on the bundler, `await import()` hands
 * back either the module's exports directly or an ESM wrapper with everything
 * under `default` — and the difference only shows up at runtime, as
 * "x.convertToHtml is not a function" in the browser while Node was fine.
 */
export function interop<T>(module: T): T {
  const wrapper = module as { default?: T };
  return wrapper.default ?? module;
}

/** `report.final.docx` → `report.final`. */
export function baseName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/** What an engine can hand back as the body of an output file. */
export type OutputBody = string | Uint8Array | ArrayBuffer;

export function outputFile(
  original: string,
  to: Format,
  data: OutputBody,
  suffix = '',
): OutputFile {
  // A Uint8Array is a perfectly good BlobPart at runtime, but its declared
  // buffer type is ArrayBufferLike, which TypeScript will not narrow to the
  // ArrayBuffer that BlobPart wants. The cast is the friction, not a risk.
  const part = data as BlobPart;
  return {
    blob: new Blob([part], { type: MIME[to] }),
    filename: `${baseName(original)}${suffix}.${to}`,
  };
}

/** Rejects the inputs that would otherwise fail deep inside a library. */
export async function readArrayBuffer(input: File): Promise<ArrayBuffer> {
  if (input.size === 0) {
    fail('This file is empty. There is nothing in it to convert.');
  }
  if (input.size > MAX_BYTES) {
    fail(
      `This file is ${Math.round(input.size / 1024 / 1024)} MB. Recast works in memory and stops at 100 MB.`,
    );
  }
  return input.arrayBuffer();
}

export async function readText(input: File): Promise<string> {
  const buffer = await readArrayBuffer(input);
  const bytes = new Uint8Array(buffer);

  // Honour a BOM rather than letting it show up as a stray character.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Turns whatever a library threw into something a person can act on. Library
 * messages are matched by signature because none of them expose error codes.
 */
export function describeFailure(cause: unknown, kind: Format): string {
  if (cause instanceof RecastError) return cause.message;

  const raw = cause instanceof Error ? cause.message : String(cause);
  const text = raw.toLowerCase();

  if (
    text.includes('password') ||
    text.includes('encrypted') ||
    text.includes('passwordexception')
  ) {
    return 'This file is password-protected. Remove the password and try again.';
  }

  if (
    text.includes('end of central directory') ||
    text.includes('corrupted zip') ||
    text.includes('invalid signature') ||
    text.includes("can't find end of central directory")
  ) {
    return ZIPPED.has(kind)
      ? `This ${kind.toUpperCase()} file is damaged and cannot be opened. Try re-saving it from the app that made it.`
      : 'This file is damaged and cannot be opened.';
  }

  if (text.includes('invalid pdf') || text.includes('missing pdf header')) {
    return 'This does not look like a PDF inside, even though it is named like one.';
  }

  // Deliberately vague rather than leaking a stack trace or library internals.
  return 'Recast could not read this file. It may be damaged, or saved in a format this converter does not handle.';
}
