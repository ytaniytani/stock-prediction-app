// 日付は "YYYY-MM-DD" 固定（タイムゾーン問題を避けるため終始文字列で扱う）
export type ISODate = string;

export interface OHLC {
  date: ISODate;
  open: number;
  high: number;
  low: number;
  close: number;
}

// アプリが扱う銘柄コード
export type InstrumentCode = "N225" | "N225F" | "DJI" | "IXIC" | "TOPX" | "USDJPY";

export const INSTRUMENTS: { code: InstrumentCode; label: string; unit: string }[] = [
  { code: "N225", label: "日経平均株価", unit: "円" },
  { code: "N225F", label: "日経225先物", unit: "円" },
  { code: "DJI", label: "NYダウ", unit: "ドル" },
  { code: "IXIC", label: "NASDAQ総合", unit: "ポイント" },
  { code: "TOPX", label: "TOPIX", unit: "ポイント" },
  { code: "USDJPY", label: "ドル円", unit: "円" },
];

export type InstrumentSeries = Record<InstrumentCode, OHLC[]>;

// イベント種別
export type EventCategory =
  | "boj" // 日銀金融政策決定会合
  | "fomc" // FOMC
  | "us_jobs" // 米雇用統計
  | "us_cpi" // 米CPI
  | "sq_major" // メジャーSQ
  | "sq_minor" // マイナーSQ
  | "election_jp_lower" // 衆院選
  | "election_jp_upper" // 参院選
  | "election_us_pres" // 米大統領選
  | "election_us_mid" // 米中間選挙
  | "ldp_leadership"; // 自民党総裁選

export interface CalendarEvent {
  date: ISODate;
  category: EventCategory;
  label: string;
}

// 統計エンジンが使う特徴量（1営業日=1レコード）
export interface FeatureRow {
  date: ISODate;
  close: number;
  // 直近リターン（%）
  ret1: number;
  ret3: number;
  ret5: number;
  ret10: number;
  ret20: number;
  // 連続陽線/陰線（正=連続上昇日数、負=連続下落日数）と、その合計騰落率
  streakDays: number;
  streakReturn: number;
  // 移動平均乖離率（%）
  maDev5: number;
  maDev25: number;
  maDev75: number;
  // 20日ボラティリティ（日次リターン標準偏差、%）
  vol20: number;
  // 当日の寄り付きギャップ（%, 前日終値→当日始値）
  gap: number;
  // 前夜の米国市場・為替（当日分に結合。データなしはnull）
  prevDjiRet: number | null;
  prevIxicRet: number | null;
  fxRet: number | null;
  // その日に該当するイベントカテゴリ一覧
  events: EventCategory[];
  // 季節性フラグ
  month: number; // 1-12
  weekday: number; // 0=日,1=月...
  isMonthStart: boolean; // 月初3営業日
  isMonthEnd: boolean; // 月末3営業日
  isFiscalYearEnd: boolean; // 3月末3営業日
  isFiscalYearStart: boolean; // 4月初3営業日
}

export interface DataCoverage {
  code: InstrumentCode;
  count: number;
  first: ISODate | null;
  last: ISODate | null;
}

export type DataMode = "sample" | "real";
