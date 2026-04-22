// Google Sheets API v4 helpers.
// All reads/writes go through these functions — no raw API calls in agent code.

import { google } from "googleapis";
import { getAuthClient } from "@/lib/google-auth";
import { env } from "@/lib/env";

function sheets() {
  return google.sheets({ version: "v4", auth: getAuthClient() });
}

// Read all rows from a named sheet. Returns rows as string arrays (first row = headers).
export async function readSheet(sheetName: string): Promise<string[][]> {
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEETS_ID,
    range: sheetName,
  });
  return (res.data.values as string[][]) ?? [];
}

// Read all rows and return as objects keyed by header name.
export async function readSheetAsObjects(
  sheetName: string
): Promise<Record<string, string>[]> {
  const rows = await readSheet(sheetName);
  if (rows.length < 2) return [];
  const [headers, ...dataRows] = rows;
  return dataRows.map((row) =>
    Object.fromEntries(
      (headers ?? []).map((h, i) => [h, row[i] ?? ""])
    )
  );
}

// Append a single row to a named sheet.
export async function appendToSheet(
  sheetName: string,
  row: (string | number | boolean)[]
): Promise<void> {
  await sheets().spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEETS_ID,
    range: sheetName,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

// Update a specific cell range (e.g. "Sheet1!B2").
export async function updateCell(
  range: string,
  value: string | number
): Promise<void> {
  await sheets().spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEETS_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}

// Find the first row where a column matches a value. Returns row index (1-based) or -1.
export async function findRowByValue(
  sheetName: string,
  columnIndex: number,
  value: string
): Promise<number> {
  const rows = await readSheet(sheetName);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]?.[columnIndex] === value) return i + 1; // +1 for 1-based Sheets index
  }
  return -1;
}

// Update a specific row by its 1-based row number.
export async function updateRow(
  sheetName: string,
  rowNumber: number,
  values: (string | number | boolean)[]
): Promise<void> {
  const range = `${sheetName}!A${rowNumber}`;
  await sheets().spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEETS_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
}

// Update a single column value in a specific row by finding its matching ID.
export async function updateFieldByRowId(
  sheetName: string,
  idColumnIndex: number,
  idValue: string,
  targetColumnIndex: number,
  newValue: string | number | boolean
): Promise<void> {
  const rows = await readSheet(sheetName);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]?.[idColumnIndex] === idValue) {
      const col = columnLetter(targetColumnIndex);
      const range = `${sheetName}!${col}${i + 1}`;
      await updateCell(range, newValue as string | number);
      return;
    }
  }
  throw new Error(`Row with id "${idValue}" not found in sheet "${sheetName}"`);
}

function columnLetter(index: number): string {
  let letter = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}
