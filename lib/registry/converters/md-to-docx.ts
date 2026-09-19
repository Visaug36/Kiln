import type { ConversionResult } from '../types';
import { lost, outputFile, readText } from '../shared';
import { parseMarkdown } from './_md';
import { writeDocx } from './_docx';
import { baseName } from '../shared';

export async function convert(input: File): Promise<ConversionResult> {
  const source = await readText(input);
  const blocks = await parseMarkdown(source);
  const bytes = await writeDocx(blocks, baseName(input.name));

  // "in the Markdown" is gone: eleven pairs reach this writer through Markdown
  // that Recast produced, and telling somebody who dropped a PDF about their
  // Markdown names a file they never had.
  const warnings = /<[a-z][\s\S]*>/i.test(source)
    ? [lost('Raw HTML was dropped; Word has no equivalent for it.')]
    : undefined;

  return { files: [outputFile(input.name, 'docx', bytes)], warnings };
}
