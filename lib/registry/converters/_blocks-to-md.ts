import type { Block } from './_md';
import { toPipeTable } from './_sheet';

/** Kiln's block list back out as Markdown. */
export function blocksToMarkdown(blocks: Block[]): string {
  const parts: string[] = [];
  let ordinal = 0;

  for (const block of blocks) {
    if (block.kind !== 'bullet' || !block.ordered) ordinal = 0;

    switch (block.kind) {
      case 'heading':
        parts.push(`${'#'.repeat(Math.min(block.level, 6))} ${block.text}`);
        break;
      case 'bullet':
        if (block.ordered) {
          ordinal += 1;
          parts.push(`${ordinal}. ${block.text}`);
        } else {
          parts.push(`- ${block.text}`);
        }
        break;
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
