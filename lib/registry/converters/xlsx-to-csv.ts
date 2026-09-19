import type { ConversionResult, OutputFile, ProgressFn } from '../types';
import { MIME, baseName, note } from '../shared';
import { readWorkbook, slugifySheet, toCsv } from './_sheet';

/**
 * One CSV per sheet. CSV has no concept of a workbook, so a multi-sheet file
 * genuinely is several files — the job row zips them.
 */
export async function convert(
  input: File,
  onProgress?: ProgressFn,
): Promise<ConversionResult> {
  const { sheets, warnings } = await readWorkbook(input, onProgress);
  const stem = baseName(input.name);
  const single = sheets.length === 1;

  const files: OutputFile[] = sheets.map((sheet) => ({
    blob: new Blob([toCsv(sheet.rows)], { type: MIME.csv }),
    filename: single ? `${stem}.csv` : `${stem}-${slugifySheet(sheet.name)}.csv`,
  }));

  const notes = [...warnings];
  if (!single) {
    // Nothing lost, nothing reshaped — CSV simply has no idea of a workbook,
    // and this says what came out instead.
    notes.unshift(
      note(
        `This workbook has ${sheets.length} sheets, so you get ${sheets.length} CSV files.`,
      ),
    );
  }

  return { files, warnings: notes.length ? notes : undefined };
}
