import { describe, expect, it } from 'vitest';
import { fixture } from '@/test/fixtures';
import {
  baseName,
  detectFormat,
  extensionOf,
  formatFromExtension,
  settleArchive,
} from './detect';
import { sniffOoxml } from './archive';

const asFile = (name: string, body = 'hello') => new File([body], name);

/**
 * The whole two-stage flow, as the page runs it.
 *
 * Identifying a ZIP needs a zip library, so `detectFormat` stops at
 * "this is an archive" and the page asks the worker. Here the worker's side is
 * called directly.
 */
async function resolve(file: File) {
  const detection = await detectFormat(file);
  if (!detection.needsArchiveCheck) return detection;
  return settleArchive(detection.claimed, (await sniffOoxml(file)).format);
}

describe('detecting OOXML from bytes alone', () => {
  it('tells the three ZIP-based formats apart', async () => {
    expect((await resolve(fixture('sample.docx'))).format).toBe('docx');
    expect((await resolve(fixture('sample.xlsx'))).format).toBe('xlsx');
    expect((await resolve(fixture('sample.pptx'))).format).toBe('pptx');
  });

  it('identifies them even when the extension is stripped entirely', async () => {
    expect((await resolve(fixture('sample.docx', 'mystery'))).format).toBe('docx');
    expect((await resolve(fixture('sample.xlsx', 'mystery'))).format).toBe('xlsx');
    expect((await resolve(fixture('sample.pptx', 'mystery'))).format).toBe('pptx');
  });
});

describe('when the extension disagrees with the contents', () => {
  it('trusts the bytes and reports the mismatch', async () => {
    // A spreadsheet that someone renamed to .docx — all three are ZIPs, so an
    // extension check alone would hand it to the wrong reader.
    const detection = await resolve(fixture('sample.xlsx', 'budget.docx'));

    expect(detection.format).toBe('xlsx');
    expect(detection.claimed).toBe('docx');
    expect(detection.mismatch).toBe(true);
  });

  it('does not flag a mismatch when the name is right', async () => {
    const detection = await resolve(fixture('sample.xlsx'));
    expect(detection.mismatch).toBe(false);
  });

  it('catches a PDF wearing a .docx name', async () => {
    const detection = await detectFormat(fixture('sample.pdf', 'report.docx'));
    expect(detection.format).toBe('pdf');
    expect(detection.mismatch).toBe(true);
  });
});

describe('formats with a signature', () => {
  it('reads PDF and RTF from their leading bytes', async () => {
    expect((await detectFormat(fixture('sample.pdf'))).format).toBe('pdf');
    expect((await detectFormat(fixture('sample.rtf'))).format).toBe('rtf');
  });
});

describe('inputs Recast will not take', () => {
  it('names the old binary Office container specifically', async () => {
    const detection = await detectFormat(fixture('actually-a-doc.docx'));

    expect(detection.format).toBeUndefined();
    expect(detection.reason).toMatch(/old binary Office file/i);
  });

  it('rejects a damaged OOXML archive rather than guessing', async () => {
    const detection = await resolve(fixture('corrupt.docx'));
    expect(detection.format).toBeUndefined();
  });

  it('turns down a file named like a binary format but holding text', async () => {
    const detection = await detectFormat(asFile('notes.pdf', 'just some words'));

    expect(detection.format).toBeUndefined();
    expect(detection.reason).toMatch(/not PDF/i);
  });

  it('has nothing to say about an unknown extension', async () => {
    expect((await detectFormat(asFile('archive.xyz'))).format).toBeUndefined();
  });
});

describe('plain-text formats', () => {
  it('falls back to the extension, since they have no signature', async () => {
    expect((await detectFormat(asFile('notes.md'))).format).toBe('md');
    expect((await detectFormat(asFile('notes.txt'))).format).toBe('txt');
    expect((await detectFormat(asFile('rows.csv'))).format).toBe('csv');
    expect((await detectFormat(asFile('page.html'))).format).toBe('html');
    expect((await detectFormat(asFile('data.json'))).format).toBe('json');
  });

  it('accepts the common aliases', () => {
    expect(formatFromExtension('readme.markdown')).toBe('md');
    expect(formatFromExtension('log.text')).toBe('txt');
    expect(formatFromExtension('rows.tsv')).toBe('csv');
    expect(formatFromExtension('page.htm')).toBe('html');
    expect(formatFromExtension('page.xhtml')).toBe('html');
    expect(formatFromExtension('letter.ott')).toBe('odt');
  });

  it('does not sniff a leading brace or angle bracket', async () => {
    // A Markdown file can perfectly well open with `<div>` or `{`. The
    // extension is the only honest answer for a format with no signature, and
    // guessing from the first byte would misread ordinary documents.
    expect((await detectFormat(new File(['{ "a": 1 }'], 'notes.md'))).format).toBe('md');
    expect((await detectFormat(new File(['<html>'], 'notes.txt'))).format).toBe('txt');
  });
});

describe('the archive formats that name themselves', () => {
  it('reads the mimetype entry ODF and EPUB put first', async () => {
    expect((await resolve(fixture('sample.odt'))).format).toBe('odt');
    expect((await resolve(fixture('sample.ods'))).format).toBe('ods');
    expect((await resolve(fixture('sample.odp'))).format).toBe('odp');
    expect((await resolve(fixture('sample.epub'))).format).toBe('epub');
  });

  it('tells an ODF package from an OOXML one, both being ZIPs', async () => {
    // The whole reason detection reads bytes: seven of the fourteen formats are
    // a ZIP, and the extension is the one thing that cannot be trusted.
    const odt = fixture('sample.odt', 'renamed.docx');
    const settled = await resolve(odt);

    expect(settled.format).toBe('odt');
    expect(settled.mismatch).toBe(true);
  });

  it('falls back to the package layout when there is no mimetype entry', async () => {
    const { default: JSZip } = await import('jszip');
    const { sniffOoxml } = await import('./archive');

    const book = new JSZip();
    book.file('META-INF/container.xml', '<container/>');
    book.file('OEBPS/one.xhtml', '<html/>');
    const bytes = (await book.generateAsync({ type: 'arraybuffer' })) as ArrayBuffer;
    expect((await sniffOoxml(new File([bytes], 'x.zip'))).format).toBe('epub');

    const sheet = new JSZip();
    sheet.file('META-INF/manifest.xml', '<manifest/>');
    sheet.file(
      'content.xml',
      '<office:document-content><office:body><office:spreadsheet/></office:body></office:document-content>',
    );
    const sheetBytes = (await sheet.generateAsync({
      type: 'arraybuffer',
    })) as ArrayBuffer;
    expect((await sniffOoxml(new File([sheetBytes], 'y.zip'))).format).toBe('ods');
  });
});

describe('extensionOf and baseName', () => {
  it('splits on the final dot', () => {
    expect(extensionOf('report.final.docx')).toBe('docx');
    expect(baseName('report.final.docx')).toBe('report.final');
  });

  it('leaves a name without an extension alone', () => {
    expect(extensionOf('README')).toBe('');
    expect(baseName('README')).toBe('README');
  });

  it('ignores a leading dot, which is not an extension', () => {
    expect(extensionOf('.gitignore')).toBe('');
    expect(formatFromExtension('.gitignore')).toBeUndefined();
  });
});

describe('how big an archive really is', () => {
  it('reads the unpacked size out of the zip headers', async () => {
    // Read from the headers, so it costs no decompression — but the field is
    // JSZip's internal, not part of its published type. If an upgrade takes it
    // away, this fails rather than the memory estimate quietly getting worse.
    const { expanded } = await sniffOoxml(fixture('sample.docx'));
    const packed = fixture('sample.docx').size;

    expect(expanded).toBeGreaterThan(packed);
    expect(expanded).toBeGreaterThan(1024);
  });

  it('says nothing rather than guessing when the archive will not open', async () => {
    const { format, expanded } = await sniffOoxml(fixture('corrupt.docx'));

    expect(format).toBeUndefined();
    expect(expanded).toBeUndefined();
  });
});
