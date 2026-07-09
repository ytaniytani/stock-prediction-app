// イベント暦データ
//
// 精度の異なる2種類を明確に区別する:
//  - "exact"     … 制度・法則から一意に確定できる日付（SQ日）、または既知の史実（選挙日）
//  - "estimated" … 発表周期から推定した近似日程（日銀会合・FOMC・米CPI等）。
//                  実際の発表日と数日ずれる可能性がある。UI側で必ず「推定」バッジを出す。
//
// 本サンドボックス環境からは日銀・FRBの公式カレンダーAPIへ接続できないため、
// 全期間・全カテゴリを実測値で埋めることができない。正確な日程が必要な場合は
// データ管理画面からCSVで上書き登録できるようにする。
import type { CalendarEvent, EventCategory } from "./types";
import { addDays, toISO, dayOfMonth, weekday } from "../lib/dateUtils";

export const EVENT_META: Record<EventCategory, { label: string; precision: "exact" | "estimated" }> = {
  boj: { label: "日銀金融政策決定会合", precision: "estimated" },
  fomc: { label: "FOMC（米連邦公開市場委員会）", precision: "estimated" },
  us_jobs: { label: "米雇用統計", precision: "exact" },
  us_cpi: { label: "米CPI（消費者物価指数）", precision: "estimated" },
  sq_major: { label: "メジャーSQ", precision: "exact" },
  sq_minor: { label: "マイナーSQ", precision: "exact" },
  election_jp_lower: { label: "衆議院選挙", precision: "exact" },
  election_jp_upper: { label: "参議院選挙", precision: "exact" },
  election_us_pres: { label: "米大統領選挙", precision: "exact" },
  election_us_mid: { label: "米中間選挙", precision: "exact" },
  ldp_leadership: { label: "自民党総裁選", precision: "exact" },
};

// ── SQ日（第2金曜日）: 制度的に確定。3/6/9/12がメジャー、他はマイナー ──
function secondFriday(year: number, month: number): string {
  const first = new Date(year, month - 1, 1);
  const firstFridayOffset = (5 - first.getDay() + 7) % 7; // 5=金曜
  const day = 1 + firstFridayOffset + 7;
  return toISO(new Date(year, month - 1, day));
}

function generateSqEvents(startYear: number, endYear: number): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const date = secondFriday(y, m);
      const isMajor = [3, 6, 9, 12].includes(m);
      out.push({
        date,
        category: isMajor ? "sq_major" : "sq_minor",
        label: isMajor ? `${y}年${m}月 メジャーSQ` : `${y}年${m}月 マイナーSQ`,
      });
    }
  }
  return out;
}

// ── 米雇用統計: 原則「月初第1金曜日」（BLSの慣例。祝日等でずれる稀な例外は未反映） ──
function generateUsJobsEvents(startYear: number, endYear: number): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const first = new Date(y, m - 1, 1);
      const offset = (5 - first.getDay() + 7) % 7;
      const date = toISO(new Date(y, m - 1, 1 + offset));
      out.push({ date, category: "us_jobs", label: `${y}年${m}月 米雇用統計` });
    }
  }
  return out;
}

// ── 米CPI: 推定（毎月13日前後の平日に固定。実際の発表日とはずれる） ──
function generateUsCpiEvents(startYear: number, endYear: number): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      let d = new Date(y, m - 1, 13);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      out.push({ date: toISO(d), category: "us_cpi", label: `${y}年${m}月 米CPI（推定）` });
    }
  }
  return out;
}

// ── 日銀会合: 推定（年8回、約6.5週間隔。1月中旬を起点に等間隔で生成） ──
function generateBojEvents(startYear: number, endYear: number): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (let y = startYear; y <= endYear; y++) {
    let cur = toISO(new Date(y, 0, 23));
    for (let i = 0; i < 8; i++) {
      // 平日に丸める
      let d = new Date(cur);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      out.push({ date: toISO(d), category: "boj", label: `${y}年 日銀会合(${i + 1}回目・推定)` });
      cur = addDays(toISO(d), 45);
    }
  }
  return out;
}

// ── FOMC: 推定（年8回、約6.5週間隔。2月上旬を起点に等間隔で生成。BOJとは意図的に位相をずらす） ──
function generateFomcEvents(startYear: number, endYear: number): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (let y = startYear; y <= endYear; y++) {
    let cur = toISO(new Date(y, 0, 30));
    for (let i = 0; i < 8; i++) {
      let d = new Date(cur);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      out.push({ date: toISO(d), category: "fomc", label: `${y}年 FOMC(${i + 1}回目・推定)` });
      cur = addDays(toISO(d), 45);
    }
  }
  return out;
}

// ── 選挙・総裁選: 既知の史実（正確な投開票日） ──
const KNOWN_ELECTIONS: CalendarEvent[] = [
  // 衆議院選挙（投開票日）
  { date: "1996-10-20", category: "election_jp_lower", label: "第41回衆院選" },
  { date: "2000-06-25", category: "election_jp_lower", label: "第42回衆院選" },
  { date: "2003-11-09", category: "election_jp_lower", label: "第43回衆院選" },
  { date: "2005-09-11", category: "election_jp_lower", label: "第44回衆院選（郵政解散）" },
  { date: "2009-08-30", category: "election_jp_lower", label: "第45回衆院選（政権交代）" },
  { date: "2012-12-16", category: "election_jp_lower", label: "第46回衆院選" },
  { date: "2014-12-14", category: "election_jp_lower", label: "第47回衆院選" },
  { date: "2017-10-22", category: "election_jp_lower", label: "第48回衆院選" },
  { date: "2021-10-31", category: "election_jp_lower", label: "第49回衆院選" },
  { date: "2024-10-27", category: "election_jp_lower", label: "第50回衆院選" },
  // 参議院選挙（投開票日、3年周期）
  { date: "1995-07-23", category: "election_jp_upper", label: "第17回参院選" },
  { date: "1998-07-12", category: "election_jp_upper", label: "第18回参院選" },
  { date: "2001-07-29", category: "election_jp_upper", label: "第19回参院選" },
  { date: "2004-07-11", category: "election_jp_upper", label: "第20回参院選" },
  { date: "2007-07-29", category: "election_jp_upper", label: "第21回参院選" },
  { date: "2010-07-11", category: "election_jp_upper", label: "第22回参院選" },
  { date: "2013-07-21", category: "election_jp_upper", label: "第23回参院選" },
  { date: "2016-07-10", category: "election_jp_upper", label: "第24回参院選" },
  { date: "2019-07-21", category: "election_jp_upper", label: "第25回参院選" },
  { date: "2022-07-10", category: "election_jp_upper", label: "第26回参院選" },
  { date: "2025-07-20", category: "election_jp_upper", label: "第27回参院選" },
  // 米大統領選挙（11月第1月曜日の翌火曜日）
  { date: "1996-11-05", category: "election_us_pres", label: "1996年米大統領選" },
  { date: "2000-11-07", category: "election_us_pres", label: "2000年米大統領選" },
  { date: "2004-11-02", category: "election_us_pres", label: "2004年米大統領選" },
  { date: "2008-11-04", category: "election_us_pres", label: "2008年米大統領選" },
  { date: "2012-11-06", category: "election_us_pres", label: "2012年米大統領選" },
  { date: "2016-11-08", category: "election_us_pres", label: "2016年米大統領選" },
  { date: "2020-11-03", category: "election_us_pres", label: "2020年米大統領選" },
  { date: "2024-11-05", category: "election_us_pres", label: "2024年米大統領選" },
  // 米中間選挙
  { date: "1998-11-03", category: "election_us_mid", label: "1998年米中間選挙" },
  { date: "2002-11-05", category: "election_us_mid", label: "2002年米中間選挙" },
  { date: "2006-11-07", category: "election_us_mid", label: "2006年米中間選挙" },
  { date: "2010-11-02", category: "election_us_mid", label: "2010年米中間選挙" },
  { date: "2014-11-04", category: "election_us_mid", label: "2014年米中間選挙" },
  { date: "2018-11-06", category: "election_us_mid", label: "2018年米中間選挙" },
  { date: "2022-11-08", category: "election_us_mid", label: "2022年米中間選挙" },
  { date: "2026-11-03", category: "election_us_mid", label: "2026年米中間選挙" },
  // 自民党総裁選（主要なもの・投開票日ベース）
  { date: "2001-04-24", category: "ldp_leadership", label: "2001年総裁選（小泉政権誕生）" },
  { date: "2006-09-20", category: "ldp_leadership", label: "2006年総裁選（安倍政権誕生）" },
  { date: "2007-09-23", category: "ldp_leadership", label: "2007年総裁選（福田政権誕生）" },
  { date: "2008-09-22", category: "ldp_leadership", label: "2008年総裁選（麻生政権誕生）" },
  { date: "2012-09-26", category: "ldp_leadership", label: "2012年総裁選（安倍政権再誕生）" },
  { date: "2018-09-20", category: "ldp_leadership", label: "2018年総裁選" },
  { date: "2020-09-14", category: "ldp_leadership", label: "2020年総裁選（菅政権誕生）" },
  { date: "2021-09-29", category: "ldp_leadership", label: "2021年総裁選（岸田政権誕生）" },
  { date: "2024-09-27", category: "ldp_leadership", label: "2024年総裁選（石破政権誕生）" },
];

// 日本の国政選挙・総裁選の投開票日は日曜（総裁選は土日祝のことがある）で、
// 株式市場の取引日（平日）データには存在しない。市場が最初に反応できるのは
// 翌営業日（多くは月曜）のため、土日にかかる日付は次の平日にロールして結合する。
function rollToWeekday(date: string): string {
  let d = date;
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
  return d;
}

let cache: CalendarEvent[] | null = null;

export function buildEventCalendar(startYear = 1994, endYear = 2028): CalendarEvent[] {
  if (cache) return cache;
  const events = [
    ...generateSqEvents(startYear, endYear),
    ...generateUsJobsEvents(startYear, endYear),
    ...generateUsCpiEvents(startYear, endYear),
    ...generateBojEvents(startYear, endYear),
    ...generateFomcEvents(startYear, endYear),
    ...KNOWN_ELECTIONS.filter((e) => {
      const y = Number(e.date.slice(0, 4));
      return y >= startYear && y <= endYear;
    }).map((e) => ({ ...e, date: rollToWeekday(e.date) })),
  ];
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  cache = events;
  return events;
}

export function eventsByDate(events: CalendarEvent[]): Map<string, EventCategory[]> {
  const map = new Map<string, EventCategory[]>();
  for (const e of events) {
    const arr = map.get(e.date) ?? [];
    arr.push(e.category);
    map.set(e.date, arr);
  }
  return map;
}

// 月初/月末の簡易判定（3日以内）。月末側は features.ts 側で当月末日と比較して厳密化する。
export function isNearMonthBoundary(date: string, side: "start" | "end", withinDays = 3): boolean {
  const dom = dayOfMonth(date);
  if (side === "start") return dom <= withinDays;
  return dom >= 28 - withinDays + 1;
}
