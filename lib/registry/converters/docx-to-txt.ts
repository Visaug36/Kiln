import type { ConversionResult } from '../types';
import { fail, outputFile } from '../shared';
import { htmlToPlainText, readDocx } from './_docx';

export async function convert(input: File): Promise<ConversionResult> {
  const { html, warnings } = await readDocx(input);
  const text = htmlToPlainText(html);

  // A document of nothing but pictures converts to an empty file. Handing that
  // back as a finished conversion is worse than refusing it.
  if (!text.trim()) {
    fail(
      'This document has no text in it. It may hold only images, which Recast cannot convert.',
    );
  }

  return {
    files: [outputFile(input.name, 'txt', `${text}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
