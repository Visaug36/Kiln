import { describeFailure, fail, interop, readArrayBuffer } from '../shared';
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

  return decodeEntities(out.replace(/<[^>]+>/g, ''))
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
 * Tags each `<li>` that belongs to an `<ol>` so list kind survives flattening.
 *
 * Done by walking the tags in order and keeping a stack, rather than matching
 * `<ol>…</ol>`: a non-greedy match ends at the *first* closing tag, which for
 * a nested list is the inner one, so every item after it loses its numbering.
 * A greedy match has the mirror problem across sibling lists.
 */
function markOrderedItems(html: string): string {
  const stack: ('ol' | 'ul')[] = [];

  return html.replace(/<(\/?)(ol|ul|li)\b/gi, (match, closing: string, tag: string) => {
    const name = tag.toLowerCase();

    if (name === 'li') {
      // Only the opening tag carries the marker; `</li data-kiln-ordered>`
      // would be malformed and would confuse the block matcher.
      if (closing) return match;
      return stack[stack.length - 1] === 'ol' ? `${match} data-kiln-ordered` : match;
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
function tableRows(html: string, render: (html: string) => string): Row[] {
  const rows: Row[] = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...(row[1] ?? '').matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(
      (cell) => render(cell[2] ?? ''),
    );
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/**
 * HTML into Kiln's flat block list, used when writing DOCX/PDF/RTF/Markdown.
 *
 * `inline: 'markdown'` keeps emphasis and links as Markdown punctuation, which
 * is what the `* → md` engines want. The other writers set whole blocks and
 * would show the punctuation literally, so they take the plain-text form.
 */
export function htmlToBlocks(
  html: string,
  { inline = 'text' }: { inline?: 'text' | 'markdown' } = {},
): Block[] {
  const render = inline === 'markdown' ? inlineToMarkdown : htmlToPlainText;
  const blocks: Block[] = [];
  const source = markOrderedItems(splitNestedItems(html));

  const pattern =
    /<(h[1-6]|p|li|blockquote|pre|table)\b([^>]*)>([\s\S]*?)<\/\1>|<(hr)\b[^>]*\/?>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (match[4]) {
      blocks.push({ kind: 'rule' });
      continue;
    }

    const tag = (match[1] ?? '').toLowerCase();
    const attributes = match[2] ?? '';
    const body = match[3] ?? '';

    if (tag === 'table') {
      const rows = tableRows(body, render);
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

  return blocks;
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

      case 'bullet':
        children.push(
          new Paragraph({
            text: block.text,
            bullet: block.ordered ? undefined : { level: 0 },
            numbering: block.ordered
              ? { reference: 'kiln-ordered', level: 0 }
              : undefined,
          }),
        );
        break;

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
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'left' }],
        },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toArrayBuffer(doc);
}
