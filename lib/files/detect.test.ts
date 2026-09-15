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
  return settleArchive(detection.claimed, await sniffOoxml(file));
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

describe('inputs Kiln will not take', () => {
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
  });

  it('accepts the common aliases', () => {
    expect(formatFromExtension('readme.markdown')).toBe('md');
    expect(formatFromExtension('log.text')).toBe('txt');
    expect(formatFromExtension('rows.tsv')).toBe('csv');
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
