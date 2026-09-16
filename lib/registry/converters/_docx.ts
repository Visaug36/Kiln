import { describeFailure, fail, interop, readArrayBuffer } from '../shared';
import { MAX_LIST_DEPTH } from './_md';
import type { Block } from './_md';
import type { Row } from './_sheet';

export interface DocxRead {
  html: string;
  warnings: string[];
}

/**
 * DOCX to HTML via mammoth, which maps Word's styles onto semantic elements
 * rather than trying to reproduce its formatting. That is the right trade here:
 * everything downstream wants structure, not appearance.
 */
export async function readDocx(input: File): Promise<DocxRead> {
  const buffer = await readArrayBuffer(input);

  // A .doc renamed to .docx is the single most common bad input, and mammoth's
  // own error for it is an unhelpful zip complaint.
  const head = new Uint8Array(buffer.slice(0, 8));
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    fail(
      'This is an old binary .doc file, not a .docx. Open it in Word and use Save As to make a .docx first.',
    );
  }

  const mammoth = interop(await import('mammoth'));

  try {
    // mammoth's browser build reads `arrayBuffer`; its Node build (which the
    // tests run against) reads `buffer`. Both are given so one call serves both.
    const result = await mammoth.convertToHtml(
      { arrayBuffer: buffer, buffer: new Uint8Array(buffer) } as Parameters<
        typeof mammoth.convertToHtml
      >[0],
      { styleMap: ['u => u'] },
    );

    const warnings = (result.messages ?? [])
      .filter((m) => m.type === 'warning')
      .map((m) => m.message);

    return {
      html: result.value,
      warnings: summariseDocxWarnings(warnings, result.value),
    };
  } catch (cause) {
    fail(describeFailure(cause, 'docx'), cause);
  }
}

/**
 * mammoth emits one message per unrecognised style, which for a heavily styled
 * document can be hundreds of near-identical lines. Collapse them.
 *
 * Images are counted from the HTML rather than from the messages. mammoth
 * inlines a picture as a data URI and says nothing about it, so keying the
 * warning off a message meant it never fired: every writer downstream strips
 * the tag, and the picture left the document without a word — which is the one
 * thing an engine may not do.
 */
function summariseDocxWarnings(messages: string[], html: string): string[] {
  const unrecognised = messages.filter((m) => m.includes('Unrecognised paragraph style'));
  const images = [...html.matchAll(/<img\b/gi)];
  const out: string[] = [];

  if (unrecognised.length > 0) {
    out.push(
      `${unrecognised.length} custom Word style${unrecognised.length === 1 ? '' : 's'} had no equivalent and fell back to normal text.`,
    );
  }
  if (images.length > 0) {
    out.push(
      `${images.length} image${images.length === 1 ? '' : 's'} in the document ${images.length === 1 ? 'was' : 'were'} not carried over.`,
    );
  }
  return out;
}

/**
 * Inline HTML to inline Markdown.
 *
 * turndown would do this, but its browser build needs `document` and a Web
 * Worker has no DOM, while its Node build pulls in a whole DOM implementation.
 * mammoth's output is a small, well-formed subset — emphasis, links, code —
 * so converting it directly is both smaller and more predictable than either.
 *
 * Innermost tags are rewritten first: `[^<]*` only matches content with no
 * nested tags, so repeating until nothing changes unwraps from the inside out.
 */
export function inlineToMarkdown(html: string): string {
  let out = html;
  let previous: string;

  do {
    previous = out;
    out = out
      .replace(/<(strong|b)\b[^>]*>([^<]*)<\/\1>/gi, (_m, _tag, inner: string) =>
        inner.trim() ? `**${inner.trim()}**` : inner,
      )
      .replace(/<(em|i)\b[^>]*>([^<]*)<\/\1>/gi, (_m, _tag, inner: string) =>
        inner.trim() ? `*${inner.trim()}*` : inner,
      )
      .replace(/<code\b[^>]*>([^<]*)<\/code>/gi, (_m, inner: string) =>
        inner.trim() ? `\`${inner}\`` : inner,
      )
      .replace(
        /<a\b[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi,
        (_m, href: string, label: string) =>
          label.trim() ? `[${label}](${href})` : label,
      )
      // Carried for their text only; Markdown has no equivalent mark.
      .replace(/<(u|s|strike|del|span|sup|sub|ins|mark)\b[^>]*>([^<]*)<\/\1>/gi, '$2');
  } while (out !== previous);

  return decodeEntities(
    out
      // A line break is not nothing: stripped with the other tags it fused the
      // words either side of it into one ("first linesecond line").
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

/** Strips HTML to readable text, preserving block boundaries. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\s*(td|th)[^>]*>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Tags each `<li>` with the kind and the depth of the list it belongs to.
 *
 * Done by walking the tags in order and keeping a stack, rather than matching
 * `<ol>…</ol>`: a non-greedy match ends at the *first* closing tag, which for
 * a nested list is the inner one, so every item after it loses its numbering.
 * A greedy match has the mirror problem across sibling lists.
 *
 * The stack's height is the nesting depth, which is the only place it is known
 * — `splitNestedItems` has already flattened the markup by the time blocks are
 * built, so depth has to be recorded here or not at all.
 */
function markListItems(html: string): string {
  const stack: ('ol' | 'ul')[] = [];

  return html.replace(/<(\/?)(ol|ul|li)\b/gi, (match, closing: string, tag: string) => {
    const name = tag.toLowerCase();

    if (name === 'li') {
      // Only the opening tag carries the markers; `</li data-kiln-depth="1">`
      // would be malformed and would confuse the block matcher.
      if (closing) return match;
      const depth = Math.max(0, stack.length - 1);
      const ordered = stack[stack.length - 1] === 'ol' ? ' data-kiln-ordered' : '';
      return `${match}${ordered} data-kiln-depth="${depth}"`;
    }
    if (closing) {
      // Tolerate stray closers rather than corrupting the rest of the document.
      if (stack[stack.length - 1] === name) stack.pop();
    } else {
      stack.push(name as 'ol' | 'ul');
    }
    return match;
  });
}

/**
 * Closes each `<li>` before any list nested inside it.
 *
 * Word writes nested lists as `<li>outer<ul><li>inner</li></ul></li>`. The
 * non-greedy block matcher stops at the first `</li>`, which is the inner
 * one — so the outer item swallows its children and two bullets arrive as a
 * single run of text ("outer• inner"). Splitting the item at the nested list
 * keeps them separate. Depth is not modelled: Kiln's block list is flat, so
 * a nested item becomes a sibling bullet rather than being lost.
 */
function splitNestedItems(html: string): string {
  let out = html;
  let previous: string;
  do {
    previous = out;
    out = out.replace(
      /<li\b([^>]*)>((?:(?!<\/?li\b)[\s\S])*?)(<(?:ul|ol)\b)/gi,
      '<li$1>$2</li>$3',
    );
  } while (out !== previous);
  return out;
}

/**
 * Pulls `<table>` blocks out as rows of cells.
 *
 * Takes the same `render` the surrounding blocks use. Hardcoding
 * `inlineToMarkdown` here put `**bold**` into the cells of every PDF, RTF and
 * plain-text conversion, while the paragraphs beside them came out clean — the
 * cells were the one path that skipped the caller's choice of formatter.
 */
function tableRows(
  html: string,
  render: (html: string) => string,
  report: (loss: Loss) => void,
): Row[] {
  const rows: Row[] = [];

  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];

    for (const cell of (row[1] ?? '').matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const attributes = cell[2] ?? '';
      const span = /\b(col|row)span\s*=\s*["']?([2-9]\d*)/i.exec(attributes);
      // A merged cell becomes one plain cell, so the grid no longer lines up.
      // The text survives; the shape does not, and the user is told which.
      if (span) report('span');

      // A cell is one grid position. A newline inside it would break a pipe
      // table and read as a new paragraph in a DOCX cell.
      cells.push((render(cell[3] ?? '') ?? '').replace(/\s*\n\s*/g, ' '));
    }

    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}

/** What this layer can lose. Counted, then turned into one sentence each. */
type Loss = 'span' | 'stranded';

export interface BlocksRead {
  blocks: Block[];
  /** Everything this layer had to drop or flatten. Empty when nothing was. */
  warnings: string[];
}

/**
 * HTML into Kiln's flat block list, used when writing DOCX/PDF/RTF/Markdown.
 *
 * `inline: 'markdown'` keeps emphasis and links as Markdown punctuation, which
 * is what the `* → md` engines want. The other writers set whole blocks and
 * would show the punctuation literally, so they take the plain-text form.
 *
 * Returns warnings as well as blocks. This layer sits between every reader and
 * every writer, and it can lose two things: a merged table cell, whose shape
 * cannot survive a plain grid, and text inside an element it does not
 * recognise, which it used to drop without trace. Two separate bugs reduced to
 * this missing channel, so the stranded-text check is deliberately general —
 * it reports whatever did not reach a block, rather than a list of tags
 * somebody has to remember to extend.
 */
export function htmlToBlocks(
  html: string,
  { inline = 'text' }: { inline?: 'text' | 'markdown' } = {},
): BlocksRead {
  const render = inline === 'markdown' ? inlineToMarkdown : htmlToPlainText;
  const blocks: Block[] = [];
  const source = markListItems(splitNestedItems(html));

  const losses: Record<Loss, number> = { span: 0, stranded: 0 };
  const report = (loss: Loss) => {
    losses[loss] += 1;
  };

  const pattern =
    /<(h[1-6]|p|li|blockquote|pre|table)\b([^>]*)>([\s\S]*?)<\/\1>|<(hr)\b[^>]*\/?>/gi;

  // Spans the pattern consumed, so what it did not can be read afterwards.
  const consumed: [number, number][] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    consumed.push([match.index, match.index + match[0].length]);

    if (match[4]) {
      blocks.push({ kind: 'rule' });
      continue;
    }

    const tag = (match[1] ?? '').toLowerCase();
    const attributes = match[2] ?? '';
    const body = match[3] ?? '';

    if (tag === 'table') {
      const rows = tableRows(body, render, report);
      if (rows.length > 0) blocks.push({ kind: 'table', rows });
      continue;
    }

    const text = render(body);
    if (!text) continue;

    if (/^h[1-6]$/.test(tag)) {
      blocks.push({ kind: 'heading', level: Number(tag[1]), text });
    } else if (tag === 'li') {
      blocks.push({
        kind: 'bullet',
        ordered: attributes.includes('data-kiln-ordered'),
        depth: Number(/data-kiln-depth="(\d+)"/.exec(attributes)?.[1] ?? 0),
        text: text.replace(/^•\s*/, ''),
      });
    } else if (tag === 'blockquote') {
      blocks.push({ kind: 'quote', text });
    } else if (tag === 'pre') {
      blocks.push({ kind: 'code', text });
    } else {
      blocks.push({ kind: 'paragraph', text });
    }
  }

  losses.stranded = strandedWords(source, consumed);

  return { blocks, warnings: describeLosses(losses) };
}

/**
 * How many words were in the HTML but in none of the blocks.
 *
 * Text inside an element the pattern does not match — a `<div>`, a
 * `<figcaption>`, a definition list, an `<h7>` — used to vanish with nothing
 * said. Reading the gaps between matches catches all of those, and anything
 * else a reader starts emitting later, without a tag list to maintain.
 */
function strandedWords(source: string, consumed: [number, number][]): number {
  let rest = '';
  let cursor = 0;

  for (const [start, end] of consumed) {
    if (start > cursor) rest += source.slice(cursor, start);
    cursor = Math.max(cursor, end);
  }
  rest += source.slice(cursor);

  const text = htmlToPlainText(rest)
    .replace(/[•\s]+/g, ' ')
    .trim();
  return text ? text.split(' ').length : 0;
}

/** One sentence per kind of loss, in the interface's voice. */
function describeLosses(losses: Record<Loss, number>): string[] {
  const out: string[] = [];

  if (losses.span > 0) {
    out.push(
      `${losses.span} table cell${losses.span === 1 ? '' : 's'} spanned more than one row or column. Kiln writes a plain grid, so ${losses.span === 1 ? 'it is' : 'they are'} now ${losses.span === 1 ? 'a single cell' : 'single cells'} and the columns may not line up with the original.`,
    );
  }

  if (losses.stranded > 0) {
    out.push(
      `About ${losses.stranded} word${losses.stranded === 1 ? '' : 's'} sat in a layout element Kiln does not read — a text box, a caption or a frame — and could not be placed.`,
    );
  }

  return out;
}

/**
 * Writes Kiln's block list as a DOCX. Shared by every `* → docx` engine so the
 * styling is identical no matter what the source was.
 *
 * Returns an ArrayBuffer rather than going through `Packer.toBuffer`, which
 * asks JSZip for a Node buffer — unavailable in a browser, where it throws
 * "nodebuffer is not supported by this platform". That failed only in the
 * browser; Node-based tests were perfectly happy.
 */
export async function writeDocx(blocks: Block[], title?: string): Promise<ArrayBuffer> {
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
  } = await import('docx');

  const HEADINGS = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ];

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
        children.push(
          new Paragraph({ text: block.text, heading: HEADINGS[block.level - 1] }),
        );
        break;

      case 'bullet': {
        // Word indents and numbers from the level, so depth is all it needs.
        const level = Math.min(block.depth, MAX_LIST_DEPTH);
        children.push(
          new Paragraph({
            text: block.text,
            bullet: block.ordered ? undefined : { level },
            numbering: block.ordered ? { reference: 'kiln-ordered', level } : undefined,
          }),
        );
        break;
      }

      case 'code':
        for (const line of block.text.split('\n')) {
          children.push(
            new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas' })] }),
          );
        }
        break;

      case 'quote':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.text, italics: true })],
            indent: { left: 480 },
          }),
        );
        break;

      case 'table': {
        const rows = block.rows.filter((r) => r.length > 0);
        if (rows.length === 0) break;
        const width = Math.max(...rows.map((r) => r.length));
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: rows.map(
              (row, rowIndex) =>
                new TableRow({
                  children: Array.from({ length: width }, (_, i) => {
                    const cell = row[i] ?? '';
                    return new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: cell, bold: rowIndex === 0 })],
                        }),
                      ],
                    });
                  }),
                }),
            ),
          }),
        );
        // Word collapses two adjacent tables into one without a separator.
        children.push(new Paragraph({ text: '' }));
        break;
      }

      case 'rule':
        children.push(
          new Paragraph({
            text: '',
            border: { bottom: { style: 'single', size: 6, color: 'CCCCCC' } },
          }),
        );
        break;

      default:
        children.push(new Paragraph({ text: block.text }));
        break;
    }
  }

  if (children.length === 0) {
    fail('There was no text to put in the document.');
  }

  const doc = new Document({
    title,
    numbering: {
      config: [
        {
          reference: 'kiln-ordered',
          // One level per depth Kiln will write. Word restarts a level's count
          // when a shallower item interrupts it, which is the behaviour a
          // nested list needs.
          levels: Array.from({ length: MAX_LIST_DEPTH + 1 }, (_, level) => ({
            level,
            format: 'decimal' as const,
            text: `%${level + 1}.`,
            alignment: 'left' as const,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toArrayBuffer(doc);
}
