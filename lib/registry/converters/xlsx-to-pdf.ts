import type { ConversionResult, ProgressFn } from '../types';
import { outputFile } from '../shared';
import { readWorkbook } from './_sheet';
import { clippedWarning, pdfTable, tableWasClipped } from './_blocks-to-pdf';
import { pdfDocument, renderPdf, requireContent } from './_pdf';

export async function convert(
  input: File,
  onProgress?: ProgressFn,
): Promise<ConversionResult> {
  const { sheets, warnings } = await readWorkbook(input, onProgress);
  const many = sheets.length > 1;

  const content: Record<string, unknown>[] = [];
  let clipped = false;

  for (const [index, sheet] of sheets.entries()) {
    if (sheet.rows.length === 0) continue;
    if (many) {
      content.push({
        text: sheet.name,
        style: 'h2',
        pageBreak: index > 0 ? 'before' : undefined,
      });
    }
    if (tableWasClipped(sheet.rows)) clipped = true;
    content.push(pdfTable(sheet.rows));
  }

  onProgress?.({ phase: 'writing' });
  const render = await renderPdf(
    pdfDocument(requireContent(content, 'data'), { pageOrientation: 'landscape' }),
  );

  const notes = [...warnings, ...render.warnings];
  if (clipped) notes.unshift(clippedWarning('Sheets'));

  return {
    files: [outputFile(input.name, 'pdf', render.bytes)],
    warnings: notes.length ? notes : undefined,
  };
}
