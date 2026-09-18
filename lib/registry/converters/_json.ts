import { fail } from '../shared';
import type { Row, Sheet } from './_sheet';

/**
 * JSON in and out of the spreadsheet model.
 *
 * JSON is in the spreadsheet family rather than the text one because the only
 * JSON Recast reads or writes is tabular: an array of objects is a grid with
 * named columns, which is exactly what a sheet is. Arbitrary nested JSON is not
 * a document and Recast does not pretend it is one — it flattens, by a rule
 * written down here and repeated in the pair's caveat, so that what comes out
 * is predictable rather than clever.
 */

type Json = unknown;

/** The separator between a nested object's key and its parent's. */
const NEST = '.';

/**
 * One value as a cell.
 *
 * An array becomes comma-separated text rather than more columns: the number of
 * columns would then depend on the longest array in the file, so adding a row
 * could silently change the shape of every other one.
 */
function cell(value: Json): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => cell(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * A record flattened to one level, with dotted keys.
 *
 * `{ address: { city: 'Leeds' } }` becomes the column `address.city`. An array
 * of objects stops at its own value — see `cell` — so the column count is
 * decided by the keys, not by the data.
 */
function flatten(value: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    out[prefix || 'value'] = cell(value);
    return out;
  }

  for (const [key, child] of Object.entries(value as Record<string, Json>)) {
    const name = prefix ? `${prefix}${NEST}${key}` : key;
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      Object.assign(out, flatten(child, name));
    } else {
      out[name] = cell(child);
    }
  }

  return out;
}

/** Rows for one array of records: a header row of keys, then a row per item. */
function rowsFrom(items: Json[]): Row[] {
  const flat = items.map((item) => flatten(item));

  // Keys in the order they are first seen, across every row rather than only
  // the first — a record that gains a field halfway down a file would
  // otherwise lose it, silently and with everything still looking plausible.
  const columns: string[] = [];
  for (const record of flat) {
    for (const key of Object.keys(record)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  if (columns.length === 0) return [];
  return [columns, ...flat.map((record) => columns.map((key) => record[key] ?? ''))];
}

/**
 * JSON into sheets.
 *
 * Three shapes are accepted, because all three are things people actually have:
 * an array of objects (one sheet), an array of arrays (rows as they stand), and
 * an object whose values are arrays (one sheet per key — which is what Recast
 * itself writes for a multi-sheet workbook, so a round trip comes back whole).
 */
export function jsonToSheets(text: string): Sheet[] {
  let parsed: Json;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(
      'This file is not valid JSON. Check it in an editor that can point at the line.',
    );
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0)
      fail('This JSON file is an empty list — there are no rows in it.');

    // An array of arrays is already a grid; take it as one.
    if (parsed.every((item) => Array.isArray(item))) {
      return [{ name: 'Sheet1', rows: (parsed as Json[][]).map((row) => row.map(cell)) }];
    }
    return [{ name: 'Sheet1', rows: rowsFrom(parsed) }];
  }

  if (parsed && typeof parsed === 'object') {
    const entries = Object.entries(parsed as Record<string, Json>);
    const arrays = entries.filter(([, value]) => Array.isArray(value));

    if (arrays.length > 0) {
      return arrays.map(([name, value]) => ({
        name,
        rows: rowsFrom(value as Json[]),
      }));
    }

    // A single object is one row, which is a perfectly ordinary thing to have.
    return [{ name: 'Sheet1', rows: rowsFrom([parsed]) }];
  }

  fail(
    'Recast reads JSON that is a list of records, or an object whose values are lists. This file is a single value.',
  );
}

/**
 * Sheets back out as JSON.
 *
 * One sheet becomes a bare array, which is what almost every consumer of a JSON
 * table expects. Several become an object keyed by sheet name — the shape
 * `jsonToSheets` reads back, so a workbook survives the round trip instead of
 * being flattened into whichever sheet came first.
 */
export function sheetsToJson(sheets: Sheet[]): string {
  const asRecords = (rows: Row[]): Record<string, string>[] => {
    const [header, ...body] = rows;
    if (!header) return [];

    // A blank or repeated header would produce keys that overwrite each other,
    // so each column is given a name that is actually distinct.
    const keys = header.map((name, index) => {
      const trimmed = name.trim();
      const base = trimmed || `column${index + 1}`;
      return header.slice(0, index).some((other) => other.trim() === trimmed) && trimmed
        ? `${base}_${index + 1}`
        : base;
    });

    return body.map((row) =>
      Object.fromEntries(keys.map((key, index) => [key, row[index] ?? ''])),
    );
  };

  const payload =
    sheets.length === 1
      ? asRecords(sheets[0]!.rows)
      : Object.fromEntries(sheets.map((sheet) => [sheet.name, asRecords(sheet.rows)]));

  return `${JSON.stringify(payload, null, 2)}\n`;
}
