import type { ConversionResult } from '../types';
import { outputFile, readText } from '../shared';
import { parseMarkdown } from './_md';
import { writeDocx } from './_docx';
import { baseName } from '../shared';

export async function convert(input: File): Promise<ConversionResult> {
  const source = await readText(input);
  const blocks = await parseMarkdown(source);
  const bytes = await writeDocx(blocks, baseName(input.name));

  const warnings = /<[a-z][\s\S]*>/i.test(source)
    ? ['Raw HTML in the Markdown was dropped; Word has no equivalent for it.']
    : undefined;

  return { files: [outputFile(input.name, 'docx', bytes)], warnings };
}
