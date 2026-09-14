import { describe, expect, it } from 'vitest';
import { baseName, detectFormat, extensionOf } from './detect';

describe('detectFormat', () => {
  it('reads the format from the extension, whatever the case', () => {
    expect(detectFormat('report.DOCX')).toBe('docx');
    expect(detectFormat('notes.md')).toBe('md');
    expect(detectFormat('paper.pdf')).toBe('pdf');
  });

  it('accepts the common aliases', () => {
    expect(detectFormat('readme.markdown')).toBe('md');
    expect(detectFormat('log.text')).toBe('txt');
  });

  it('returns undefined for a format Kiln does not handle', () => {
    expect(detectFormat('sheet.xlsx')).toBeUndefined();
    expect(detectFormat('Makefile')).toBeUndefined();
    expect(detectFormat('.gitignore')).toBeUndefined();
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
});
