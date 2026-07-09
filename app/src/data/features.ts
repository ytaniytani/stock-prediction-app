import type { CalendarEvent, EventCategory, FeatureRow, OHLC } from "./types";
import { dayOfMonth, daysInMonth, month, weekday } from "../lib/dateUtils";

function pctReturn(a: number, b: number): number {
  // aからbへの変化率(%)
  return ((b - a) / a) * 100;
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

// 日付昇順ソート済みの補助系列から、target日より前の直近レコードのインデックスを二分探索
function lastIndexBefore(dates: string[], target: string): number {
  let lo = 0;
  let hi = dates.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < target) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export interface FeatureContext {
  primary: OHLC[]; // 主系列（例: N225F または N225）
  dji: OHLC[];
  ixic: OHLC[];
  usdjpy: OHLC[];
  events: CalendarEvent[];
}

export function computeFeatures(ctx: FeatureContext): FeatureRow[] {
  const { primary, events } = ctx;
  const closes = primary.map((r) => r.close);
  const dates = primary.map((r) => r.date);

  const djiDates = ctx.dji.map((r) => r.date);
  const ixicDates = ctx.ixic.map((r) => r.date);
  const fxDates = ctx.usdjpy.map((r) => r.date);

  const evByDate = new Map<string, EventCategory[]>();
  for (const e of events) {
    const arr = evByDate.get(e.date) ?? [];
    arr.push(e.category);
    evByDate.set(e.date, arr);
  }

  function crossAssetReturn(secondary: OHLC[], secondaryDates: string[], targetDate: string): number | null {
    const idx = lastIndexBefore(secondaryDates, targetDate);
    if (idx < 1) return null;
    const prev = secondary[idx - 1].close;
    const cur = secondary[idx].close;
    return pctReturn(prev, cur);
  }

  const rows: FeatureRow[] = [];

  for (let i = 0; i < primary.length; i++) {
    const date = dates[i];
    const close = closes[i];

    const ret = (n: number): number => (i >= n ? pctReturn(closes[i - n], close) : NaN);

    // 連続陽線/陰線と、その合計騰落率
    let streakDays = 0;
    let streakReturn = 0;
    if (i >= 1) {
      const dir = closes[i] > closes[i - 1] ? 1 : -1;
      let j = i;
      while (j >= 1 && (closes[j] > closes[j - 1] ? 1 : -1) === dir) j--;
      streakDays = dir * (i - j);
      streakReturn = pctReturn(closes[j], close);
    }

    const maDev = (n: number): number => {
      if (i < n - 1) return NaN;
      const window = closes.slice(i - n + 1, i + 1);
      const ma = mean(window);
      return pctReturn(ma, close);
    };

    let vol20 = NaN;
    if (i >= 20) {
      const rets: number[] = [];
      for (let k = i - 19; k <= i; k++) rets.push(pctReturn(closes[k - 1], closes[k]));
      vol20 = stdev(rets);
    }

    const gap = i >= 1 ? pctReturn(closes[i - 1], primary[i].open) : NaN;

    const dom = dayOfMonth(date);
    const dim = daysInMonth(date);

    rows.push({
      date,
      close,
      ret1: ret(1),
      ret3: ret(3),
      ret5: ret(5),
      ret10: ret(10),
      ret20: ret(20),
      streakDays,
      streakReturn,
      maDev5: maDev(5),
      maDev25: maDev(25),
      maDev75: maDev(75),
      vol20,
      gap,
      prevDjiRet: crossAssetReturn(ctx.dji, djiDates, date),
      prevIxicRet: crossAssetReturn(ctx.ixic, ixicDates, date),
      fxRet: crossAssetReturn(ctx.usdjpy, fxDates, date),
      events: evByDate.get(date) ?? [],
      month: month(date),
      weekday: weekday(date),
      isMonthStart: dom <= 3,
      isMonthEnd: dom >= dim - 2,
      isFiscalYearEnd: month(date) === 3 && dom >= dim - 2,
      isFiscalYearStart: month(date) === 4 && dom <= 3,
    });
  }

  return rows;
}
