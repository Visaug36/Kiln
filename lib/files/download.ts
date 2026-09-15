import type { OutputFile } from '@/lib/registry/types';

/**
 * Hand a blob to the browser's own download machinery. Nothing here touches
 * the network — the object URL points at memory in this tab.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the click a tick to start before the URL is reclaimed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bundles several outputs into one archive, so a job is always one download. */
export async function zipFiles(files: readonly OutputFile[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const used = new Set<string>();
  for (const file of files) {
    // Two sheets named the same would otherwise overwrite each other.
    let filename = file.filename;
    let n = 2;
    while (used.has(filename)) {
      const dot = file.filename.lastIndexOf('.');
      filename =
        dot > 0
          ? `${file.filename.slice(0, dot)}-${n}${file.filename.slice(dot)}`
          : `${file.filename}-${n}`;
      n += 1;
    }
    used.add(filename);
    zip.file(filename, file.blob);
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Everything a finished job produced, as a single download. */
export async function downloadResult(
  files: readonly OutputFile[],
  zipName: string,
): Promise<void> {
  if (files.length === 0) return;
  if (files.length === 1) {
    downloadBlob(files[0]!.blob, files[0]!.filename);
    return;
  }
  downloadBlob(await zipFiles(files), zipName);
}
