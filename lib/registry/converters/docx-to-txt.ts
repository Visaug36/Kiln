import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { htmlToPlainText, readDocx } from './_docx';

export async function convert(input: File): Promise<ConversionResult> {
  const { html, warnings } = await readDocx(input);
  const text = htmlToPlainText(html);

  return {
    files: [outputFile(input.name, 'txt', `${text}\n`)],
    warnings: warnings.length ? warnings : undefined,
  };
}
