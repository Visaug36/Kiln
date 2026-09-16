/**
 * Builds the binary fixtures the test suite reads.
 *
 * These are real files produced by real writers, not hand-rolled byte strings:
 * a fixture that only looks like a DOCX would let a broken reader pass. Run
 * `pnpm fixtures` after changing what the tests expect to find inside them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'test', 'fixtures');
mkdirSync(dir, { recursive: true });

const write = (name, data) => {
  writeFileSync(join(dir, name), data);
  console.log(`  ${name} — ${data.length} bytes`);
};

/** Text every reader test looks for, so a round trip can be asserted. */
export const MARKER = 'Kiln fixture marker 4711';

// ---- DOCX -------------------------------------------------------------
{
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    TextRun,
    Table,
    TableRow,
    TableCell,
    ExternalHyperlink,
  } = await import('docx');

  /** One cell, from runs. */
  const cell = (...children) =>
    new TableCell({ children: [new Paragraph({ children })] });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Quarterly report', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: MARKER }),
          new Paragraph({ text: 'Findings', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Revenue rose in every region.' }),
          new Paragraph({ text: 'First bullet', bullet: { level: 0 } }),
          new Paragraph({ text: 'Second bullet', bullet: { level: 0 } }),
          // Formatted cells: the writers that take plain text must not receive
          // Markdown punctuation here, and the ones that take Markdown must.
          new Table({
            rows: [
              new TableRow({
                children: [
                  cell(new TextRun({ text: 'Metric', bold: true })),
                  cell(new TextRun({ text: 'Value', bold: true })),
                ],
              }),
              new TableRow({
                children: [
                  cell(new TextRun({ text: 'Emphasis cell', italics: true })),
                  cell(
                    new TextRun({ text: 'mixed ' }),
                    new TextRun({ text: 'bold', bold: true }),
                    new TextRun({ text: ' and ' }),
                    new TextRun({ text: 'italic', italics: true }),
                  ),
                ],
              }),
              new TableRow({
                children: [
                  cell(
                    new ExternalHyperlink({
                      children: [new TextRun({ text: 'Linked cell' })],
                      link: 'https://example.com',
                    }),
                  ),
                  cell(new TextRun({ text: 'Plain cell' })),
                ],
              }),
            ],
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Bold closing', bold: true })],
          }),
        ],
      },
    ],
  });
  write('sample.docx', await Packer.toBuffer(doc));
}

// ---- XLSX (two sheets, and a formula whose value must win) -------------
{
  const XLSX = await import('@e965/xlsx');
  const book = XLSX.utils.book_new();

  const first = XLSX.utils.aoa_to_sheet([
    ['Region', 'Units', 'Revenue'],
    ['North', 120, 2400],
    ['South', 80, 1600],
    ['Total', 200, 4000],
  ]);
  // A real formula cell: readers must export 4000, not "=SUM(C2:C3)".
  first.C4 = { t: 'n', f: 'SUM(C2:C3)', v: 4000, w: '4000' };
  XLSX.utils.book_append_sheet(book, first, 'Sales');

  const second = XLSX.utils.aoa_to_sheet([['Note'], [MARKER]]);
  XLSX.utils.book_append_sheet(book, second, 'Notes');

  write(
    'sample.xlsx',
    Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })),
  );
}

// ---- PPTX -------------------------------------------------------------
{
  const { default: PptxGenJS } = await import('pptxgenjs');
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_16x9';

  const one = deck.addSlide();
  one.addText('Opening slide', { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 30, bold: true });
  one.addText(MARKER, { x: 0.5, y: 1.8, w: 9, h: 2, fontSize: 16 });

  const two = deck.addSlide();
  two.addText('Second slide', { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 30, bold: true });
  two.addText(
    [
      { text: 'Point one', options: { bullet: true, breakLine: true } },
      { text: 'Point two', options: { bullet: true, breakLine: true } },
    ],
    { x: 0.5, y: 1.8, w: 9, h: 3, fontSize: 16 },
  );

  write('sample.pptx', Buffer.from(await deck.write({ outputType: 'nodebuffer' })));
}

// ---- PDF (a real text layer) ------------------------------------------
{
  // pdfmake's Node entry exports a ready-made singleton, not a class.
  const { default: printer } = await import('pdfmake');
  // On Node the base-14 fonts are built into pdfkit, so no virtual file system
  // is needed — unlike the browser build, which has to be handed the metrics.
  printer.addFonts({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  });

  const doc = printer.createPdf({
    defaultStyle: { font: 'Helvetica', fontSize: 11 },
    content: [
      { text: 'A printed heading', fontSize: 24, bold: true, margin: [0, 0, 0, 12] },
      { text: MARKER, margin: [0, 0, 0, 8] },
      { text: 'Ordinary body text that should extract cleanly.' },
    ],
  });

  write('sample.pdf', await doc.getBuffer());
}

// ---- RTF --------------------------------------------------------------
{
  const rtf = [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0',
    '{\\fonttbl{\\f0\\froman Times New Roman;}}',
    '\\viewkind4\\uc1\\pard\\f0\\fs24',
    '\\pard\\b\\fs36 A large heading\\b0\\fs24\\par',
    `\\pard ${MARKER}\\par`,
    '\\pard Plain paragraph text.\\par',
    '\\pard\\bullet\\tab A bullet line\\par',
    '}',
  ].join('\n');
  write('sample.rtf', Buffer.from(rtf, 'utf8'));
}

// ---- Plain text formats -----------------------------------------------
write(
  'sample.md',
  Buffer.from(
    [
      '# Kiln test document',
      '',
      MARKER,
      '',
      '## A second heading',
      '',
      'Some **bold** and *italic* text with a [link](https://example.com).',
      '',
      '- First item',
      '- Second item',
      '',
      '> A quoted line.',
      '',
      '```',
      'code(); // fenced',
      '```',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| alpha | 1 |',
      '| beta | 2 |',
      '',
    ].join('\n'),
    'utf8',
  ),
);

write(
  'sample.txt',
  Buffer.from(`${MARKER}\n\nA second paragraph of plain text.\n\nAnd a third.\n`, 'utf8'),
);

write(
  'sample.csv',
  Buffer.from(
    [
      'Region,Units,Revenue',
      'North,120,2400',
      'South,80,1600',
      `Note,"${MARKER}",0`,
    ].join('\n'),
    'utf8',
  ),
);

// A semicolon-separated export, as European locales produce.
write(
  'semicolons.csv',
  Buffer.from(
    ['Region;Units;Revenue', 'North;120;2400', 'South;80;1600'].join('\n'),
    'utf8',
  ),
);

// ---- Deliberately broken inputs ---------------------------------------
// Valid ZIP magic, garbage inside: exercises the corrupt-OOXML path.
write(
  'corrupt.docx',
  Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from('not a real archive at all')]),
);

// The old binary Office container, which users rename to .docx constantly.
write(
  'actually-a-doc.docx',
  Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(64),
  ]),
);

write('empty.txt', Buffer.alloc(0));

// ---- OpenDocument, EPUB, HTML and JSON --------------------------------
{
  const { writeOdfFixtures } = await import('./fixtures-odf.mjs');
  await writeOdfFixtures(write, MARKER);
}

console.log('\nFixtures written to test/fixtures/');
