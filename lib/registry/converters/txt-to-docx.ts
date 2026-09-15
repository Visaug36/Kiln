import type { ConversionResult } from '../types';
import { baseName, outputFile, readText } from '../shared';
import { writeDocx } from './_docx';
import type { Block } from './_md';

export async function convert(input: File): Promise<ConversionResult> {
  const text = await readText(input);

  const blocks: Block[] = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((paragraph) => ({ kind: 'paragraph', text: paragraph }));

  const bytes = await writeDocx(blocks, baseName(input.name));
  return { files: [outputFile(input.name, 'docx', bytes)] };
}
