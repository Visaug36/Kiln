import type { Row } from './_sheet';

/** A flattened Markdown document, in the shape the writers need. */
export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string; ordered: boolean }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; rows: Row[] }
  | { kind: 'rule' };

type Token = {
  type: string;
  depth?: number;
  text?: string;
  raw?: string;
  ordered?: boolean;
  items?: { text: string }[];
  tokens?: Token[];
  header?: { text: string }[];
  rows?: { text: string }[][];
};

/**
 * Markdown into a flat block list.
 *
 * Kiln's writers (DOCX, PDF, PPTX, RTF) all want a linear sequence of typed
 * blocks rather than a tree, so nesting is flattened here once instead of in
 * four places. Inline emphasis is deliberately not modelled: the writers set
 * whole blocks, and carrying inline runs through four formats is a much bigger
 * job than it looks.
 */
export async function parseMarkdown(source: string): Promise<Block[]> {
  const { marked } = await import('marked');
  const tokens = marked.lexer(source) as Token[];
  const blocks: Block[] = [];

  const walk = (list: Token[]) => {
    for (const token of list) {
      switch (token.type) {
        case 'heading':
          blocks.push({
            kind: 'heading',
            level: Math.min(token.depth ?? 1, 6),
            text: stripInline(token.text ?? ''),
          });
          break;

        case 'paragraph':
          blocks.push({ kind: 'paragraph', text: stripInline(token.text ?? '') });
          break;

        case 'text':
          if (token.text?.trim()) {
            blocks.push({ kind: 'paragraph', text: stripInline(token.text) });
          }
          break;

        case 'list':
          for (const item of token.items ?? []) {
            blocks.push({
              kind: 'bullet',
              ordered: Boolean(token.ordered),
              text: stripInline(item.text ?? ''),
            });
          }
          break;

        case 'code':
          blocks.push({ kind: 'code', text: token.text ?? '' });
          break;

        case 'blockquote':
          blocks.push({
            kind: 'quote',
            text: stripInline(flattenText(token.tokens ?? [])),
          });
          break;

        case 'table': {
          const header = (token.header ?? []).map((cell) => stripInline(cell.text));
          const body = (token.rows ?? []).map((row) =>
            row.map((cell) => stripInline(cell.text)),
          );
          blocks.push({ kind: 'table', rows: [header, ...body] });
          break;
        }

        case 'hr':
          blocks.push({ kind: 'rule' });
          break;

        case 'space':
          break;

        default:
          if (token.tokens) walk(token.tokens);
          break;
      }
    }
  };

  walk(tokens);
  return blocks;
}

function flattenText(tokens: Token[]): string {
  return tokens
    .map((t) => t.text ?? (t.tokens ? flattenText(t.tokens) : ''))
    .join('\n')
    .trim();
}

/**
 * Removes inline Markdown punctuation, leaving the words. Used when writing to
 * a format that will carry the text as plain runs.
 */
export function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → label
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Markdown to readable plain text. `md → txt` is declared `exact`, which is a
 * claim about the words rather than the punctuation: every character of content
 * survives, only the markers that exist to be rendered are removed.
 */
export function markdownToPlainText(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (/^\s*(\*\s*){3,}$/.test(line) || /^\s*(-\s*){3,}$/.test(line)) {
      out.push('');
      continue;
    }

    let text = line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^(\s*)[-*+]\s+/, '$1• ')
      .replace(/^(\s*)(\d+)\.\s+/, '$1$2. ');

    text = stripInlineKeepingSpacing(text);
    out.push(text);
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Like stripInline, but keeps the line's own leading indentation and spacing. */
function stripInlineKeepingSpacing(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1');
}

/** Escapes text so it survives a round trip back through a Markdown reader. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]#+\-!])/g, '\\$1');
}
