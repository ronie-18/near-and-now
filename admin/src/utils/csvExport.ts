/**
 * Generic CSV export — takes an array of flat objects and a column spec,
 * and triggers a browser download. Used by every admin list page's "Export
 * CSV" button rather than each page reimplementing escaping/download logic.
 */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  // Quote whenever the cell contains a comma, quote, or newline — plain
  // cells stay unquoted so the file reads cleanly in a text editor too.
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(','));
  const csv = [header, ...lines].join('\r\n');

  // Prepend a UTF-8 BOM so Excel (which otherwise guesses the wrong
  // encoding for non-ASCII characters, e.g. store names) opens it correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
