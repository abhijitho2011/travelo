/**
 * RFC 4180 CSV serialisation, hand-rolled on purpose.
 *
 * A CSV export is three rules — quote when the value contains a delimiter, a
 * quote or a newline; double any embedded quote; join with CRLF — and none of
 * them are worth a dependency. The rules are small enough to test exhaustively,
 * which is exactly what `to-csv.spec.ts` does.
 */

const NEEDS_QUOTING = /[",\r\n]/;

/**
 * One CSV field.
 *
 * `null` / `undefined` render as an EMPTY field rather than the strings
 * "null"/"undefined" — a spreadsheet must show a blank cell for a missing
 * value, not a word that looks like data.
 */
export function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text: string;
  if (value instanceof Date) {
    text = Number.isNaN(value.getTime()) ? '' : value.toISOString();
  } else if (typeof value === 'object') {
    // Nested audit-log payloads and JSONB columns flatten to compact JSON. The
    // quoting rules below then take care of the commas and quotes inside it.
    text = JSON.stringify(value);
  } else if (typeof value === 'boolean' || typeof value === 'number') {
    text = String(value);
  } else {
    text = String(value);
  }

  // A leading =, +, - or @ makes Excel and Sheets evaluate the cell as a
  // formula. Prefixing an apostrophe neutralises that without altering the
  // value a CSV parser reads back. Only TEXT is guarded — a negative number is
  // data, and turning -5 into '-5 would break every numeric column.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (!NEEDS_QUOTING.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** One CSV record, without its line terminator. */
export function toCsvRow(values: readonly unknown[]): string {
  return values.map(toCsvValue).join(',');
}

/** A whole document: header row plus data rows, CRLF-terminated throughout. */
export function toCsvDocument(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  return [toCsvRow(headers), ...rows.map(toCsvRow)].join('\r\n') + '\r\n';
}
