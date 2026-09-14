import { FORMATS, type Format } from '@/lib/registry';

/** Extensions that map onto a format under a different name. */
const ALIASES: Record<string, Format> = {
  markdown: 'md',
  mdown: 'md',
  mkd: 'md',
  text: 'txt',
};

/** The part after the final dot, lowercased. Empty when there is no extension. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Kiln decides a file's format from its extension alone. Sniffing the bytes
 * would mean reading the file before the user has chosen anything, and the
 * extension is what they see in the row.
 */
export function detectFormat(filename: string): Format | undefined {
  const ext = extensionOf(filename);
  if (!ext) return undefined;
  if (ext in ALIASES) return ALIASES[ext];
  return FORMATS.find((f) => f === ext);
}

/** `report.final.docx` → `report.final`. Used to name the converted file. */
export function baseName(filename: string): string {
  const ext = extensionOf(filename);
  return ext ? filename.slice(0, filename.length - ext.length - 1) : filename;
}
