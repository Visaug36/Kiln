import type { ConversionResult } from '../types';
import { outputFile } from '../shared';
import { readWorkbook } from './_sheet';
import { sheetsToJson } from './_json';

export async function convert(input: File): Promise<ConversionResult> {
  const { sheets, warnings } = await readWorkbook(input);
  const notes = [...warnings];

  const headerless = sheets.filter((sheet) => sheet.rows.length < 2);
  if (headerless.length > 0) {
    notes.push(
      `${headerless.length === 1 ? 'One sheet had' : `${headerless.length} sheets had`} no rows under the header, so ${headerless.length === 1 ? 'it is' : 'they are'} an empty list.`,
    );
  }
  if (sheets.length > 1) {
    notes.push(
      `This workbook has ${sheets.length} sheets, so the JSON is an object with one list per sheet rather than a single list.`,
    );
  }

  return {
    files: [outputFile(input.name, 'json', sheetsToJson(sheets))],
    warnings: notes.length ? notes : undefined,
  };
}
