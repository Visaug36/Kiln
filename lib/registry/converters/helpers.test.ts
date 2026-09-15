import { describe, expect, it } from 'vitest';
import { htmlToBlocks } from './_docx';
import { MAX_PDF_COLUMNS, blocksToPdfContent, pdfTable } from './_blocks-to-pdf';
import { parseRtf, rtfToPlainText, writeRtf } from './_rtf';
import { blocksToMarkdown } from './_blocks-to-md';
import { parseDelimited, sniffDelimiter, toCsv, toPipeTable } from './_sheet';
import { stripInline } from './_md';
import type { Block } from './_md';
import { KilnError, describeFailure } from '../shared';

/**
 * Regression tests for the parsing helpers.
 *
 * Every case here failed at some point. They are the fiddly, format-specific
 * rules that are easy to get subtly wrong and impossible to notice from the
 * outside — a stray character, a bullet in the wrong list, a note on the wrong
 * slide — so they are pinned individually rather than only through a whole
 * conversion.
 */

const listOf = (html: string) =>
  htmlToBlocks(html).map((b) => [
    (b as { text?: string }).text,
    (b as { ordered?: boolean }).ordered,
  ]);

describe('RTF unicode escapes', () => {
  it('consumes the fallback character after \\u', () => {
    // Without this, an escaped euro reads back with a stray "?" after it.
    expect(rtfToPlainText('{\\rtf1\\ansi Price: \\u8364?100\\par}')).toBe('Price: €100');
  });

  it('honours \\uc0, where no fallback character follows', () => {
    expect(rtfToPlainText('{\\rtf1\\ansi\\uc0 X\\u8364 Y\\par}')).toBe('X€Y');
  });

  it('honours \\uc2, where two fallback characters follow', () => {
    expect(rtfToPlainText('{\\rtf1\\ansi\\uc2 A\\u8364??B\\par}')).toBe('A€B');
  });

  it('treats an escaped fallback as one character', () => {
    expect(rtfToPlainText("{\\rtf1\\ansi A\\u8364\\'3f B\\par}")).toBe('A€ B');
  });
});

describe('writing RTF', () => {
  it('splits astral characters into the surrogate pair RTF expects', () => {
    // \u carries a signed 16-bit value, so an emoji cannot be one escape.
    const rtf = writeRtf([{ kind: 'paragraph', text: 'emoji 😀 é' }]);

    expect(rtf).toContain('\\u-10179?');
    expect(rtf).toContain('\\u-8704?');
    expect(rtf).not.toMatch(/\\u1\d{5}/); // never an out-of-range value
  });

  it('round-trips an astral character back through the reader', () => {
    const rtf = writeRtf([{ kind: 'paragraph', text: 'emoji 😀 é' }]);
    expect(rtfToPlainText(rtf)).toBe('emoji 😀 é');
  });

  it('still reads an ordinary document', () => {
    const paragraphs = parseRtf(
      '{\\rtf1\\ansi\\fs36\\b Head\\b0\\fs24\\par\\pard Body text.\\par}',
    );
    expect(paragraphs.map((p) => p.text)).toEqual(['Head', 'Body text.']);
  });
});

describe('HTML lists', () => {
  it('keeps a nested item separate from its parent', () => {
    // Word writes <li>outer<ul><li>inner</li></ul></li>; a naive match makes
    // that one bullet reading "outer• inner".
    expect(listOf('<ul><li>outer<ul><li>inner</li></ul></li></ul>')).toEqual([
      ['outer', false],
      ['inner', false],
    ]);
  });

  it('numbers every item of an ordered list, including after a nested one', () => {
    expect(listOf('<ol><li>one<ol><li>one-a</li></ol></li><li>two</li></ol>')).toEqual([
      ['one', true],
      ['one-a', true],
      ['two', true],
    ]);
  });

  it('tells sibling lists apart in both orders', () => {
    expect(listOf('<ol><li>o</li></ol><ul><li>u</li></ul>')).toEqual([
      ['o', true],
      ['u', false],
    ]);
    expect(listOf('<ul><li>u</li></ul><ol><li>o</li></ol>')).toEqual([
      ['u', false],
      ['o', true],
    ]);
  });

  it('handles an unordered list nested inside an ordered one', () => {
    expect(listOf('<ol><li>o<ul><li>u</li></ul></li></ol>')).toEqual([
      ['o', true],
      ['u', false],
    ]);
  });

  it('tolerates a stray closing tag rather than mangling what follows', () => {
    expect(listOf('</ol><ul><li>u</li></ul>')).toEqual([['u', false]]);
  });
});

describe('Markdown from blocks', () => {
  it('restarts numbering when a list is interrupted', () => {
    const blocks: Block[] = [
      { kind: 'bullet', ordered: true, text: 'one' },
      { kind: 'bullet', ordered: true, text: 'two' },
      { kind: 'paragraph', text: 'break' },
      { kind: 'bullet', ordered: true, text: 'again' },
    ];
    const md = blocksToMarkdown(blocks);

    expect(md).toContain('1. one');
    expect(md).toContain('2. two');
    expect(md).toMatch(/break\n\n1\. again/);
  });
});

describe('delimited text', () => {
  it('finds the real separator despite commas inside quoted fields', () => {
    expect(sniffDelimiter('a;"x,y,z,w,v";c\n1;"p,q,r,s,t";3')).toBe(';');
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(sniffDelimiter('alpha\nbeta')).toBe(',');
  });

  it('round-trips quotes, commas and newlines inside cells', () => {
    const rows = [
      ['a', 'b"q'],
      ['line\nbreak', 'comma,here'],
    ];
    expect(parseDelimited(toCsv(rows), ',')).toEqual(rows);
  });

  it('pads ragged rows and escapes a pipe inside a cell', () => {
    expect(toPipeTable([['a', 'b', 'c'], ['1']]).split('\n')[2]).toBe('| 1 |  |  |');
    expect(toPipeTable([['a|b'], ['c']]).split('\n')[0]).toBe('| a\\|b |');
  });
});

describe('turning library errors into sentences', () => {
  const cases: [string, unknown, RegExp][] = [
    [
      'pdfjs password',
      new Error('PasswordException: No password given'),
      /password-protected/i,
    ],
    ['encrypted docx', new Error('File is encrypted'), /password-protected/i],
    ['jszip corrupt', new Error("Can't find end of central directory"), /damaged/i],
    ['bad pdf header', new Error('Invalid PDF structure'), /does not look like a PDF/i],
    ['unknown', new Error('ENOTAWHATSIT 42'), /could not read this file/i],
    ['a thrown string', 'just a string', /could not read this file/i],
  ];

  for (const [label, cause, expected] of cases) {
    it(`${label} becomes something a person can act on`, () => {
      const message = describeFailure(cause, 'docx');

      expect(message).toMatch(expected);
      // Never a stack frame, a code, or a bare object.
      expect(message).not.toMatch(/\bat\s+\w+\s*\(|\[object|undefined/);
      expect(message).toMatch(/[.!?]$/);
    });
  }

  it('passes a KilnError through untouched, since it is already a sentence', () => {
    const own = new KilnError('This PDF has no text in it.');
    expect(describeFailure(own, 'pdf')).toBe('This PDF has no text in it.');
  });
});

describe('inline markers', () => {
  it('unwraps emphasis nested inside emphasis', () => {
    // A single pass leaves `*outer inner outer*` behind, and that stray pair is
    // what reached PDF and DOCX table cells.
    expect(stripInline('**outer *inner* outer**')).toBe('outer inner outer');
    expect(stripInline('***all three***')).toBe('all three');
    expect(stripInline('**bold with `code` inside**')).toBe('bold with code inside');
    expect(stripInline('**[a link](https://x)**')).toBe('a link');
  });

  it('leaves an asterisk that is not emphasis alone', () => {
    expect(stripInline('a * b * c')).toBe('a * b * c');
    expect(stripInline('5*6 = 30')).toBe('5*6 = 30');
    expect(stripInline('**unclosed')).toBe('**unclosed');
  });

  it('treats underscores as markers only at a word boundary', () => {
    expect(stripInline('_single underscore_')).toBe('single underscore');
    expect(stripInline('__both__')).toBe('both');
    expect(stripInline('snake_case_name survives')).toBe('snake_case_name survives');
  });

  it('handles the ordinary constructs', () => {
    expect(stripInline('**b** *i* `c` [l](https://x) ~~s~~')).toBe('b i c l s');
    expect(stripInline('![alt](pic.png)')).toBe('alt');
  });
});

describe('table cells take the caller’s formatter', () => {
  const CELLS =
    '<table><tr><th><strong>Head</strong></th><th>plain</th></tr>' +
    '<tr><td><em>emphasis</em></td><td><code>code()</code></td></tr>' +
    '<tr><td><a href="https://example.com">label</a></td>' +
    '<td><strong>outer <em>inner</em> outer</strong></td></tr></table>';

  const rowsFor = (inline: 'text' | 'markdown') => {
    const table = htmlToBlocks(CELLS, { inline }).find((b) => b.kind === 'table');
    return (table as { rows: string[][] }).rows.flat();
  };

  it('gives plain text to the writers that set whole blocks', () => {
    // tableRows used to call inlineToMarkdown whatever the caller asked for, so
    // `**Head**` reached every PDF, RTF and plain-text conversion while the
    // paragraphs beside it came out clean.
    expect(rowsFor('text')).toEqual([
      'Head',
      'plain',
      'emphasis',
      'code()',
      'label',
      'outer inner outer',
    ]);
  });

  it('still gives Markdown to the engines that asked for it', () => {
    expect(rowsFor('markdown')).toEqual([
      '**Head**',
      'plain',
      '*emphasis*',
      '`code()`',
      '[label](https://example.com)',
      '**outer *inner* outer**',
    ]);
  });
});

describe('tables too wide for the page', () => {
  const wide = (columns: number): Block[] => [
    { kind: 'table', rows: [Array.from({ length: columns }, (_, i) => `c${i}`)] },
  ];

  it('says so rather than dropping columns in silence', () => {
    const { warnings } = blocksToPdfContent(wide(MAX_PDF_COLUMNS + 1));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(new RegExp(`wider than ${MAX_PDF_COLUMNS} columns`));
  });

  it('stays quiet when everything fits', () => {
    expect(blocksToPdfContent(wide(MAX_PDF_COLUMNS)).warnings).toEqual([]);
  });

  it('keeps the columns it can hold', () => {
    const table = pdfTable([Array.from({ length: 20 }, (_, i) => `c${i}`)]) as {
      table: { body: unknown[][] };
    };
    expect(table.table.body[0]).toHaveLength(MAX_PDF_COLUMNS);
  });
});
