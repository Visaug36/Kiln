import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'test', 'fixtures');

/** The string every generated fixture contains, for round-trip assertions. */
export const MARKER = 'Kiln fixture marker 4711';

/**
 * Loads a fixture as a real `File`, which is what every engine takes.
 *
 * The bytes are genuine output from the writers, so a reader that only appears
 * to work cannot pass — see scripts/make-fixtures.mjs.
 */
export function fixture(name: string, renameTo?: string): File {
  const bytes = readFileSync(join(DIR, name));
  // Copy into a fresh ArrayBuffer so the File owns its own memory.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy], renameTo ?? name);
}

export async function textOf(blob: Blob): Promise<string> {
  return new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
}

export async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}
