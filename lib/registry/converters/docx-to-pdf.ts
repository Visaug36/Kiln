import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { htmlToBlocks, readDocx } from './_docx';
import { blocksToPdfContent } from './_blocks-to-pdf';
import { pdfDocument, renderPdf, requireContent } from './_pdf';

export async function convert(input: File): Promise<ConversionResult> {
  const { html, warnings } = await readDocx(input);
  const blocks = htmlToBlocks(html);
  const content = requireContent(blocksToPdfContent(blocks), 'text');

  const bytes = await renderPdf(pdfDocument(content));

  return {
    files: [outputFile(input.name, 'pdf', bytes)],
    warnings: warnings.length ? warnings : undefined,
  };
}
