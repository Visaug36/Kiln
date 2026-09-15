import type { Block } from './_md';
import type { Row } from './_sheet';

/** Kiln's block list as pdfmake content nodes. */
export function blocksToPdfContent(blocks: Block[]): Record<string, unknown>[] {
  const content: Record<string, unknown>[] = [];
  let pendingList: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!pendingList) return;
    content.push(
      pendingList.ordered
        ? { ol: pendingList.items, margin: [0, 0, 0, 8] }
        : { ul: pendingList.items, margin: [0, 0, 0, 8] },
    );
    pendingList = null;
  };

  for (const block of blocks) {
    if (block.kind !== 'bullet') flushList();

    switch (block.kind) {
      case 'heading':
        content.push({
          text: block.text,
          style: `h${Math.min(block.level, 4)}`,
        });
        break;

      case 'bullet':
        if (!pendingList || pendingList.ordered !== block.ordered) {
          flushList();
          pendingList = { ordered: block.ordered, items: [] };
        }
        pendingList.items.push(block.text);
        break;

      case 'code':
        content.push({
          text: block.text,
          style: 'code',
          margin: [0, 0, 0, 8],
          preserveLeadingSpaces: true,
        });
        break;

      case 'quote':
        content.push({ text: block.text, style: 'quote' });
        break;

      case 'table':
        content.push(pdfTable(block.rows));
        break;

      case 'rule':
        content.push({
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 4,
              x2: 483,
              y2: 4,
              lineWidth: 0.5,
              lineColor: '#cccccc',
            },
          ],
          margin: [0, 6, 0, 10],
        });
        break;

      default:
        content.push({ text: block.text, margin: [0, 0, 0, 8] });
        break;
    }
  }

  flushList();
  return content;
}

/**
 * A table sized to the page.
 *
 * pdfmake throws if any row has a different cell count than the widths array,
 * so every row is padded to the widest one. Columns beyond what fits on A4 are
 * dropped rather than letting pdfmake overflow the page silently — the caveat
 * on the wide-sheet pairs says this happens.
 */
export const MAX_PDF_COLUMNS = 12;

export function pdfTable(rows: Row[]): Record<string, unknown> {
  const usable = rows.filter((row) => row.length > 0);
  if (usable.length === 0) return { text: '' };

  const width = Math.min(Math.max(...usable.map((row) => row.length)), MAX_PDF_COLUMNS);

  const body = usable.map((row, rowIndex) =>
    Array.from({ length: width }, (_, i) => ({
      text: row[i] ?? '',
      style: rowIndex === 0 ? 'th' : 'td',
    })),
  );

  return {
    table: { headerRows: 1, widths: Array.from({ length: width }, () => '*'), body },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 12],
  };
}

/** True when a table had to lose columns to fit the page. */
export function tableWasClipped(rows: Row[]): boolean {
  return rows.some((row) => row.length > MAX_PDF_COLUMNS);
}
