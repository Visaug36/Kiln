import { describe, expect, it } from 'vitest';
import { MARKER, bytesOf, fixture, textOf } from '@/test/fixtures';
import { converters, find, type Format } from '../index';
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
        const convert = await converter.load();
        const result = await convert(fixture(SOURCE[from]));

        expect(result.files.length).toBeGreaterThan(0);

        for (const file of result.files) {
          expect(file.blob.size, `${file.filename} is empty`).toBeGreaterThan(0);
          expect(file.blob.type).toBe(MIME[to]);
          expect(file.filename.endsWith(`.${to}`)).toBe(true);
        }
      });

      it('writes real bytes for the target format', async () => {
        const convert = await converter.load();
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
        const convert = await converter.load();
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
    const convert = await find('md', 'txt')!.load();
    const out = await textOf((await convert(fixture('sample.md'))).files[0]!.blob);

    expect(out).toContain(MARKER);
    expect(out).toContain('Kiln test document');
    expect(out).toContain('First item');
    // The markers themselves are what gets removed.
    expect(out).not.toContain('**');
    expect(out).not.toMatch(/^#/m);
  });

  it('txt → md passes the bytes through untouched', async () => {
    const convert = await find('txt', 'md')!.load();
    const source = fixture('sample.txt');
    const out = await textOf((await convert(source)).files[0]!.blob);

    expect(out).toBe(await source.text());
  });

  it('csv → txt passes the bytes through untouched', async () => {
    const convert = await find('csv', 'txt')!.load();
    const source = fixture('sample.csv');
    const out = await textOf((await convert(source)).files[0]!.blob);

    expect(out).toBe(await source.text());
  });

  it('csv → xlsx round-trips back to the same rows', async () => {
    const toXlsx = await find('csv', 'xlsx')!.load();
    const workbook = (await toXlsx(fixture('sample.csv'))).files[0]!;

    const toCsv = await find('xlsx', 'csv')!.load();
    const back = await toCsv(new File([workbook.blob], 'roundtrip.xlsx'));
    const text = await textOf(back.files[0]!.blob);

    expect(text).toContain('North');
    expect(text).toContain('2400');
    expect(text).toContain(MARKER);
  });
});

describe('content actually survives', () => {
  it('docx → md keeps the words and the heading structure', async () => {
    const convert = await find('docx', 'md')!.load();
    const out = await textOf((await convert(fixture('sample.docx'))).files[0]!.blob);

    expect(out).toContain(MARKER);
    expect(out).toMatch(/^#\s+Quarterly report/m);
    expect(out).toMatch(/^##\s+Findings/m);
  });

  it('docx → txt keeps the words', async () => {
    const convert = await find('docx', 'txt')!.load();
    const out = await textOf((await convert(fixture('sample.docx'))).files[0]!.blob);

    expect(out).toContain(MARKER);
    expect(out).toContain('Revenue rose in every region.');
  });

  it('pdf → txt pulls the text layer back out', async () => {
    const convert = await find('pdf', 'txt')!.load();
    const out = await textOf((await convert(fixture('sample.pdf'))).files[0]!.blob);

    expect(out).toContain(MARKER);
    expect(out).toContain('A printed heading');
  });

  it('rtf → txt keeps the words and drops the control words', async () => {
    const convert = await find('rtf', 'txt')!.load();
    const out = await textOf((await convert(fixture('sample.rtf'))).files[0]!.blob);

    expect(out).toContain(MARKER);
    expect(out).toContain('Plain paragraph text.');
    expect(out).not.toContain('\\rtf');
    expect(out).not.toContain('fonttbl');
  });

  it('pptx → md gives one heading per slide', async () => {
    const convert = await find('pptx', 'md')!.load();
    const out = await textOf((await convert(fixture('sample.pptx'))).files[0]!.blob);

    expect(out).toMatch(/^##\s+Opening slide/m);
    expect(out).toMatch(/^##\s+Second slide/m);
    expect(out).toContain('Point one');
  });

  it('pptx → txt keeps slide text in order', async () => {
    const convert = await find('pptx', 'txt')!.load();
    const out = await textOf((await convert(fixture('sample.pptx'))).files[0]!.blob);

    expect(out.indexOf('Opening slide')).toBeLessThan(out.indexOf('Second slide'));
    expect(out).toContain(MARKER);
  });
});

describe('spreadsheets', () => {
  it('exports computed values, never formula strings', async () => {
    const convert = await find('xlsx', 'csv')!.load();
    const result = await convert(fixture('sample.xlsx'));
    const text = await textOf(result.files[0]!.blob);

    expect(text).toContain('4000');
    expect(text).not.toContain('SUM(');
    expect(text).not.toContain('=');
  });

  it('returns one file per sheet for a multi-sheet workbook', async () => {
    const convert = await find('xlsx', 'csv')!.load();
    const result = await convert(fixture('sample.xlsx'));

    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.filename)).toEqual([
      'sample-sales.csv',
      'sample-notes.csv',
    ]);
    expect(result.warnings?.[0]).toMatch(/2 sheets/);
  });

  it('gives a single-sheet workbook a plain name and no sheet warning', async () => {
    const toXlsx = await find('csv', 'xlsx')!.load();
    const single = (await toXlsx(fixture('sample.csv'))).files[0]!;

    const toCsv = await find('xlsx', 'csv')!.load();
    const result = await toCsv(new File([single.blob], 'one.xlsx'));

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.filename).toBe('one.csv');
  });

  it('heads each sheet in the Markdown when there is more than one', async () => {
    const convert = await find('xlsx', 'md')!.load();
    const out = await textOf((await convert(fixture('sample.xlsx'))).files[0]!.blob);

    expect(out).toMatch(/^##\s+Sales/m);
    expect(out).toMatch(/^##\s+Notes/m);
    expect(out).toContain('| Region | Units | Revenue |');
  });

  it('detects a semicolon-separated export and says so', async () => {
    const convert = await find('csv', 'md')!.load();
    const result = await convert(fixture('semicolons.csv'));
    const out = await textOf(result.files[0]!.blob);

    expect(out).toContain('| Region | Units | Revenue |');
    expect(out).toContain('| North | 120 | 2400 |');
    expect(result.warnings?.join(' ')).toMatch(/not comma-separated/i);
  });
});

describe('refusals a person can act on', () => {
  it('names the old binary .doc rather than complaining about a zip', async () => {
    const convert = await find('docx', 'md')!.load();

    await expect(convert(fixture('actually-a-doc.docx'))).rejects.toThrow(
      /old binary \.doc file/i,
    );
  });

  it('refuses an empty file by name', async () => {
    const convert = await find('txt', 'docx')!.load();

    await expect(convert(fixture('empty.txt'))).rejects.toThrow(/empty/i);
  });

  it('explains a damaged archive without leaking library internals', async () => {
    const convert = await find('xlsx', 'csv')!.load();

    await expect(convert(fixture('corrupt.docx', 'broken.xlsx'))).rejects.toThrow(
      /damaged|could not read/i,
    );
  });

  it('refuses a file over the memory limit before reading it', async () => {
    const convert = await find('txt', 'md')!.load();
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
    const convert = await find('pptx', 'md')!.load();
    const out = await textOf(
      (await convert(await deckWithNotesOnSlideTwo())).files[0]!.blob,
    );

    expect(out).toMatch(/## Second slide[\s\S]*> Notes for slide two/);
    expect(out).not.toMatch(/## First slide[\s\S]*> Notes for slide two[\s\S]*## Second/);
  });
});
