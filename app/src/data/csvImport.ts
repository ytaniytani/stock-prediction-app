import type { OHLC } from "./types";

export interface CsvImportResult {
  rows: OHLC[];
  skipped: number;
  errors: string[];
}

// 対応フォーマット:
//  - Yahoo!ファイナンス系:  Date,Open,High,Low,Close(,Adj Close,Volume)
//  - investing.com系:      Date,Price,Open,High,Low,Vol.,Change %  (Price=終値)
//  - 日付は "YYYY-MM-DD" "YYYY/MM/DD" "MM/DD/YYYY" のいずれかを許容
export function parseOhlcCsv(text: string): CsvImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], skipped: 0, errors: ["ファイルが空です"] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idxDate = findCol(header, ["date", "日付"]);
  const idxOpen = findCol(header, ["open", "始値"]);
  const idxHigh = findCol(header, ["high", "高値"]);
  const idxLow = findCol(header, ["low", "安値"]);
  const idxClose = findCol(header, ["close", "close*", "price", "終値", "close/last"]);

  const errors: string[] = [];
  if (idxDate < 0) errors.push("日付列（Date）が見つかりません");
  if (idxClose < 0) errors.push("終値列（Close / Price）が見つかりません");
  if (errors.length > 0) return { rows: [], skipped: 0, errors };

  const rows: OHLC[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length <= idxDate || cols.length <= idxClose) {
      skipped++;
      continue;
    }
    const date = normalizeDate(cols[idxDate]);
    const close = parseNum(cols[idxClose]);
    if (!date || close === null) {
      skipped++;
      continue;
    }
    const open = idxOpen >= 0 ? parseNum(cols[idxOpen]) : null;
    const high = idxHigh >= 0 ? parseNum(cols[idxHigh]) : null;
    const low = idxLow >= 0 ? parseNum(cols[idxLow]) : null;

    rows.push({
      date,
      open: open ?? close,
      high: high ?? Math.max(open ?? close, close),
      low: low ?? Math.min(open ?? close, close),
      close,
    });
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { rows, skipped, errors: [] };
}

function findCol(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = header.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

function splitCsvLine(line: string): string[] {
  // 簡易CSVパーサ（ダブルクォート・カンマ内カンマに対応）
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseNum(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/["%,]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned.toLowerCase() === "null") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(s: string): string | null {
  const raw = s.replace(/"/g, "").trim();
  // YYYY-MM-DD / YYYY/MM/DD
  let m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  // MM/DD/YYYY
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  // "Jan 02, 2024" 形式
  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime())) {
    const y = asDate.getFullYear();
    const mo = String(asDate.getMonth() + 1).padStart(2, "0");
    const d = String(asDate.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return null;
}

function pad(s: string): string {
  return s.padStart(2, "0");
}
