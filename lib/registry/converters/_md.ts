import type { Row } from './_sheet';

/** A flattened Markdown document, in the shape the writers need. */
export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string; ordered: boolean; depth: number }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; rows: Row[] }
  | { kind: 'rule' };

/** How deep a list may be indented before further nesting stops helping. */
export const MAX_LIST_DEPTH = 5;

/**
 * Numbers ordered list items per level.
 *
 * `1. one` / `1. one-a` / `2. two` has to come back as 1, 1, 2 — the parent's
 * count resumes after the nested list ends rather than running straight
 * through it, which is what flattening used to produce. Every writer shares
 * this so they cannot number the same document differently.
 */
export function listCounter(): (block: { ordered: boolean; depth: number }) => number {
  const counts: number[] = [];

  return ({ ordered, depth }) => {
    // Coming back out of a nested list ends it: the deeper counts restart.
    counts.length = Math.min(counts.length, depth + 1);
    if (!ordered) return 0;
    counts[depth] = (counts[depth] ?? 0) + 1;
    return counts[depth]!;
  };
}

type Token = {
  type: string;
  depth?: number;
  text?: string;
  raw?: string;
  ordered?: boolean;
  items?: { text: string; tokens?: Token[] }[];
  tokens?: Token[];
  header?: { text: string }[];
  rows?: { text: string }[][];
};

/**
 * Markdown into a flat block list.
 *
 * Recast's writers (DOCX, PDF, PPTX, RTF) all want a linear sequence of typed
 * blocks rather than a tree, so nesting is flattened here once instead of in
 * four places. Inline emphasis is deliberately not modelled: the writers set
 * whole blocks, and carrying inline runs through four formats is a much bigger
 * job than it looks.
 */
export async function parseMarkdown(source: string): Promise<Block[]> {
  const { marked } = await import('marked');
  const tokens = marked.lexer(source) as Token[];
  const blocks: Block[] = [];

  const walk = (list: Token[], depth = 0) => {
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
            // A nested list is a `list` token inside the item. Left in
            // `item.text` it collapses into its parent, carrying its own raw
            // marker: `1. one` + `1. one-a` arrived as one bullet reading
            // "one 1. one-a". The HTML reader splits these; this has to match.
            const nested = (item.tokens ?? []).filter((t) => t.type === 'list');
            const own = nested.length
              ? (item.tokens ?? [])
                  .filter((t) => t.type !== 'list')
                  .map((t) => t.text ?? '')
                  .join(' ')
              : (item.text ?? '');

            blocks.push({
              kind: 'bullet',
              ordered: Boolean(token.ordered),
              depth,
              text: stripInline(own),
            });

            walk(nested, depth + 1);
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
          if (token.tokens) walk(token.tokens, depth);
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

type Rule = [RegExp, (...groups: string[]) => string];

/** Refuses a match whose content is space-padded: `a * b * c` is not emphasis. */
const keep = (whole: string, inner: string) => (/^\s|\s$/.test(inner) ? whole : inner);

/**
 * The inline markers, in the order they are unwrapped.
 *
 * The `**` pattern tolerates a single `*` inside itself, which is what lets
 * `**outer *inner* outer**` come apart instead of leaving a stray pair behind.
 *
 * Written with capture groups rather than lookbehind: iOS Safari only gained
 * lookbehind in 16.4, and an unsupported one is a syntax error that takes the
 * whole chunk down rather than failing a single conversion.
 */
const INLINE_RULES: Rule[] = [
  [/!\[([^\]]*)\]\([^)]*\)/g, (_w, alt) => alt!], // images → alt text
  [/\[([^\]]+)\]\([^)]*\)/g, (_w, label) => label!], // links → label
  [/`([^`]+)`/g, (_w, code) => code!],
  [/~~([\s\S]+?)~~/g, (w, inner) => keep(w!, inner!)],
  [/\*\*\*((?:[^*]|\*(?!\*))+?)\*\*\*/g, (w, inner) => keep(w!, inner!)],
  [/\*\*((?:[^*]|\*(?!\*))+?)\*\*/g, (w, inner) => keep(w!, inner!)],
  [/\*([^*]+?)\*/g, (w, inner) => keep(w!, inner!)],
  // `_` only counts as a marker at a word boundary, so snake_case survives.
  [/(^|[^\w])__([\s\S]+?)__(?!\w)/g, (w, before, inner) => before! + keep(w!, inner!)],
  [/(^|[^\w])_([^_]+?)_(?!\w)/g, (w, before, inner) => before! + keep(w!, inner!)],
];

/**
 * Removes inline Markdown punctuation, leaving the words. Used when writing to
 * a format that will carry the text as plain runs.
 *
 * Repeats until nothing changes: one pass cannot unwrap nesting, and a cell
 * reading `**outer *inner* outer**` in a PDF is the bug this exists to prevent.
 */
function stripMarkers(text: string): string {
  let out = text;
  let previous: string;

  do {
    previous = out;
    for (const [pattern, replace] of INLINE_RULES) {
      out = out.replace(pattern, (...args: unknown[]) =>
        replace(...(args.slice(0, -2) as string[])),
      );
    }
  } while (out !== previous);

  return out;
}

export function stripInline(text: string): string {
  return stripMarkers(text).replace(/\s+/g, ' ').trim();
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
  return stripMarkers(text);
}
