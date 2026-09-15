import { describe, expect, it } from 'vitest';
import { MARKER, bytesOf, fixture, textOf } from '@/test/fixtures';
import { converters, type Format } from '../index';
import { engineFor } from '../engines';
import { MIME } from '../shared';

/** The fixture that stands in for each source format. */
const SOURCE: Record<Format, string> = {
  docx: 'sample.docx',
  xlsx: 'sample.xlsx',
  pptx: 'sample.pptx',
  pdf: 'sample.pdf',
  rtf: 'sample.rtf',
  md: 'sample.md',
  txt: 'sample.txt',
  csv: 'sample.csv',
};

/** Leading bytes each binary output must actually start with. */
const SIGNATURE: Partial<Record<Format, number[]>> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  docx: [0x50, 0x4b, 0x03, 0x04], // PK..
  xlsx: [0x50, 0x4b, 0x03, 0x04],
  pptx: [0x50, 0x4b, 0x03, 0x04],
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

describe('scripts in PDF output', () => {
  /** The text layer of a PDF, as one string. */
  async function pdfText(blob: Blob): Promise<string> {
    const { readPdf } = await import('./_pdfread');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { lines } = await readPdf(new File([bytes], 'read.pdf'));
    return lines.map((line) => line.text).join('\n');
  }

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

  it('names what it could not draw instead of inventing glyphs', async () => {
    const convert = await engineFor('txt', 'pdf')!();
    const result = await convert(
      new File(['Quarterly report\n\nsales in 日本語 and مرحبا'], 'mixed.txt'),
    );

    const notes = result.warnings?.join(' ') ?? '';
    expect(notes).toMatch(/Arabic/);
    expect(notes).toMatch(/Chinese, Japanese or Korean/);
    expect(notes).toMatch(/replaced/);
    // What it does not do is emit something that looks like text.
    const text = await pdfText(result.files[0]!.blob);
    expect(text).toContain('Quarterly report');
    expect(text).not.toContain('日本語');
  });

  it('refuses a document it could only render as replacement characters', async () => {
    const convert = await engineFor('txt', 'pdf')!();

    await expect(
      convert(new File(['日本語のテキストです'], 'all-cjk.txt')),
    ).rejects.toThrow(/Chinese, Japanese or Korean[\s\S]*Markdown or plain text/);
  });

  it('counts only the document, not pdfmake’s own configuration', async () => {
    // The style names and font family in the document definition are Latin. If
    // they counted as content, a page of Japanese would never look unrenderable.
    const convert = await engineFor('md', 'pdf')!();

    await expect(convert(new File(['中文文件'], 'cjk.md'))).rejects.toThrow(
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
