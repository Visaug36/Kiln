import { MAX_LIST_DEPTH, listCounter } from './_md';
import type { Block } from './_md';
import { toPipeTable } from './_sheet';

/** Kiln's block list back out as Markdown. */
export function blocksToMarkdown(blocks: Block[]): string {
  const parts: string[] = [];
  let nextOrdinal = listCounter();

  for (const block of blocks) {
    // A list ends where a block of any other kind begins, and the next one
    // starts again at 1.
    if (block.kind !== 'bullet') nextOrdinal = listCounter();

    switch (block.kind) {
      case 'heading':
        parts.push(`${'#'.repeat(Math.min(block.level, 6))} ${block.text}`);
        break;
      case 'bullet': {
        // Four spaces per level: unambiguous under CommonMark for both `-` and
        // `1.`, where two would be a continuation of the item above.
        const indent = '    '.repeat(Math.min(block.depth, MAX_LIST_DEPTH));
        const ordinal = nextOrdinal(block);
        parts.push(`${indent}${block.ordered ? `${ordinal}.` : '-'} ${block.text}`);
        break;
      }
      case 'code':
        parts.push(`\`\`\`\n${block.text}\n\`\`\``);
        break;
      case 'quote':
        parts.push(
          block.text
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n'),
        );
        break;
      case 'table':
        parts.push(toPipeTable(block.rows));
        break;
      case 'rule':
        parts.push('---');
        break;
      default:
        parts.push(block.text);
        break;
    }
  }

  // Consecutive list items belong in one block; everything else gets a gap.
  const out: string[] = [];
  for (const [index, part] of parts.entries()) {
    const previous = blocks[index - 1];
    const current = blocks[index];
    const bothBullets = previous?.kind === 'bullet' && current?.kind === 'bullet';
    if (index > 0) out.push(bothBullets ? '\n' : '\n\n');
    out.push(part);
  }

  return out
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
