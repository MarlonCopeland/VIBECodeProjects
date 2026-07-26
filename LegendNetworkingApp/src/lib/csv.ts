// src/lib/csv.ts
// Minimal RFC-4180-style CSV parse/serialize (quoted fields, embedded commas,
// quotes, and newlines). Hand-rolled so import/export needs no dependency.

/** Serialize rows to CSV text. Every field is quoted only when necessary. */
export function serializeCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((field) => {
          const f = field ?? '';
          return /[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f;
        })
        .join(','),
    )
    .join('\r\n');
}

/** Parse CSV text into rows of fields. Handles CRLF/LF and quoted fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Final field/row (unless the text ended exactly on a row break).
  if (field.length > 0 || row.length > 0) pushRow();

  // Drop fully-empty trailing rows (common with trailing newlines).
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}
