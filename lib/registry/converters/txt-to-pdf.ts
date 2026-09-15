import type { ConversionResult } from '../types';
import { fail, outputFile, readText } from '../shared';
import { pdfDocument, renderPdf } from './_pdf';

export async function convert(input: File): Promise<ConversionResult> {
  const text = await readText(input);

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    fail('There was no text to put in the PDF.');
  }

  const content = paragraphs.map((paragraph) => ({
    text: paragraph,
    margin: [0, 0, 0, 8],
  }));

  const bytes = await renderPdf(pdfDocument(content));
  return { files: [outputFile(input.name, 'pdf', bytes)] };
}
