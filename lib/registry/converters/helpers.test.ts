import { describe, expect, it } from 'vitest';
import { htmlToBlocks } from './_docx';
import { MAX_PDF_COLUMNS, blocksToPdfContent, pdfTable } from './_blocks-to-pdf';
import { parseRtf, rtfToBlocks, rtfToPlainText, writeRtf } from './_rtf';
import { blocksToMarkdown } from './_blocks-to-md';
import { pdfLinesToBlocks } from './_pdfread';
import { parseDelimited, sniffDelimiter, toCsv, toPipeTable } from './_sheet';
import { parseMarkdown, stripInline } from './_md';
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
  htmlToBlocks(html).blocks.map((b) => [
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
      { kind: 'bullet', ordered: true, depth: 0, text: 'one' },
      { kind: 'bullet', ordered: true, depth: 0, text: 'two' },
      { kind: 'paragraph', text: 'break' },
      { kind: 'bullet', ordered: true, depth: 0, text: 'again' },
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
    const table = htmlToBlocks(CELLS, { inline }).blocks.find((b) => b.kind === 'table');
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

describe('nested lists in Markdown', () => {
  const itemsOf = async (md: string) =>
    (await parseMarkdown(md)).map((b) => [
      (b as { text?: string }).text,
      (b as { ordered?: boolean }).ordered,
    ]);

  it('splits a nested list out of its parent item', async () => {
    // marked leaves the sublist inside `item.text`, so taking that whole gave
    // one bullet reading "one 1. one-a" — the item merged into its parent and
    // the raw marker came with it. The HTML reader has always split these; the
    // two paths must agree.
    expect(await itemsOf('1. one\n    1. one-a\n2. two\n')).toEqual([
      ['one', true],
      ['one-a', true],
      ['two', true],
    ]);

    expect(await itemsOf('- outer\n    - inner\n- after\n')).toEqual([
      ['outer', false],
      ['inner', false],
      ['after', false],
    ]);
  });

  it('keeps each list’s own kind when they are mixed', async () => {
    expect(await itemsOf('1. one\n    - inner\n2. two\n')).toEqual([
      ['one', true],
      ['inner', false],
      ['two', true],
    ]);
  });

  it('handles nesting more than one deep', async () => {
    expect(await itemsOf('- a\n    - b\n        - c\n- d\n')).toEqual([
      ['a', false],
      ['b', false],
      ['c', false],
      ['d', false],
    ]);
  });

  it('leaves a flat list exactly as it was', async () => {
    expect(await itemsOf('- one\n- two\n')).toEqual([
      ['one', false],
      ['two', false],
    ]);
  });
});

describe('what the block layer admits to losing', () => {
  it('reports a merged cell instead of quietly flattening it', () => {
    // The text survives; the grid does not. Kiln writes a plain table, so the
    // row ends up short and the writer pads it — a phantom empty cell nobody
    // was told about.
    const { blocks, warnings } = htmlToBlocks(
      '<table><tr><td colspan="2">Spans two</td></tr><tr><td>L</td><td>R</td></tr></table>',
    );

    expect((blocks[0] as { rows: string[][] }).rows).toEqual([['Spans two'], ['L', 'R']]);
    expect(warnings.join(' ')).toMatch(
      /1 table cell spanned more than one row or column/,
    );
  });

  it('counts rowspan too, and says how many', () => {
    const { warnings } = htmlToBlocks(
      '<table><tr><td rowspan="2">a</td><td colspan="3">b</td></tr></table>',
    );

    expect(warnings.join(' ')).toMatch(/2 table cells spanned/);
  });

  it('says nothing about an ordinary table', () => {
    expect(htmlToBlocks('<table><tr><td>a</td><td>b</td></tr></table>').warnings).toEqual(
      [],
    );
  });

  it('reports text stranded in an element it does not read', () => {
    // A figure caption, a text box, a definition list — all used to vanish
    // with nothing said, because the block pattern simply never matched them.
    for (const html of [
      '<div>Text inside a div</div>',
      '<figure><img src="x.png"><figcaption>The caption</figcaption></figure>',
      '<dl><dt>Term</dt><dd>Definition</dd></dl>',
      '<h7>Too deep to be a heading</h7>',
    ]) {
      const { blocks, warnings } = htmlToBlocks(html);

      expect(blocks, html).toHaveLength(0);
      expect(warnings.join(' '), html).toMatch(
        /sat in a layout element Kiln does not read/,
      );
    }
  });

  it('is not fooled by the tags around a block it did read', () => {
    // <section>, <ul> and <tbody> wrap content the pattern matches. Only text
    // that reached no block counts as stranded.
    for (const html of [
      '<section><p>In a section</p></section>',
      '<ul><li>one</li><li>two</li></ul>',
      '<table><tbody><tr><td>cell</td></tr></tbody></table>',
      '<blockquote><p>quoted</p></blockquote>',
    ]) {
      expect(htmlToBlocks(html).warnings, html).toEqual([]);
    }
  });

  it('keeps a line break from fusing the words either side of it', () => {
    // `<br>` was stripped with every other tag in the Markdown path, so
    // "first line<br>second line" arrived as "first linesecond line".
    for (const inline of ['text', 'markdown'] as const) {
      const { blocks } = htmlToBlocks('<p>first line<br>second line</p>', { inline });
      expect((blocks[0] as { text: string }).text, inline).toBe(
        'first line\nsecond line',
      );
    }
  });

  it('keeps a table cell on one line', () => {
    // A newline in a cell breaks a pipe table and starts a new paragraph in a
    // Word cell, so a <br> inside one becomes a space.
    const { blocks } = htmlToBlocks('<table><tr><td>one<br>two</td></tr></table>');
    expect((blocks[0] as { rows: string[][] }).rows).toEqual([['one two']]);
  });
});

describe('list depth', () => {
  const shape = (blocks: Block[]) =>
    blocks
      .filter((b) => b.kind === 'bullet')
      .map((b) => [b.depth, b.ordered, b.text] as const);

  const NESTED_MD = '1. one\n    1. one-a\n    2. one-b\n2. two\n';
  const NESTED_HTML =
    '<ol><li>one<ol><li>one-a</li><li>one-b</li></ol></li><li>two</li></ol>';

  it('the two readers record the same depths', async () => {
    // These drifted once already: known-bug #5 was fixed in the HTML reader and
    // left in the Markdown one. They must agree about the same document.
    const fromMarkdown = shape(await parseMarkdown(NESTED_MD));
    const fromHtml = shape(htmlToBlocks(NESTED_HTML).blocks);

    expect(fromMarkdown).toEqual([
      [0, true, 'one'],
      [1, true, 'one-a'],
      [1, true, 'one-b'],
      [0, true, 'two'],
    ]);
    expect(fromHtml).toEqual(fromMarkdown);
  });

  it('numbers each level on its own, resuming the parent afterwards', async () => {
    // The visible bug: 1 / 1 / 2 / 2 used to come out as 1 / 2 / 3 / 4.
    const md = blocksToMarkdown(await parseMarkdown(NESTED_MD));

    expect(md.split('\n')).toEqual(['1. one', '    1. one-a', '    2. one-b', '2. two']);
  });

  it('restarts a list that a paragraph interrupted', async () => {
    const md = blocksToMarkdown(
      await parseMarkdown('1. one\n2. two\n\nbreak\n\n1. fresh\n'),
    );

    expect(md).toMatch(/1\. one\n2\. two/);
    expect(md).toMatch(/break\n\n1\. fresh/);
  });

  it('indents deeper nesting without losing the kind of each list', async () => {
    expect(shape(await parseMarkdown('- a\n    1. b\n        - c\n- d\n'))).toEqual([
      [0, false, 'a'],
      [1, true, 'b'],
      [2, false, 'c'],
      [0, false, 'd'],
    ]);
  });

  it('gives an RTF ordered item the number it used to leave out', () => {
    // `block.ordered ? '' : '\\bullet\\tab '` wrote nothing for a numbered item,
    // so a numbered list arrived as unnumbered paragraphs.
    const rtf = writeRtf([
      { kind: 'bullet', ordered: true, depth: 0, text: 'one' },
      { kind: 'bullet', ordered: true, depth: 1, text: 'one-a' },
      { kind: 'bullet', ordered: true, depth: 0, text: 'two' },
    ]);

    expect(rtf).toContain('1.\\tab one');
    expect(rtf).toContain('1.\\tab one-a');
    expect(rtf).toContain('2.\\tab two');
    // And the deeper item is indented further than its parent.
    expect(rtf).toMatch(/\\li560[^\\]*\\sa90 1\.\\tab one\\par/);
    expect(rtf).toMatch(/\\li1120[^\\]*\\sa90 1\.\\tab one-a\\par/);
  });

  it('numbers a PDF list per level too', () => {
    const { content } = blocksToPdfContent([
      { kind: 'bullet', ordered: true, depth: 0, text: 'one' },
      { kind: 'bullet', ordered: true, depth: 1, text: 'one-a' },
      { kind: 'bullet', ordered: true, depth: 0, text: 'two' },
    ]);
    const markers = content.map((node) => String((node as { text: string }).text));

    expect(markers[0]).toMatch(/^1\./);
    expect(markers[1]).toMatch(/^1\./);
    expect(markers[2]).toMatch(/^2\./);
    // Indented by depth, so the nesting is visible on the page.
    const left = (i: number) => (content[i] as { margin: number[] }).margin[0];
    expect(left(1)).toBeGreaterThan(left(0)!);
    expect(left(2)).toBe(left(0));
  });
});

describe('inferring structure where the format does not record it', () => {
  it('ranks RTF heading sizes instead of measuring fixed ratios', () => {
    // Kiln's own h1 is 18pt against 12pt body — ×1.5, just under the ×1.6 the
    // old rule wanted, so every top-level heading came back as `##`.
    // Enough body text for the median to be the body size, as in any real
    // document — the ranking is relative to it.
    const body = (text: string) => ({ kind: 'paragraph' as const, text });
    const rtf = writeRtf([
      { kind: 'heading', level: 1, text: 'Title' },
      body('Body text goes here and is ordinary.'),
      body('More of the same, at the same size.'),
      { kind: 'heading', level: 2, text: 'Section' },
      body('Another ordinary paragraph follows it.'),
      { kind: 'heading', level: 3, text: 'Subsection' },
      body('And one more to finish.'),
    ]);
    const levels = rtfToBlocks(rtf)
      .filter((b) => b.kind === 'heading')
      .map((b) => [b.level, b.text]);

    expect(levels).toEqual([
      [1, 'Title'],
      [2, 'Section'],
      [3, 'Subsection'],
    ]);
  });

  it('does not promote body text to a heading', () => {
    const rtf = writeRtf([
      { kind: 'paragraph', text: 'One paragraph.' },
      { kind: 'paragraph', text: 'Another paragraph.' },
    ]);
    expect(rtfToBlocks(rtf).every((b) => b.kind === 'paragraph')).toBe(true);
  });

  it('splits PDF paragraphs on the gap, not only on a full stop', () => {
    // Ordinary leading is 1.2–1.5 times the type size; a paragraph break is
    // over 2. Sentence punctuation alone used to decide this, so a paragraph
    // not ending in a full stop ran into the next one.
    const line = (text: string, y: number, size = 11) => ({ text, size, page: 1, y });
    const blocks = pdfLinesToBlocks([
      line('First paragraph with no full stop at the end', 700),
      line('A second paragraph, clearly separate', 674), // gap 26 = 2.4 × size
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true);
  });

  it('keeps a wrapped paragraph in one piece', () => {
    const line = (text: string, y: number) => ({ text, size: 11, page: 1, y });
    const blocks = pdfLinesToBlocks([
      line('A paragraph long enough to wrap, whose first line', 700),
      line('continues onto a second at ordinary leading', 682.5), // gap 17.5
      line('and a third before it ends.', 665),
    ]);

    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { text: string }).text).toContain('continues onto a second');
  });

  it('ranks PDF heading sizes too, so `##` does not become `#`', () => {
    // The same miscalibration as the RTF reader, in its sibling path: ×1.5 put
    // a 17pt heading over 11pt body — Kiln's own `##` — into level 1.
    const line = (text: string, size: number, y: number) => ({ text, size, page: 1, y });
    // Body lines outnumber headings, as in any real document: the body size is
    // the median, so it has to be the commonest size for the ranking to mean
    // anything.
    const blocks = pdfLinesToBlocks([
      line('Annual report', 22, 750),
      line('Ordinary body text here, which wraps', 11, 719),
      line('onto a second line at normal leading.', 11, 701.5),
      line('A section', 17, 660),
      line('More body text below the section head,', 11, 630),
      line('also wrapping onto a second line.', 11, 612.5),
    ]);
    const headings = blocks
      .filter((b) => b.kind === 'heading')
      .map((b) => [b.level, b.text]);

    expect(headings).toEqual([
      [1, 'Annual report'],
      [2, 'A section'],
    ]);
  });

  it('starts a new paragraph on a new page', () => {
    const blocks = pdfLinesToBlocks([
      { text: 'End of page one', size: 11, page: 1, y: 100 },
      { text: 'Start of page two', size: 11, page: 2, y: 700 },
    ]);
    expect(blocks).toHaveLength(2);
  });
});
