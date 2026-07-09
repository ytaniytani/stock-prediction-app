// サンプル（架空）データ生成器
//
// 実データ（Stooq / Yahoo Finance / FRED 等）は本サンドボックス環境のネットワーク
// ポリシーにより取得できないため、統計的な性質（ボラティリティクラスタ、銘柄間の
// 相関、たまに起こる急落）だけを模した「架空の」日足データを乱数から生成する。
// 値そのものに歴史的な意味は一切ない。UI側では常に「サンプルデータ」であることを
// 明示すること。
import type { InstrumentCode, OHLC } from "./types";
import { businessDayRange, toISO } from "../lib/dateUtils";

// mulberry32: シード固定の軽量PRNG（再現性のため）
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  // Box-Muller
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

interface GenConfig {
  code: InstrumentCode;
  seed: number;
  start: number; // 開始値
  driftAnnual: number; // 年率ドリフト
  volAnnual: number; // 年率ボラティリティ
  volOfVol: number; // ボラティリティのクラスタ強度
  crashProb: number; // 1日あたりの急変ショック発生確率
  crashScale: number; // 急変ショックの大きさ（標準偏差倍率）
  meanRevertToStart?: number; // 為替のようにレンジ相場にしたい場合の弱い平均回帰係数
}

const TRADING_DAYS = 252;

function generateSeries(cfg: GenConfig, dates: string[]): OHLC[] {
  const rand = mulberry32(cfg.seed);
  const dailyDrift = cfg.driftAnnual / TRADING_DAYS;
  const dailyVolBase = cfg.volAnnual / Math.sqrt(TRADING_DAYS);

  let level = cfg.start;
  let volState = dailyVolBase; // 確率的ボラティリティ（GARCH風の簡易近似）
  const rows: OHLC[] = [];

  for (const date of dates) {
    // ボラティリティのクラスタリング: 前日ボラに寄せつつランダムに揺らす
    volState = volState * 0.9 + dailyVolBase * 0.1 + Math.abs(gaussian(rand)) * dailyVolBase * cfg.volOfVol * 0.1;
    let shock = gaussian(rand) * volState;

    // まれに急変（ショック）を混ぜる
    if (rand() < cfg.crashProb) {
      shock += gaussian(rand) * volState * cfg.crashScale * (rand() < 0.5 ? -1 : 1);
    }

    let drift = dailyDrift;
    if (cfg.meanRevertToStart) {
      drift += (Math.log(cfg.start) - Math.log(level)) * cfg.meanRevertToStart;
    }

    const logRet = drift + shock;
    const open = level;
    level = level * Math.exp(logRet);
    const close = level;

    // 日中高安は始値・終値の外側にランダムに少し広げる
    const range = Math.abs(close - open) * (0.3 + rand() * 0.9) + open * volState * 0.5 * rand();
    const high = Math.max(open, close) + range * rand();
    const low = Math.min(open, close) - range * rand();

    rows.push({
      date,
      open: round2(open),
      high: round2(high),
      low: round2(Math.max(low, 1)),
      close: round2(close),
    });
  }
  return rows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// 銘柄ごとの生成パラメータ。日経225先物はN225現物に薄いノイズを乗せて近似する。
const CONFIGS: Record<Exclude<InstrumentCode, "N225F">, GenConfig> = {
  N225: { code: "N225", seed: 1001, start: 20000, driftAnnual: 0.04, volAnnual: 0.19, volOfVol: 1.4, crashProb: 0.006, crashScale: 5 },
  DJI: { code: "DJI", seed: 2002, start: 5000, driftAnnual: 0.07, volAnnual: 0.16, volOfVol: 1.3, crashProb: 0.005, crashScale: 5 },
  IXIC: { code: "IXIC", seed: 3003, start: 1000, driftAnnual: 0.09, volAnnual: 0.22, volOfVol: 1.5, crashProb: 0.006, crashScale: 5.5 },
  TOPX: { code: "TOPX", seed: 4004, start: 1600, driftAnnual: 0.03, volAnnual: 0.17, volOfVol: 1.3, crashProb: 0.006, crashScale: 4.5 },
  USDJPY: { code: "USDJPY", seed: 5005, start: 100, driftAnnual: 0.01, volAnnual: 0.08, volOfVol: 1.1, crashProb: 0.003, crashScale: 3, meanRevertToStart: 0.002 },
};

export function generateSampleDataset(yearsBack = 30): Record<InstrumentCode, OHLC[]> {
  const today = new Date();
  const end = toISO(today);
  const start = toISO(new Date(today.getFullYear() - yearsBack, today.getMonth(), today.getDate()));
  const dates = businessDayRange(start, end);

  const base = {} as Record<Exclude<InstrumentCode, "N225F">, OHLC[]>;
  for (const key of Object.keys(CONFIGS) as (keyof typeof CONFIGS)[]) {
    base[key] = generateSeries(CONFIGS[key], dates);
  }

  // 日経225先物 = 現物にわずかなノイズ（ベーシス）を加えて近似生成
  const randF = mulberry32(6006);
  const n225f: OHLC[] = base.N225.map((row) => {
    const basis = 1 + (randF() - 0.5) * 0.004;
    return {
      date: row.date,
      open: round2(row.open * basis),
      high: round2(row.high * basis),
      low: round2(row.low * basis),
      close: round2(row.close * basis),
    };
  });

  return {
    N225: base.N225,
    N225F: n225f,
    DJI: base.DJI,
    IXIC: base.IXIC,
    TOPX: base.TOPX,
    USDJPY: base.USDJPY,
  };
}
