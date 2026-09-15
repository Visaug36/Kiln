import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { htmlToBlocks, readDocx } from './_docx';
import { blocksToPdfContent } from './_blocks-to-pdf';
import { pdfDocument, renderPdf, requireContent } from './_pdf';

export async function convert(input: File): Promise<ConversionResult> {
  const { html, warnings } = await readDocx(input);
  const blocks = htmlToBlocks(html);
  const { content, warnings: clipping } = blocksToPdfContent(blocks);

  const render = await renderPdf(pdfDocument(requireContent(content, 'text')));
  const notes = [...warnings, ...clipping, ...render.warnings];

  return {
    files: [outputFile(input.name, 'pdf', render.bytes)],
    warnings: notes.length ? notes : undefined,
  };
}
