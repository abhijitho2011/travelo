import { toCsvDocument, toCsvRow, toCsvValue } from './to-csv';

describe('toCsvValue', () => {
  it('leaves a plain value untouched', () => {
    expect(toCsvValue('Tavelo')).toBe('Tavelo');
    expect(toCsvValue(42)).toBe('42');
    expect(toCsvValue(true)).toBe('true');
  });

  it('renders null and undefined as an empty field, never the word', () => {
    expect(toCsvValue(null)).toBe('');
    expect(toCsvValue(undefined)).toBe('');
    expect(toCsvRow([null, 'x', undefined])).toBe(',x,');
  });

  it('quotes a value containing a comma', () => {
    expect(toCsvValue('Kochi, Kerala')).toBe('"Kochi, Kerala"');
  });

  it('doubles embedded quotes and wraps the field', () => {
    expect(toCsvValue('He said "hi"')).toBe('"He said ""hi"""');
    expect(toCsvValue('"')).toBe('""""');
  });

  it('quotes values containing newlines, LF and CRLF alike', () => {
    expect(toCsvValue('line1\nline2')).toBe('"line1\nline2"');
    expect(toCsvValue('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('handles the nastiest combination in one field', () => {
    expect(toCsvValue('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it('serialises dates as ISO-8601 and objects as JSON', () => {
    expect(toCsvValue(new Date('2026-08-29T10:00:00Z'))).toBe('2026-08-29T10:00:00.000Z');
    expect(toCsvValue({ a: 1, b: 'x,y' })).toBe('"{""a"":1,""b"":""x,y""}"');
  });

  it('neutralises formula injection without losing the text', () => {
    expect(toCsvValue('=1+1')).toBe("'=1+1");
    expect(toCsvValue('+91 98765')).toBe("'+91 98765");
    expect(toCsvValue('@admin')).toBe("'@admin");
    // A negative NUMBER is data, not a formula, and must stay numeric.
    expect(toCsvValue(-5)).toBe('-5');
  });
});

describe('toCsvRow', () => {
  it('joins fields with a comma', () => {
    expect(toCsvRow(['a', 'b', 'c'])).toBe('a,b,c');
  });

  it('is empty-safe', () => {
    expect(toCsvRow([])).toBe('');
  });
});

describe('toCsvDocument', () => {
  it('emits the header then CRLF-separated rows with a trailing terminator', () => {
    expect(
      toCsvDocument(
        ['id', 'name'],
        [
          ['1', 'Alpha'],
          ['2', 'Beta, Ltd'],
        ],
      ),
    ).toBe('id,name\r\n1,Alpha\r\n2,"Beta, Ltd"\r\n');
  });

  it('emits just the header when there are no rows', () => {
    expect(toCsvDocument(['id'], [])).toBe('id\r\n');
  });
});
