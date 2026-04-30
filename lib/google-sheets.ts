// Google Sheets API v4 helpers.
// All reads/writes go through these functions — no raw API calls in agent code.

import { google } from "googleapis";
import { getAuthClient } from "@/lib/google-auth";
import { env } from "@/lib/env";

function sheets() {
  return google.sheets({ version: "v4", auth: getAuthClient() });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wraps a write operation with up to 3 retries on quota / rate-limit errors.
// Waits 2 s between each attempt so the Sheets API quota window can reset.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      const isQuota = msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource exhausted");

      if (isQuota && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  // TypeScript requires this even though the loop above always returns or throws
  throw new Error("withRetry: exceeded max retries");
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

// Append a single row to a named sheet. Retries on quota errors.
export async function appendToSheet(
  sheetName: string,
  row: (string | number | boolean)[]
): Promise<void> {
  await withRetry(() =>
    sheets().spreadsheets.values.append({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: sheetName,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    })
  );
}

// Append multiple rows in a single API call — use this instead of looping appendToSheet.
export async function appendManyToSheet(
  sheetName: string,
  rows: (string | number | boolean)[][]
): Promise<void> {
  if (rows.length === 0) return;
  await withRetry(() =>
    sheets().spreadsheets.values.append({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: sheetName,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    })
  );
}

// Update a specific cell range (e.g. "Sheet1!B2"). Retries on quota errors.
export async function updateCell(
  range: string,
  value: string | number
): Promise<void> {
  await withRetry(() =>
    sheets().spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [[value]] },
    })
  );
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

// Update a specific row by its 1-based row number. Retries on quota errors.
export async function updateRow(
  sheetName: string,
  rowNumber: number,
  values: (string | number | boolean)[]
): Promise<void> {
  const range = `${sheetName}!A${rowNumber}`;
  await withRetry(() =>
    sheets().spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [values] },
    })
  );
}

// Update a single column value in a specific row by finding its matching ID. Retries on quota errors.
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

// Create a new sheet tab if it does not already exist.
export async function ensureSheetTab(
  title: string,
  headers?: string[]
): Promise<void> {
  const meta = await sheets().spreadsheets.get({ spreadsheetId: env.GOOGLE_SHEETS_ID });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === title);
  if (exists) return;

  await withRetry(() =>
    sheets().spreadsheets.batchUpdate({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    })
  );

  if (headers && headers.length > 0) {
    await appendToSheet(title, headers);
  }
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
