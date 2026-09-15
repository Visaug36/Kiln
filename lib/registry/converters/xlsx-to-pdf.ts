import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { readWorkbook } from './_sheet';
import { MAX_PDF_COLUMNS, pdfTable, tableWasClipped } from './_blocks-to-pdf';
import { pdfDocument, renderPdf, requireContent } from './_pdf';

export async function convert(input: File): Promise<ConversionResult> {
  const { sheets, warnings } = await readWorkbook(input);
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

  const bytes = await renderPdf(
    pdfDocument(requireContent(content, 'data'), { pageOrientation: 'landscape' }),
  );

  const notes = [...warnings];
  if (clipped) {
    notes.unshift(
      `Sheets wider than ${MAX_PDF_COLUMNS} columns were cut off at that point — a page can only hold so much.`,
    );
  }

  return {
    files: [outputFile(input.name, 'pdf', bytes)],
    warnings: notes.length ? notes : undefined,
  };
}
