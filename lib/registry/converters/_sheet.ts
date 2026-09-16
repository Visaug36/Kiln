import { describeFailure, fail, interop, readArrayBuffer, readText } from '../shared';

export type Row = string[];

export interface Sheet {
  name: string;
  rows: Row[];
}

export interface Workbook {
  sheets: Sheet[];
  warnings: string[];
}

/**
 * Charts, images and pivot tables live outside the cell grid, so nothing below
 * can see them and nothing Kiln writes can carry them. They are visible in the
 * archive, though, so the file itself is asked what is being left behind.
 *
 * Both archive layouts are checked here rather than in two places. ODS is the
 * sibling of XLSX and holds the same things under different names — a warning
 * that only knew `xl/` would have gone quiet the moment ODS was added, and
 * quiet is the failure mode this whole channel exists to prevent.
 */
async function describeDroppedParts(buffer: ArrayBuffer): Promise<string[]> {
  const warnings: string[] = [];
  try {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);

    const count = (pattern: RegExp) =>
      names.filter((n) => pattern.test(n) && !n.endsWith('/')).length;

    // An OpenDocument chart is an embedded object directory, not a file.
    const objects = new Set(
      names
        .map((n) => /^Object [^/]+\//.exec(n)?.[0])
        .filter((n): n is string => Boolean(n)),
    ).size;

    const charts = count(/^xl\/charts\//) + objects;
    const media = count(/^(xl\/media|Pictures)\//i);
    const pivots = count(/^xl\/pivotTables\//);

    if (charts > 0) {
      warnings.push(
        `${charts === 1 ? 'A chart was' : `${charts} charts were`} not carried over — only cell values convert.`,
      );
    }
    if (media > 0) {
      warnings.push(
        `${media === 1 ? 'An image was' : `${media} images were`} not carried over.`,
      );
    }
    if (pivots > 0) {
      warnings.push(
        `${pivots === 1 ? 'A pivot table was' : `${pivots} pivot tables were`} not carried over; you get the cells it was built from, not the pivot.`,
      );
    }
  } catch {
    // Listing the archive is a courtesy. If it fails, the conversion is still
    // fine — the user just does not get the extra note.
  }
  return warnings;
}

/**
 * Reads a workbook into plain rows of strings.
 *
 * `cellFormula: false` plus SheetJS's default `w` (formatted text) means a cell
 * holding `=SUM(A1:A9)` arrives as the number Excel last computed, not as the
 * formula string. A spreadsheet that converts to a column of "=SUM(...)" is
 * useless, and recomputing formulas in the browser is not something Kiln does.
 */
export async function readWorkbook(input: File): Promise<Workbook> {
  const buffer = await readArrayBuffer(input);
  const XLSX = interop(await import('@e965/xlsx'));

  let book;
  try {
    book = XLSX.read(new Uint8Array(buffer), {
      type: 'array',
      cellFormula: false,
      cellHTML: false,
      cellDates: true,
    });
  } catch (cause) {
    fail(describeFailure(cause, 'xlsx'));
  }

  const warnings = await describeDroppedParts(buffer);
  const sheets: Sheet[] = [];

  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });

    sheets.push({
      name,
      rows: rows.map((row) => row.map((cell) => (cell == null ? '' : String(cell)))),
    });
  }

  if (sheets.length === 0) {
    fail('This workbook has no sheets in it.');
  }

  if (sheets.every((s) => s.rows.length === 0)) {
    fail('Every sheet in this workbook is empty.');
  }

  return { sheets, warnings };
}

/**
 * Picks the delimiter a CSV actually uses. Exports from European spreadsheet
 * locales are semicolon-separated and exports from databases are often tabs;
 * both look like a single-column file if you assume a comma.
 */
export function sniffDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  const candidates = [',', ';', '\t', '|'];

  let best = ',';
  let bestScore = -1;

  for (const candidate of candidates) {
    // Count only separators outside quotes, so commas inside fields don't win.
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i += 1) {
      const char = sample[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (!inQuotes && char === candidate) count += 1;
    }
    if (count > bestScore) {
      bestScore = count;
      best = candidate;
    }
  }

  return bestScore > 0 ? best : ',';
}

/** Parses CSV/TSV/SSV into rows, honouring quotes and embedded newlines. */
export function parseDelimited(text: string, delimiter: string): Row[] {
  const rows: Row[] = [];
  let row: Row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell !== ''));
}

export interface CsvInput {
  rows: Row[];
  delimiter: string;
}

export async function readCsv(input: File): Promise<CsvInput> {
  const text = await readText(input);
  if (text.trim() === '') {
    fail('This file is empty. There is nothing in it to convert.');
  }

  const delimiter = sniffDelimiter(text);
  const rows = parseDelimited(text, delimiter);

  if (rows.length === 0) {
    fail('No rows could be read out of this file.');
  }

  return { rows, delimiter };
}

/** Quotes a value for CSV output only when it has to be quoted. */
export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: Row[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** A GitHub-style pipe table. The first row becomes the header. */
export function toPipeTable(rows: Row[]): string {
  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push('');
    return copy;
  });

  // A literal pipe inside a cell would end the column early.
  const escape = (cell: string) => cell.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

  const [header, ...body] = padded;
  const lines = [
    `| ${header!.map(escape).join(' | ')} |`,
    `| ${header!.map(() => '---').join(' | ')} |`,
    ...body.map((r) => `| ${r.map(escape).join(' | ')} |`),
  ];

  return lines.join('\n');
}

/** Filename-safe version of a sheet name, for one-file-per-sheet output. */
export function slugifySheet(name: string): string {
  const slug = name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'sheet';
}
