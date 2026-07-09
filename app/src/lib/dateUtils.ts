import type { ISODate } from "../data/types";

export function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function weekday(s: ISODate): number {
  return parseISO(s).getDay();
}

export function isWeekend(s: ISODate): boolean {
  const w = weekday(s);
  return w === 0 || w === 6;
}

export function month(s: ISODate): number {
  return parseISO(s).getMonth() + 1;
}

export function dayOfMonth(s: ISODate): number {
  return parseISO(s).getDate();
}

export function daysInMonth(s: ISODate): number {
  const d = parseISO(s);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// 営業日(平日)のリストを開始日〜終了日で生成
export function businessDayRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = start;
  while (compareISO(cur, end) <= 0) {
    if (!isWeekend(cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function formatJP(s: ISODate): string {
  const d = parseISO(s);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
