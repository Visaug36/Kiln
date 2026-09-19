import type { ConversionResult, ProgressFn } from '../types';
import { note, outputFile } from '../shared';
import { readWorkbook } from './_sheet';
import { sheetsToJson } from './_json';

export async function convert(
  input: File,
  onProgress?: ProgressFn,
): Promise<ConversionResult> {
  const { sheets, warnings } = await readWorkbook(input, onProgress);
  const notes = [...warnings];

  const headerless = sheets.filter((sheet) => sheet.rows.length < 2);
  if (headerless.length > 0) {
    // There was nothing under the header to lose, and the output says so
    // faithfully. Both of these describe the shape of the JSON: `note`.
    notes.push(
      note(
        `${headerless.length === 1 ? 'One sheet had' : `${headerless.length} sheets had`} no rows under the header, so ${headerless.length === 1 ? 'it is' : 'they are'} an empty list.`,
      ),
    );
  }
  if (sheets.length > 1) {
    notes.push(
      note(
        `This workbook has ${sheets.length} sheets, so the JSON is an object with one list per sheet rather than a single list.`,
      ),
    );
  }

  return {
    files: [outputFile(input.name, 'json', sheetsToJson(sheets))],
    warnings: notes.length ? notes : undefined,
  };
}
