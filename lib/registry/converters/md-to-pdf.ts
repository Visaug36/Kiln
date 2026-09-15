import type { ConversionResult } from '../types';
import { outputFile, readText } from '../shared';
import { parseMarkdown } from './_md';
import { blocksToPdfContent } from './_blocks-to-pdf';
import { pdfDocument, renderPdf, requireContent } from './_pdf';

export async function convert(input: File): Promise<ConversionResult> {
  const source = await readText(input);
  const blocks = await parseMarkdown(source);
  const content = requireContent(blocksToPdfContent(blocks), 'text');

  const bytes = await renderPdf(pdfDocument(content));
  return { files: [outputFile(input.name, 'pdf', bytes)] };
}
