import { beforeEach, describe, expect, it } from 'vitest';
import { MARKER, bytesOf, fixture, textOf } from '@/test/fixtures';
import { fontRequests } from '@/test/setup';
import { converters, type Format } from '../index';
import { engineFor } from '../engines';
import { MIME } from '../shared';

/** The fixture that stands in for each source format. */
const SOURCE: Record<Format, string> = {
  docx: 'sample.docx',
  odt: 'sample.odt',
  xlsx: 'sample.xlsx',
  ods: 'sample.ods',
  pptx: 'sample.pptx',
  odp: 'sample.odp',
  pdf: 'sample.pdf',
  rtf: 'sample.rtf',
  html: 'sample.html',
  epub: 'sample.epub',
  md: 'sample.md',
  txt: 'sample.txt',
  csv: 'sample.csv',
  json: 'sample.json',
};

/** Leading bytes each binary output must actually start with. */
const SIGNATURE: Partial<Record<Format, number[]>> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  docx: [0x50, 0x4b, 0x03, 0x04], // PK..
  xlsx: [0x50, 0x4b, 0x03, 0x04],
  pptx: [0x50, 0x4b, 0x03, 0x04],
  odt: [0x50, 0x4b, 0x03, 0x04],
  ods: [0x50, 0x4b, 0x03, 0x04],
  odp: [0x50, 0x4b, 0x03, 0x04],
  epub: [0x50, 0x4b, 0x03, 0x04],
};

describe('every declared converter', () => {
  for (const converter of converters) {
    const { from, to } = converter;

    describe(`${from} → ${to}`, () => {
      it('produces a non-empty file with the right type and extension', async () => {
        const convert = await engineFor(from, to)!();
        const result = await convert(fixture(SOURCE[from]));

        expect(result.files.length).toBeGreaterThan(0);

        for (const file of result.files) {
          expect(file.blob.size, `${file.filename} is empty`).toBeGreaterThan(0);
          expect(file.blob.type).toBe(MIME[to]);
          expect(file.filename.endsWith(`.${to}`)).toBe(true);
        }
      });

      it('writes real bytes for the target format', async () => {
        const convert = await engineFor(from, to)!();
        const result = await convert(fixture(SOURCE[from]));
        const signature = SIGNATURE[to];

        if (signature) {
          const head = await bytesOf(result.files[0]!.blob);
          expect([...head.slice(0, signature.length)]).toEqual(signature);
        } else {
          // Text formats: assert it decodes and is not whitespace.
          expect((await textOf(result.files[0]!.blob)).trim().length).toBeGreaterThan(0);
        }
      });

      it('fails with a readable sentence on a corrupt file', async () => {
        const convert = await engineFor(from, to)!();
        // Valid ZIP magic, garbage inside — every reader has to cope.
        const broken = fixture('corrupt.docx', `broken.${from}`);

        try {
          await convert(broken);
          // Text readers legitimately accept arbitrary bytes; that is not a bug.
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          expect(message).not.toMatch(/\bat\s+\w+\s*\(/); // no stack frames
          expect(message.length).toBeGreaterThan(20);
          expect(message).toMatch(/[.!?]$/); // a sentence, not a code
        }
      });
    });
  }
});

describe('pairs declared exact', () => {
  it('md → txt keeps every word', async () => {
    const convert = await engineFor('md', 'txt')!();
    const out = await textOf((await convert(fixture('sample.md'))).files[0]!.blob);

    expect(out).toContain(MARKER);
    expect(out).toContain('Kiln test document');
    expect(out).toContain('First item');
    // The markers themselves are what gets removed.
    expect(out).not.toContain('**');
    expect(out).not.toMatch(/^#/m);
  });

  it('txt → md passes the bytes through untouched', async () => {
    const convert = await engineFor('txt', 'md')!();
    const source = fixture('sample.txt');
    const out = await textOf((await convert(source)).files[0]!.blob);

    expect(out).toBe(await source.text());
  });

  it('csv → txt passes the bytes through untouched', async () => {
    const convert = await engineFor('csv', 'txt')!();
    const source = fixture('sample.csv');
    const out = await textOf((await convert(source)).files[0]!.blob);

    expect(out).toBe(await source.text());
  });

  it('csv → xlsx round-trips back to the same rows', async () => {
    const toXlsx = await engineFor('csv', 'xlsx')!();
    const workbook = (await toXlsx(fixture('sample.csv'))).files[0]!;

    const toCsv = await engineFor('xlsx', 'csv')!();
    const back = await toCsv(new File([workbook.blob], 'roundtrip.xlsx'));
    const text = await textOf(back.files[0]!.blob);

    expect(text).toContain('North');
    expect(text).toContain('2400');
    expect(text).toContain(MARKER);
  });
});

describe('content actually survives', () => {
  it('docx → md keeps the words and the heading structure', async () => {
    const convert = await engineFor('docx', 'md')!();
    const out = await textOf((await convert(fixture('sample.docx'))).files[0]!.blob);

    expect(out).toContain(MARKER);
    expect(out).toMatch(/^#\s+Quarterly report/m);
    expect(out).toMatch(/^##\s+Findings/m);
  });

  it('docx → txt keeps the words', async () => {
    const convert = await engineFor('docx', 'txt')!();
    const out = await textOf((await convert(fixture('sample.docx'))).files[0]!.blob);

    expect(out).toContain(MARKER);
    expect(out).toContain('Revenue rose in every region.');
  });

  it('pdf → txt pulls the text layer back out', async () => {
    const convert = await engineFor('pdf', 'txt')!();
    const out = await textOf((await convert(fixture('sample.pdf'))).files[0]!.blob);

    expect(out).toContain(MARKER);
    expect(out).toContain('A printed heading');
  });

  it('rtf → txt keeps the words and drops the control words', async () => {
    const convert = await engineFor('rtf', 'txt')!();
    const out = await textOf((await convert(fixture('sample.rtf'))).files[0]!.blob);

    expect(out).toContain(MARKER);
    expect(out).toContain('Plain paragraph text.');
    expect(out).not.toContain('\\rtf');
    expect(out).not.toContain('fonttbl');
  });

  it('pptx → md gives one heading per slide', async () => {
    const convert = await engineFor('pptx', 'md')!();
    const out = await textOf((await convert(fixture('sample.pptx'))).files[0]!.blob);

    expect(out).toMatch(/^##\s+Opening slide/m);
    expect(out).toMatch(/^##\s+Second slide/m);
    expect(out).toContain('Point one');
  });

  it('pptx → txt keeps slide text in order', async () => {
    const convert = await engineFor('pptx', 'txt')!();
    const out = await textOf((await convert(fixture('sample.pptx'))).files[0]!.blob);

    expect(out.indexOf('Opening slide')).toBeLessThan(out.indexOf('Second slide'));
    expect(out).toContain(MARKER);
  });
});

describe('spreadsheets', () => {
  it('exports computed values, never formula strings', async () => {
    const convert = await engineFor('xlsx', 'csv')!();
    const result = await convert(fixture('sample.xlsx'));
    const text = await textOf(result.files[0]!.blob);

    expect(text).toContain('4000');
    expect(text).not.toContain('SUM(');
    expect(text).not.toContain('=');
  });

  it('returns one file per sheet for a multi-sheet workbook', async () => {
    const convert = await engineFor('xlsx', 'csv')!();
    const result = await convert(fixture('sample.xlsx'));

    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.filename)).toEqual([
      'sample-sales.csv',
      'sample-notes.csv',
    ]);
    expect(result.warnings?.[0]).toMatch(/2 sheets/);
  });

  it('gives a single-sheet workbook a plain name and no sheet warning', async () => {
    const toXlsx = await engineFor('csv', 'xlsx')!();
    const single = (await toXlsx(fixture('sample.csv'))).files[0]!;

    const toCsv = await engineFor('xlsx', 'csv')!();
    const result = await toCsv(new File([single.blob], 'one.xlsx'));

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.filename).toBe('one.csv');
  });

  it('heads each sheet in the Markdown when there is more than one', async () => {
    const convert = await engineFor('xlsx', 'md')!();
    const out = await textOf((await convert(fixture('sample.xlsx'))).files[0]!.blob);

    expect(out).toMatch(/^##\s+Sales/m);
    expect(out).toMatch(/^##\s+Notes/m);
    expect(out).toContain('| Region | Units | Revenue |');
  });

  it('detects a semicolon-separated export and says so', async () => {
    const convert = await engineFor('csv', 'md')!();
    const result = await convert(fixture('semicolons.csv'));
    const out = await textOf(result.files[0]!.blob);

    expect(out).toContain('| Region | Units | Revenue |');
    expect(out).toContain('| North | 120 | 2400 |');
    expect(result.warnings?.join(' ')).toMatch(/not comma-separated/i);
  });
});

describe('refusals a person can act on', () => {
  it('names the old binary .doc rather than complaining about a zip', async () => {
    const convert = await engineFor('docx', 'md')!();

    await expect(convert(fixture('actually-a-doc.docx'))).rejects.toThrow(
      /old binary \.doc file/i,
    );
  });

  it('refuses an empty file by name', async () => {
    const convert = await engineFor('txt', 'docx')!();

    await expect(convert(fixture('empty.txt'))).rejects.toThrow(/empty/i);
  });

  it('explains a damaged archive without leaking library internals', async () => {
    const convert = await engineFor('xlsx', 'csv')!();

    await expect(convert(fixture('corrupt.docx', 'broken.xlsx'))).rejects.toThrow(
      /damaged|could not read/i,
    );
  });

  it('refuses a file over the memory limit before reading it', async () => {
    const convert = await engineFor('txt', 'md')!();
    const huge = new File(['x'], 'huge.txt');
    Object.defineProperty(huge, 'size', { value: 200 * 1024 * 1024 });

    await expect(convert(huge)).rejects.toThrow(/100 MB/);
  });
});

describe('slide notes', () => {
  /** A two-slide deck where only the second slide carries notes. */
  async function deckWithNotesOnSlideTwo(): Promise<File> {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const slide = (title: string) =>
      `<?xml version="1.0"?><p:sld xmlns:a="x"><p:cSld><a:p><a:t>${title}</a:t></a:p></p:cSld></p:sld>`;

    zip.file('[Content_Types].xml', '<Types>presentationml.presentation.main</Types>');
    zip.file('ppt/slides/slide1.xml', slide('First slide'));
    zip.file('ppt/slides/slide2.xml', slide('Second slide'));
    // PowerPoint numbers notes independently: slide 2's notes are notesSlide1.
    zip.file(
      'ppt/notesSlides/notesSlide1.xml',
      '<?xml version="1.0"?><p:notes xmlns:a="x"><a:p><a:t>Notes for slide two</a:t></a:p></p:notes>',
    );
    zip.file(
      'ppt/slides/_rels/slide2.xml.rels',
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
    );

    return new File([await zip.generateAsync({ type: 'arraybuffer' })], 'notes.pptx');
  }

  it('attaches notes to the slide that owns them, not the one with the same number', async () => {
    const { readPptx } = await import('./_pptx');
    const { slides } = await readPptx(await deckWithNotesOnSlideTwo());

    expect(slides[0]?.notes, 'slide one has no notes of its own').toEqual([]);
    expect(slides[1]?.notes).toEqual(['Notes for slide two']);
  });

  it('carries those notes through to Markdown as quotes', async () => {
    const convert = await engineFor('pptx', 'md')!();
    const out = await textOf(
      (await convert(await deckWithNotesOnSlideTwo())).files[0]!.blob,
    );

    expect(out).toMatch(/## Second slide[\s\S]*> Notes for slide two/);
    expect(out).not.toMatch(/## First slide[\s\S]*> Notes for slide two[\s\S]*## Second/);
  });
});

/** The text layer of a PDF, as one string. */
async function pdfText(blob: Blob): Promise<string> {
  const { readPdf } = await import('./_pdfread');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const { lines } = await readPdf(new File([bytes], 'read.pdf'));
  return lines.map((line) => line.text).join('\n');
}

describe('scripts in PDF output', () => {
  it('carries Greek and Cyrillic through unharmed', async () => {
    // With the base-14 Helvetica these came back as "9£±;³·;Ã-<": the glyphs
    // were never embedded, and everything above U+00FF was written as raw
    // UTF-16 code units read back as Latin-1.
    const source = 'Καλημέρα κόσμε\n\nЗдравствуй, мир';
    const convert = await engineFor('txt', 'pdf')!();
    const result = await convert(new File([source], 'scripts.txt'));

    const text = await pdfText(result.files[0]!.blob);
    expect(text).toContain('Καλημέρα κόσμε');
    expect(text).toContain('Здравствуй, мир');
    expect(result.warnings).toBeUndefined();
  });

  it('carries Latin Extended and the punctuation set', async () => {
    const source = 'Łódź Ğüneş čeština — “curly” €100 … ½';
    const convert = await engineFor('md', 'pdf')!();
    const result = await convert(new File([source], 'latin.md'));

    expect(await pdfText(result.files[0]!.blob)).toContain(source);
    expect(result.warnings).toBeUndefined();
  });

  it('draws Vietnamese, which lives in a block that is easy to miss', async () => {
    // Every Vietnamese tone mark is in Latin Extended Additional, and Roboto
    // carries that block in full — U+1EA0 to U+1EF9, all ninety of them. A
    // document in Vietnamese must convert with no warning at all.
    const source = 'Tôi có thể ăn thủy tinh mà không hại gì. Ừ, ữ, ự, ở, ợ, đ.';
    const convert = await engineFor('txt', 'pdf')!();
    const result = await convert(new File([source], 'vi.txt'));

    expect(await pdfText(result.files[0]!.blob)).toContain(source);
    expect(result.warnings).toBeUndefined();
  });

  it('names the gaps inside Latin Extended Additional rather than calling them unusual', async () => {
    // The rest of that block — the dot-below and macron-below letters Yoruba
    // and Sanskrit transliteration use — is only partly there.
    const convert = await engineFor('txt', 'pdf')!();
    const result = await convert(new File(['Yoruba ṣe and Sanskrit ṛṣi'], 'y.txt'));

    expect(result.warnings?.join(' ')).toMatch(/Latin letters with less common accents/);
  });

  it('names what it could not draw instead of inventing glyphs', async () => {
    const convert = await engineFor('txt', 'pdf')!();
    const result = await convert(
      new File(['Quarterly report\n\ngreetings in مرحبا and 한국어'], 'mixed.txt'),
    );

    const notes = result.warnings?.join(' ') ?? '';
    expect(notes).toMatch(/Arabic/);
    expect(notes).toMatch(/Korean/);
    expect(notes).toMatch(/replaced/);
    // What it does not do is emit something that looks like text.
    const text = await pdfText(result.files[0]!.blob);
    expect(text).toContain('Quarterly report');
    expect(text).not.toContain('한국어');
  });

  it('refuses a document it could only render as replacement characters', async () => {
    const convert = await engineFor('txt', 'pdf')!();

    await expect(
      convert(new File(['한국어 텍스트입니다'], 'all-korean.txt')),
    ).rejects.toThrow(/Korean[\s\S]*Markdown or plain text/);
  });

  it('counts only the document, not pdfmake’s own configuration', async () => {
    // The style names and font family in the document definition are Latin. If
    // they counted as content, a page of Korean would never look unrenderable.
    const convert = await engineFor('md', 'pdf')!();

    await expect(convert(new File(['한국어입니다'], 'ko.md'))).rejects.toThrow(
      /cannot draw/,
    );
  });
});

describe('no Markdown punctuation leaks into a table cell', () => {
  const MARKERS = /\*\*|`[^`]|\]\(http/;

  for (const to of ['txt', 'rtf'] as const) {
    it(`docx → ${to} writes the words, not the markers`, async () => {
      const convert = await engineFor('docx', to)!();
      const out = await textOf((await convert(fixture('sample.docx'))).files[0]!.blob);

      expect(out).toContain('Emphasis cell');
      expect(out).toContain('Linked cell');
      expect(out).not.toMatch(MARKERS);
    });
  }

  it('docx → pdf writes the words, not the markers', async () => {
    const { readPdf } = await import('./_pdfread');
    const convert = await engineFor('docx', 'pdf')!();
    const blob = (await convert(fixture('sample.docx'))).files[0]!.blob;
    const { lines } = await readPdf(
      new File([new Uint8Array(await blob.arrayBuffer())], 'r.pdf'),
    );
    const text = lines.map((line) => line.text).join('\n');

    expect(text).toContain('Emphasis cell');
    expect(text).not.toMatch(MARKERS);
  });

  it('docx → md keeps them, because Markdown is the point there', async () => {
    const convert = await engineFor('docx', 'md')!();
    const out = await textOf((await convert(fixture('sample.docx'))).files[0]!.blob);

    expect(out).toContain('| *Emphasis cell* |');
    expect(out).toContain('[Linked cell](https://example.com)');
  });

  it('md → docx puts the words in the cells', async () => {
    const source =
      '| **bold** | *italic* |\n| --- | --- |\n| `code()` | [l](https://x) |';
    const convert = await engineFor('md', 'docx')!();
    const blob = (await convert(new File([source], 'table.md'))).files[0]!.blob;

    const { readDocx } = await import('./_docx');
    const { html } = await readDocx(
      new File([new Uint8Array(await blob.arrayBuffer())], 'r.docx'),
    );

    expect(html).toContain('code()');
    expect(html).not.toContain('**');
    expect(html).not.toContain('`');
  });
});

describe('wide tables', () => {
  it('md → pdf says when a table lost columns', async () => {
    const header = Array.from({ length: 15 }, (_, i) => `c${i}`).join(' | ');
    const rule = Array.from({ length: 15 }, () => '---').join(' | ');
    const convert = await engineFor('md', 'pdf')!();
    const result = await convert(
      new File([`| ${header} |\n| ${rule} |\n| ${header} |`], 'wide.md'),
    );

    expect(result.warnings?.join(' ')).toMatch(/wider than 12 columns/);
  });

  it('md → pdf stays quiet when the table fits', async () => {
    const convert = await engineFor('md', 'pdf')!();
    const result = await convert(
      new File(['| a | b |\n| --- | --- |\n| 1 | 2 |'], 'n.md'),
    );

    expect(result.warnings).toBeUndefined();
  });

  it('xlsx → pdf still says when a sheet lost columns', async () => {
    const wide = [Array.from({ length: 20 }, (_, i) => `h${i}`).join(',')].join('\n');
    const toXlsx = await engineFor('csv', 'xlsx')!();
    const book = (await toXlsx(new File([wide], 'wide.csv'))).files[0]!;

    const convert = await engineFor('xlsx', 'pdf')!();
    const result = await convert(new File([book.blob], 'wide.xlsx'));

    expect(result.warnings?.join(' ')).toMatch(/Sheets wider than 12 columns/);
  });
});

describe('pictures in a Word document', () => {
  /** A .docx with one paragraph of text and one inline image. */
  async function withImage(text: string): Promise<File> {
    const { Document, Packer, Paragraph, ImageRun } = await import('docx');
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      ),
      (c) => c.charCodeAt(0),
    );

    const children = [
      new Paragraph({
        children: [
          new ImageRun({
            type: 'png',
            data: png,
            transformation: { width: 40, height: 40 },
          }),
        ],
      }),
    ];
    if (text) children.unshift(new Paragraph({ text }));

    const doc = new Document({ sections: [{ children }] });
    return new File([await Packer.toArrayBuffer(doc)], 'pictures.docx');
  }

  it('says an image was dropped instead of losing it in silence', async () => {
    // The warning used to be keyed off a mammoth message that mammoth never
    // sends — it inlines a picture as a data URI and says nothing — so every
    // writer stripped the tag and nobody was told.
    const convert = await engineFor('docx', 'md')!();
    const result = await convert(await withImage('Some words here.'));

    expect(result.warnings?.join(' ')).toMatch(/1 image .* not carried over/);
  });

  it('refuses a document that is nothing but pictures', async () => {
    // Converting it "successfully" hands back an empty file.
    for (const to of ['md', 'txt'] as const) {
      const convert = await engineFor('docx', to)!();
      await expect(convert(await withImage(''))).rejects.toThrow(/no text in it/i);
    }
  });
});

describe('CJK in PDF output', () => {
  beforeEach(async () => {
    // Each test decides for itself whether a face gets fetched.
    (await import('./_cjk')).resetFaces();
  });

  it('draws Japanese rather than refusing it', async () => {
    // Before there was a face to load, this document was refused outright: the
    // person whose document is in Japanese got a sentence and no file.
    const source = '日本語のテキストです。ひらがな、カタカナ、漢字。';
    const convert = await engineFor('md', 'pdf')!();
    const result = await convert(new File([source], 'jp.md'));

    expect(await pdfText(result.files[0]!.blob)).toContain(source);
    expect(result.warnings).toBeUndefined();
    expect(fontRequests).toEqual(['NotoSansJP.ttf']);
  });

  it('draws Simplified Chinese, and asks for the other face', async () => {
    const source = '这是简体中文文本。';
    const convert = await engineFor('md', 'pdf')!();
    const result = await convert(new File([source], 'sc.md'));

    expect(await pdfText(result.files[0]!.blob)).toContain(source);
    expect(fontRequests).toEqual(['NotoSansSC.ttf']);
  });

  it('keeps Latin, Greek and Cyrillic beside the CJK', async () => {
    // A CJK face carries Latin but no Greek or Cyrillic, and Roboto carries
    // those but no CJK. Switching the whole document to one font would lose
    // whatever the other one had, so the text is split into runs per font.
    const source = '日本語 and Καλημέρα and Здравствуй and Łódź';
    const convert = await engineFor('md', 'pdf')!();
    const result = await convert(new File([source], 'mixed.md'));

    expect(await pdfText(result.files[0]!.blob)).toContain(source);
    expect(result.warnings).toBeUndefined();
  });

  it('fetches nothing at all for a document with no CJK in it', async () => {
    const convert = await engineFor('md', 'pdf')!();
    await convert(new File(['Just English, and Καλημέρα.'], 'plain.md'));

    expect(fontRequests, 'a Latin document paid for a 2 MB font').toEqual([]);
  });

  it('asks for one face per session, not per conversion', async () => {
    const convert = await engineFor('md', 'pdf')!();
    await convert(new File(['ひらがな'], 'a.md'));
    await convert(new File(['もっとひらがな'], 'b.md'));

    expect(fontRequests).toEqual(['NotoSansJP.ttf']);
  });

  it('falls back to the Chinese face for Han with no kana to go on', async () => {
    // 日本語 is three kanji and no kana, so nothing in it says Japanese. Both
    // faces carry the shared Han characters, so it renders either way — but
    // the glyph shapes are the Chinese ones. Recorded rather than guessed at.
    const convert = await engineFor('md', 'pdf')!();
    const result = await convert(new File(['日本語'], 'ambiguous.md'));

    expect(fontRequests).toEqual(['NotoSansSC.ttf']);
    expect(await pdfText(result.files[0]!.blob)).toContain('日本語');
  });

  it('still refuses Korean, and says Korean', async () => {
    // Neither face carries a single hangul syllable, so this is honest — and
    // it must not claim Kiln cannot draw Chinese or Japanese any more.
    const convert = await engineFor('md', 'pdf')!();

    await expect(convert(new File(['한국어 텍스트입니다'], 'ko.md'))).rejects.toThrow(
      /written in Korean, which Kiln cannot draw/,
    );
  });
});

describe('choosing a CJK face', () => {
  it('reads coverage out of the font rather than a table that could drift', async () => {
    const { readCmap } = await import('./_cjk');
    const { readFileSync } = await import('node:fs');
    const bytes = readFileSync('public/fonts/NotoSansJP.ttf');
    const covers = readCmap(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );

    for (const character of '日本語のテキストABC') {
      expect(covers.has(character.codePointAt(0)!), character).toBe(true);
    }
    // And it is a real subset, not "everything".
    expect(covers.has('한'.codePointAt(0)!)).toBe(false);
    expect(covers.has('Κ'.codePointAt(0)!)).toBe(false);
  });

  it('picks Japanese only when there is kana', async () => {
    const { variantFor } = await import('./_cjk');
    const points = (text: string) => [...text].map((c) => c.codePointAt(0)!);

    expect(variantFor(points('ひらがな漢字'))).toBe('jp');
    expect(variantFor(points('カタカナ'))).toBe('jp');
    expect(variantFor(points('简体中文'))).toBe('sc');
    expect(variantFor(points('漢字だけ'))).toBe('jp');
    expect(variantFor(points('中文文本'))).toBe('sc');
  });
});

describe('OpenDocument text', () => {
  it('carries headings, emphasis, links, nested lists and a table', async () => {
    const convert = await engineFor('odt', 'md')!();
    const result = await convert(fixture('sample.odt'));
    const md = await textOf(result.files[0]!.blob);

    expect(md).toContain('# Field notes');
    expect(md).toContain('## Observations');
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
    expect(md).toContain('[a link](https://example.com)');
    // Depth survives, and the list continues after the nested one.
    expect(md).toContain('- Second item\n    - Nested item\n- Third item');
    expect(md).toContain('1. Step one\n2. Step two');
    expect(md).toContain('| Region | Units | Revenue |');
    // A `<br>` is not nothing: the words either side must not fuse.
    expect(md).toContain('A line\nbroken in two.');
  });

  it('says what it left behind rather than dropping it quietly', async () => {
    const convert = await engineFor('odt', 'md')!();
    const warnings = (await convert(fixture('sample.odt'))).warnings ?? [];
    const joined = warnings.join(' ');

    expect(joined).toContain('An image was not carried over');
    expect(joined).toContain('One footnote or endnote was');
    // The sibling of the DOCX merged-cell warning, on the same layer.
    expect(joined).toContain('spanned more than one row or column');
  });

  it('carries a text box’s words instead of losing them with the frame', async () => {
    const convert = await engineFor('odt', 'md')!();
    const md = await textOf((await convert(fixture('sample.odt'))).files[0]!.blob);
    expect(md).toContain('Text inside a floating frame.');
  });

  it('writes a package whose mimetype is stored first, as ODF requires', async () => {
    const convert = await engineFor('md', 'odt')!();
    const out = (await convert(fixture('sample.md'))).files[0]!;
    const bytes = await bytesOf(out.blob);

    // The local file header names the first entry; ODF pins it to `mimetype`
    // so a reader can identify the package without unzipping it, which is what
    // Kiln's own detection relies on.
    const head = new TextDecoder().decode(bytes.subarray(0, 128));
    expect(head).toContain('mimetype');
    expect(head).toContain('application/vnd.oasis.opendocument.text');

    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toContain('META-INF/manifest.xml');
    expect(Object.keys(zip.files)).toContain('content.xml');
    expect(await zip.file('content.xml')!.async('string')).toContain('<office:text>');
  });
});

describe('EPUB', () => {
  it('reads chapters in spine order, not the order they are stored', async () => {
    // The fixture stores chapter two first, names them so that alphabetical
    // order is a third order again, and only the spine says which is which.
    // Every chapter reads perfectly whichever way they come out.
    const convert = await engineFor('epub', 'md')!();
    const md = await textOf((await convert(fixture('sample.epub'))).files[0]!.blob);

    const at = (title: string) => md.indexOf(title);
    expect(at('Chapter one')).toBeGreaterThanOrEqual(0);
    expect(at('Chapter one')).toBeLessThan(at('Chapter two'));
    expect(at('Chapter two')).toBeLessThan(at('Chapter three'));
    expect(md).toContain(MARKER);
  });

  it('leaves the navigation document out of the text', async () => {
    const convert = await engineFor('epub', 'md')!();
    const md = await textOf((await convert(fixture('sample.epub'))).files[0]!.blob);
    // The nav lists the chapters; carried through it would read as a duplicate
    // heading list before the book started.
    expect(md).not.toContain('Contents');
    expect((md.match(/Chapter one/g) ?? []).length).toBe(1);
  });

  it('writes a book with every part EPUB 3 requires', async () => {
    const convert = await engineFor('md', 'epub')!();
    const out = (await convert(fixture('sample.md'))).files[0]!;
    const bytes = await bytesOf(out.blob);

    expect(new TextDecoder().decode(bytes.subarray(0, 128))).toContain(
      'application/epub+zip',
    );

    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);

    expect(names).toContain('META-INF/container.xml');
    const root = /full-path="([^"]+)"/.exec(
      await zip.file('META-INF/container.xml')!.async('string'),
    )?.[1];
    expect(root).toBeDefined();
    expect(names).toContain(root!);

    const opf = await zip.file(root!)!.async('string');
    expect(opf).toContain('<dc:identifier id="bookid">');
    expect(opf).toContain('<dc:title>');
    expect(opf).toContain('<dc:language>');
    expect(opf).toContain('properties="nav"');

    // Every spine entry resolves to a file that is actually in the archive.
    const manifest = new Map(
      [...opf.matchAll(/<item\b([^>]*)\/?>/g)].map((m) => [
        /\bid="([^"]+)"/.exec(m[1] ?? '')?.[1] ?? '',
        /\bhref="([^"]+)"/.exec(m[1] ?? '')?.[1] ?? '',
      ]),
    );
    const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => m[1]!);

    expect(spine.length).toBeGreaterThan(0);
    for (const id of spine) {
      expect(manifest.get(id), `spine entry ${id} is not in the manifest`).toBeDefined();
      expect(names).toContain(`OEBPS/${manifest.get(id)}`);
    }
  });

  it('gives the same bytes for the same document twice', async () => {
    // Nothing in a written book is allowed to come from a clock or a random
    // source: converting the same file twice should give the same file.
    const convert = await engineFor('md', 'epub')!();
    const first = await bytesOf((await convert(fixture('sample.md'))).files[0]!.blob);
    const second = await bytesOf((await convert(fixture('sample.md'))).files[0]!.blob);
    expect([...first]).toEqual([...second]);
  });

  it('keeps text that comes before the first heading', async () => {
    const { parseMarkdown } = await import('./_md');
    const { toChapters } = await import('./_epub');
    const chapters = toChapters(
      await parseMarkdown('An opening line.\n\n# First heading\n\nBody.\n'),
      'Untitled',
    );

    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.blocks[0]).toMatchObject({ text: 'An opening line.' });
  });
});

describe('OpenDocument presentations', () => {
  it('takes the declared title frame, wherever it sits in the file', async () => {
    // The fixture's second slide writes its body frame before its title frame.
    // "Whatever came first" would swap the title and the first bullet, which
    // reads perfectly plausibly and is wrong.
    const convert = await engineFor('odp', 'md')!();
    const md = await textOf((await convert(fixture('sample.odp'))).files[0]!.blob);

    expect(md).toContain('## Second slide');
    expect(md).toContain('- Point one');
    expect(md.indexOf('## Opening slide')).toBeLessThan(md.indexOf('## Second slide'));
  });

  it('keeps a speaker note out of the slide body', async () => {
    const convert = await engineFor('odp', 'txt')!();
    const text = await textOf((await convert(fixture('sample.odp'))).files[0]!.blob);

    expect(text).toContain('Notes:\nA speaker note.');
    expect(text.indexOf('A speaker note.')).toBeGreaterThan(text.indexOf('Point two'));
  });

  it('renders a deck the same way PPTX does', async () => {
    // The two deck readers differ; everything after them is shared, and this is
    // what keeps it that way.
    const { slidesToMarkdown } = await import('./_slides');
    const slides = [
      { index: 1, title: 'One', body: ['a', 'b'], notes: ['n'] },
      { index: 2, title: '', body: [], notes: [] },
    ];
    expect(slidesToMarkdown(slides)).toContain('## One');
    expect(slidesToMarkdown(slides)).toContain('## Slide 2');
  });
});

describe('JSON and the sheet model', () => {
  it('turns records into rows with the keys as a header', async () => {
    const convert = await engineFor('json', 'xlsx')!();
    const out = (await convert(fixture('sample.json'))).files[0]!;

    const back = await engineFor('xlsx', 'md')!();
    const md = await textOf(
      (await back(new File([await out.blob.arrayBuffer()], 'x.xlsx'))).files[0]!.blob,
    );

    expect(md).toContain('| region | units | revenue |');
    expect(md).toContain('| North | 120 | 2400 |');
  });

  it('flattens a nested object to dotted keys, and says so', async () => {
    const convert = await engineFor('json', 'xlsx')!();
    const result = await convert(fixture('sample.json'));
    const back = await engineFor('xlsx', 'md')!();
    const md = await textOf(
      (await back(new File([await result.files[0]!.blob.arrayBuffer()], 'x.xlsx')))
        .files[0]!.blob,
    );

    expect(md).toContain('lead.name');
    expect(md).toContain('lead.office');
    expect(result.warnings?.join(' ')).toContain('dotted names');
  });

  it('keeps a column that only appears in a later record', async () => {
    const { jsonToSheets } = await import('./_json');
    const sheets = jsonToSheets('[{"a":1},{"a":2,"b":3}]');
    expect(sheets[0]!.rows[0]).toEqual(['a', 'b']);
    expect(sheets[0]!.rows[2]).toEqual(['2', '3']);
  });

  it('writes an array for one sheet and an object for several', async () => {
    const { sheetsToJson } = await import('./_json');

    expect(JSON.parse(sheetsToJson([{ name: 'S', rows: [['a'], ['1']] }]))).toEqual([
      { a: '1' },
    ]);
    expect(
      JSON.parse(
        sheetsToJson([
          { name: 'One', rows: [['a'], ['1']] },
          { name: 'Two', rows: [['b'], ['2']] },
        ]),
      ),
    ).toEqual({ One: [{ a: '1' }], Two: [{ b: '2' }] });
  });

  it('survives a workbook round trip', async () => {
    const { jsonToSheets, sheetsToJson } = await import('./_json');
    const sheets = [
      {
        name: 'One',
        rows: [
          ['a', 'b'],
          ['1', '2'],
        ],
      },
      { name: 'Two', rows: [['c'], ['3']] },
    ];
    expect(jsonToSheets(sheetsToJson(sheets))).toEqual(sheets);
  });

  it('refuses JSON that is not tabular, in a sentence', async () => {
    const { jsonToSheets } = await import('./_json');
    expect(() => jsonToSheets('42')).toThrow(/list of records/);
    expect(() => jsonToSheets('nonsense')).toThrow(/not valid JSON/);
    expect(() => jsonToSheets('[]')).toThrow(/empty list/);
  });
});

describe('HTML', () => {
  it('carries structure out of a real page and drops the chrome', async () => {
    const convert = await engineFor('html', 'md')!();
    const md = await textOf((await convert(fixture('sample.html'))).files[0]!.blob);

    expect(md).toContain('# Quarterly report');
    expect(md).toContain('**every**');
    expect(md).toContain('[the note](https://example.com)');
    expect(md).toContain('- Second bullet\n    - Nested bullet');
    expect(md).toContain('| Region | Units |');
    expect(md).toContain('Loose text in a div.');
    expect(md).not.toContain('console.log');
    expect(md).not.toContain('font-family');
  });

  it('is the one target that keeps inline emphasis and links', async () => {
    const convert = await engineFor('md', 'html')!();
    const html = await textOf((await convert(fixture('sample.md'))).files[0]!.blob);

    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>sample</title>');
  });
});
