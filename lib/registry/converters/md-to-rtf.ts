import type { ConversionResult } from '../types';
import { changed, lost, outputFile, readText } from '../shared';
import type { Warning } from '../types';
import { parseMarkdown } from './_md';
import { writeRtf } from './_rtf';

export async function convert(input: File): Promise<ConversionResult> {
  const source = await readText(input);
  const blocks = await parseMarkdown(source);

  const warnings: Warning[] = [];
  // Every cell is still in the file, no longer in a grid: `changed`.
  if (blocks.some((block) => block.kind === 'table')) {
    warnings.push(
      changed(
        'Tables became tab-separated lines. RTF has a table model, but not one Recast writes.',
      ),
    );
  }
  if (/!\[[^\]]*\]\([^)]*\)/.test(source)) {
    warnings.push(lost('Images in the Markdown were dropped.'));
  }

  return {
    files: [outputFile(input.name, 'rtf', writeRtf(blocks))],
    warnings: warnings.length ? warnings : undefined,
  };
}
