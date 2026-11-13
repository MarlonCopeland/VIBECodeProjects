// src/platform/files.ts
// Native open/save dialogs — desktop's replacement for the phone's document
// picker + share sheet (importExport.pickCsvText / shareCsv).

import { bridge } from './bridge';

const CSV = [{ name: 'CSV', extensions: ['csv', 'txt'] }];

/** Pick a CSV and return its text (null if canceled). */
export async function openCsvText(): Promise<{ name: string; content: string } | null> {
  return bridge().openFile({ filters: CSV });
}

/** Save text through a native Save dialog. Returns the saved path, or null if canceled. */
export async function saveTextFile(
  defaultName: string,
  content: string,
  filters: { name: string; extensions: string[] }[] = CSV,
): Promise<string | null> {
  return bridge().saveFile({ defaultName, content, filters });
}
