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

/**
 * Several downloads in a row. Browsers throttle simultaneous downloads, so
 * they are spaced out rather than fired at once.
 */
export async function downloadAll(
  files: readonly { blob: Blob; filename: string }[],
): Promise<void> {
  for (const [index, file] of files.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 150));
    downloadBlob(file.blob, file.filename);
  }
}
