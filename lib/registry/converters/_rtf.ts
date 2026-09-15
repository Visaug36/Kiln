import { fail } from '../shared';
import type { Block } from './_md';

/**
 * RTF is handled by hand rather than with a library.
 *
 * Every maintained RTF parser on npm is either a Node-only binding or a wrapper
 * around a native converter, neither of which can run in a browser tab — and
 * shipping a document to a server to read it is the one thing Kiln will not do.
 * RTF's control-word syntax is simple enough to walk directly, and what Kiln
 * needs from it (text, paragraph breaks, heading-ish and emphasis-ish runs) is
 * the part that is genuinely tractable.
 */

interface RtfRun {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Half-points, as RTF stores it. 24 = 12pt. */
  fontSize: number;
}

export interface RtfParagraph {
  runs: RtfRun[];
  text: string;
}

const UNICODE_ESCAPES: Record<string, string> = {
  emdash: '—',
  endash: '–',
  lquote: '‘',
  rquote: '’',
  ldblquote: '“',
  rdblquote: '”',
  bullet: '•',
  tab: '\t',
  line: '\n',
  par: '\n',
  emspace: ' ',
  enspace: ' ',
};

/** Walks RTF control words into paragraphs of styled runs. */
export function parseRtf(source: string): RtfParagraph[] {
  if (!source.startsWith('{\\rtf')) {
    fail('This does not look like an RTF file inside, even though it is named like one.');
  }

  const paragraphs: RtfParagraph[] = [];
  let runs: RtfRun[] = [];
  let text = '';

  const state = { bold: false, italic: false, fontSize: 24 };
  const stack: (typeof state)[] = [];

  // Groups whose contents are metadata, not body text.
  const SKIP_GROUPS =
    /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|footnote|xmlns|themedata|colorschememapping|latentstyles|datastore|generator)$/;
  let skipDepth = -1;
  let depth = 0;

  const pushRun = () => {
    if (text) {
      runs.push({
        text,
        bold: state.bold,
        italic: state.italic,
        fontSize: state.fontSize,
      });
      text = '';
    }
  };

  const endParagraph = () => {
    pushRun();
    const joined = runs
      .map((r) => r.text)
      .join('')
      .trim();
    if (joined) paragraphs.push({ runs, text: joined });
    runs = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (char === '{') {
      depth += 1;
      stack.push({ ...state });
      continue;
    }

    if (char === '}') {
      if (skipDepth === depth) skipDepth = -1;
      depth -= 1;
      const restored = stack.pop();
      if (restored) Object.assign(state, restored);
      continue;
    }

    if (char === '\\') {
      // Escaped literal characters.
      const next = source[i + 1];
      if (next === '\\' || next === '{' || next === '}') {
        if (skipDepth === -1) text += next;
        i += 1;
        continue;
      }

      // \'xx — a byte in the current code page.
      if (next === "'") {
        const hex = source.slice(i + 2, i + 4);
        if (skipDepth === -1) {
          const code = parseInt(hex, 16);
          if (!Number.isNaN(code)) text += String.fromCharCode(code);
        }
        i += 3;
        continue;
      }

      const match = /^\\([a-zA-Z]+)(-?\d+)?\s?/.exec(source.slice(i));
      if (!match) {
        i += 1;
        continue;
      }

      const word = match[1]!;
      const param = match[2] ? Number(match[2]) : undefined;
      i += match[0].length - 1;

      if (SKIP_GROUPS.test(word) && skipDepth === -1) {
        skipDepth = depth;
        continue;
      }
      if (skipDepth !== -1) continue;

      switch (word) {
        case 'par':
        case 'pard':
          if (word === 'par') endParagraph();
          break;
        case 'b':
          pushRun();
          state.bold = param !== 0;
          break;
        case 'i':
          pushRun();
          state.italic = param !== 0;
          break;
        case 'fs':
          pushRun();
          if (param !== undefined) state.fontSize = param;
          break;
        case 'plain':
          pushRun();
          state.bold = false;
          state.italic = false;
          state.fontSize = 24;
          break;
        case 'u': {
          // \uN with a replacement character that follows.
          if (param !== undefined)
            text += String.fromCharCode(param < 0 ? param + 65536 : param);
          break;
        }
        case 'tab':
          text += '\t';
          break;
        default:
          if (word in UNICODE_ESCAPES) text += UNICODE_ESCAPES[word];
          break;
      }
      continue;
    }

    if (skipDepth !== -1) continue;
    if (char === '\r' || char === '\n') continue;

    text += char;
  }

  endParagraph();

  if (paragraphs.length === 0) {
    fail('No text could be read out of this RTF file.');
  }

  return paragraphs;
}

export function rtfToPlainText(source: string): string {
  return parseRtf(source)
    .map((p) => p.text)
    .join('\n\n');
}

/**
 * RTF carries no notion of "heading" — only size and weight. Anything markedly
 * larger than the body, or short and bold, is treated as one. It is a guess,
 * which is why `rtf → md` is declared lossy.
 */
export function rtfToBlocks(source: string): Block[] {
  const paragraphs = parseRtf(source);

  const sizes = paragraphs.map((p) => p.runs[0]?.fontSize ?? 24);
  const body = medianOf(sizes);

  return paragraphs.map((paragraph): Block => {
    const first = paragraph.runs[0];
    const size = first?.fontSize ?? body;
    const allBold = paragraph.runs.length > 0 && paragraph.runs.every((r) => r.bold);
    const short = paragraph.text.length <= 120 && !paragraph.text.endsWith('.');

    if (size >= body * 1.6) return { kind: 'heading', level: 1, text: paragraph.text };
    if (size >= body * 1.3) return { kind: 'heading', level: 2, text: paragraph.text };
    if (allBold && short) return { kind: 'heading', level: 3, text: paragraph.text };

    if (/^\s*[•\-*·]\s+/.test(paragraph.text)) {
      return {
        kind: 'bullet',
        ordered: false,
        text: paragraph.text.replace(/^\s*[•\-*·]\s+/, ''),
      };
    }
    if (/^\s*\d+[.)]\s+/.test(paragraph.text)) {
      return {
        kind: 'bullet',
        ordered: true,
        text: paragraph.text.replace(/^\s*\d+[.)]\s+/, ''),
      };
    }

    return { kind: 'paragraph', text: paragraph.text };
  });
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 24;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 24;
}

/** Escapes a string for inclusion in an RTF document. */
function escapeRtf(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === '\\') out += '\\\\';
    else if (char === '{') out += '\\{';
    else if (char === '}') out += '\\}';
    else if (char === '\t') out += '\\tab ';
    else if (char === '\n') out += '\\par ';
    else if (code > 127) out += `\\u${code}?`;
    else out += char;
  }
  return out;
}

/** Writes Kiln's block list as an RTF document. */
export function writeRtf(blocks: Block[]): string {
  const parts: string[] = [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0',
    '{\\fonttbl{\\f0\\froman Times New Roman;}{\\f1\\fmodern Courier New;}}',
    '\\viewkind4\\uc1\\pard\\f0\\fs24',
  ];

  const HEADING_SIZE = [36, 30, 26, 24, 24, 24];

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading': {
        const size = HEADING_SIZE[block.level - 1] ?? 24;
        parts.push(
          `\\pard\\sa180\\sb180\\b\\fs${size} ${escapeRtf(block.text)}\\b0\\fs24\\par`,
        );
        break;
      }
      case 'bullet':
        parts.push(
          `\\pard\\fi-280\\li560\\sa90 ${block.ordered ? '' : '\\bullet\\tab '}${escapeRtf(block.text)}\\par`,
        );
        break;
      case 'code':
        for (const line of block.text.split('\n')) {
          parts.push(`\\pard\\f1\\fs20 ${escapeRtf(line)}\\par`);
        }
        parts.push('\\pard\\f0\\fs24');
        break;
      case 'quote':
        parts.push(`\\pard\\li560\\sa120\\i ${escapeRtf(block.text)}\\i0\\par`);
        break;
      case 'table':
        for (const row of block.rows) {
          parts.push(`\\pard\\sa60 ${escapeRtf(row.join('\t'))}\\par`);
        }
        break;
      case 'rule':
        parts.push('\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\\pard');
        break;
      default:
        parts.push(`\\pard\\sa120 ${escapeRtf(block.text)}\\par`);
        break;
    }
  }

  parts.push('}');
  return parts.join('\n');
}
