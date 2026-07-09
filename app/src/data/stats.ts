import type { EventCategory, FeatureRow } from "./types";

export type NumericField =
  | "ret1"
  | "ret3"
  | "ret5"
  | "ret10"
  | "ret20"
  | "streakDays"
  | "streakReturn"
  | "maDev5"
  | "maDev25"
  | "maDev75"
  | "vol20"
  | "gap"
  | "prevDjiRet"
  | "prevIxicRet"
  | "fxRet";

export const NUMERIC_FIELD_LABEL: Record<NumericField, string> = {
  ret1: "前日比(1日)騰落率",
  ret3: "3日騰落率",
  ret5: "5日騰落率",
  ret10: "10日騰落率",
  ret20: "20日騰落率",
  streakDays: "連続陽線/陰線日数",
  streakReturn: "連続騰落の合計率",
  maDev5: "5日移動平均乖離率",
  maDev25: "25日移動平均乖離率",
  maDev75: "75日移動平均乖離率",
  vol20: "20日ボラティリティ",
  gap: "寄り付きギャップ率",
  prevDjiRet: "前夜NYダウ騰落率",
  prevIxicRet: "前夜NASDAQ騰落率",
  fxRet: "ドル円騰落率",
};

export interface NumericCondition {
  kind: "numeric";
  field: NumericField;
  op: ">=" | "<=" | ">" | "<";
  value: number;
}
export interface SeasonCondition {
  kind: "season";
  type: "month" | "weekday" | "monthStart" | "monthEnd" | "fyEnd" | "fyStart";
  value?: number;
}
export type Condition = NumericCondition | SeasonCondition;

// イベントカテゴリは条件のAND列とは別枠で扱う。複数チェックした場合は
// 「いずれかに該当する日」(OR)として絞り込む方が実用的なため。
export function matchRow(row: FeatureRow, conditions: Condition[], eventCategories: EventCategory[] = []): boolean {
  for (const c of conditions) {
    if (c.kind === "numeric") {
      const v = row[c.field];
      if (v === null || Number.isNaN(v)) return false;
      if (c.op === ">=" && !(v >= c.value)) return false;
      if (c.op === "<=" && !(v <= c.value)) return false;
      if (c.op === ">" && !(v > c.value)) return false;
      if (c.op === "<" && !(v < c.value)) return false;
    } else if (c.kind === "season") {
      if (c.type === "month" && row.month !== c.value) return false;
      if (c.type === "weekday" && row.weekday !== c.value) return false;
      if (c.type === "monthStart" && !row.isMonthStart) return false;
      if (c.type === "monthEnd" && !row.isMonthEnd) return false;
      if (c.type === "fyEnd" && !row.isFiscalYearEnd) return false;
      if (c.type === "fyStart" && !row.isFiscalYearStart) return false;
    }
  }
  if (eventCategories.length > 0 && !row.events.some((e) => eventCategories.includes(e))) return false;
  return true;
}

// Wilson score interval（95%）: 少数サンプルでも過信させない区間推定
export function wilsonInterval(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const phat = successes / n;
  const denom = 1 + (z * z) / n;
  const center = phat + (z * z) / (2 * n);
  const adj = z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (center - adj) / denom), Math.min(1, (center + adj) / denom)];
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// n日後のクローズ→クローズ騰落率(%)。データが尽きている場合はnull
export function forwardReturn(closes: number[], index: number, horizon: number): number | null {
  const j = index + horizon;
  if (j >= closes.length) return null;
  return ((closes[j] - closes[index]) / closes[index]) * 100;
}

export interface MatchInstance {
  date: string;
  index: number;
  fwdReturn: number | null;
}

export interface PatternResult {
  n: number; // フォワードリターンが確定しているサンプル数
  nExcludedRecent: number; // 直近すぎてまだ結果が確定していない件数
  upProb: number;
  ci: [number, number];
  meanReturn: number;
  medianReturn: number;
  maxReturn: number;
  minReturn: number;
  matches: MatchInstance[];
}

export function evaluatePattern(
  rows: FeatureRow[],
  closes: number[],
  conditions: Condition[],
  horizon: number,
  eventCategories: EventCategory[] = []
): PatternResult {
  const matches: MatchInstance[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (matchRow(rows[i], conditions, eventCategories)) {
      matches.push({ date: rows[i].date, index: i, fwdReturn: forwardReturn(closes, i, horizon) });
    }
  }
  const resolved = matches.filter((m) => m.fwdReturn !== null) as (MatchInstance & { fwdReturn: number })[];
  const rets = resolved.map((m) => m.fwdReturn);
  const upCount = rets.filter((r) => r > 0).length;
  const n = resolved.length;

  return {
    n,
    nExcludedRecent: matches.length - n,
    upProb: n > 0 ? upCount / n : NaN,
    ci: wilsonInterval(upCount, n),
    meanReturn: mean(rets),
    medianReturn: median(rets),
    maxReturn: rets.length ? Math.max(...rets) : NaN,
    minReturn: rets.length ? Math.min(...rets) : NaN,
    matches,
  };
}

// 期間を3分割し、前・中・後期でupProbがどれだけ変動するかを見る安定性チェック
export interface StabilityCheck {
  buckets: { label: string; n: number; upProb: number }[];
  stable: boolean; // n>=10のバケット同士でupProbの差が0.3未満ならtrue
  insufficientData: boolean;
}

export function checkStability(result: PatternResult): StabilityCheck {
  const resolved = result.matches.filter((m) => m.fwdReturn !== null) as (MatchInstance & { fwdReturn: number })[];
  if (resolved.length < 6) {
    return { buckets: [], stable: false, insufficientData: true };
  }
  const chunkSize = Math.ceil(resolved.length / 3);
  const labels = ["前期", "中期", "後期"];
  const buckets = [0, 1, 2].map((i) => {
    const slice = resolved.slice(i * chunkSize, (i + 1) * chunkSize);
    const up = slice.filter((m) => m.fwdReturn > 0).length;
    return { label: labels[i], n: slice.length, upProb: slice.length ? up / slice.length : NaN };
  });
  const valid = buckets.filter((b) => b.n >= 10 && !Number.isNaN(b.upProb));
  let stable = true;
  if (valid.length >= 2) {
    const probs = valid.map((b) => b.upProb);
    stable = Math.max(...probs) - Math.min(...probs) < 0.3;
  }
  return { buckets, stable, insufficientData: valid.length < 2 };
}

// ── k近傍法による「似ている日」ランキング ──
export interface SimilarDay {
  date: string;
  index: number;
  distance: number;
  fwdReturn: number | null; // outcomeFnの結果（呼び出し文脈により「翌日の騰落」だったり「当日の場中の騰落」だったりする）
}

export const KNN_FIELDS_DEFAULT: NumericField[] = ["ret1", "ret3", "ret5", "ret10", "ret20", "maDev5", "maDev25", "vol20", "gap"];
export const KNN_FIELDS_MOMENTUM: NumericField[] = ["ret1", "vol20", "gap", "streakReturn"];
export const KNN_FIELDS_OVERNIGHT: NumericField[] = ["gap", "streakDays", "streakReturn", "prevDjiRet", "prevIxicRet", "vol20"];

// poolEndExclusive: 正規化統計と候補プールをこのインデックスより前に限定する。
// タイムマシン機能で「その時点までしか知らなかった」状態を再現するために使う
// （省略時は全期間＝ライブ運用相当）。outcomeFnで「何をもって結果とするか」を差し替えられる
// （翌日クローズ比較、当日場中比較など）。
export function findSimilarDaysGeneric(
  rows: FeatureRow[],
  currentIndex: number,
  outcomeFn: (index: number) => number | null,
  fields: NumericField[],
  k = 5,
  poolEndExclusive: number = rows.length
): SimilarDay[] {
  const poolIndices: number[] = [];
  for (let i = 0; i < Math.min(poolEndExclusive, rows.length); i++) {
    if (i !== currentIndex) poolIndices.push(i);
  }

  const stats = fields.map((f) => {
    const vals = poolIndices.map((i) => rows[i][f]).filter((v) => !Number.isNaN(v)) as number[];
    return { field: f, m: mean(vals), s: stdev(vals) || 1 };
  });

  function vector(row: FeatureRow): number[] | null {
    const v: number[] = [];
    for (const { field, m, s } of stats) {
      const raw = row[field];
      if (raw === null || Number.isNaN(raw)) return null;
      v.push((raw - m) / s);
    }
    return v;
  }

  const target = vector(rows[currentIndex]);
  if (!target) return [];

  const candidates: SimilarDay[] = [];
  for (const i of poolIndices) {
    const v = vector(rows[i]);
    if (!v) continue;
    let d = 0;
    for (let k2 = 0; k2 < v.length; k2++) d += (v[k2] - target[k2]) ** 2;
    candidates.push({ date: rows[i].date, index: i, distance: Math.sqrt(d), fwdReturn: outcomeFn(i) });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, k);
}

export function findSimilarDays(
  rows: FeatureRow[],
  closes: number[],
  currentIndex: number,
  horizon: number,
  k = 5,
  poolEndExclusive: number = rows.length
): SimilarDay[] {
  return findSimilarDaysGeneric(rows, currentIndex, (i) => forwardReturn(closes, i, horizon), KNN_FIELDS_DEFAULT, k, poolEndExclusive);
}

export interface KnnScoreResult {
  n: number;
  upProb: number;
  ci: [number, number];
  meanReturn: number;
  similar: SimilarDay[];
}

function summarize(similar: SimilarDay[]): KnnScoreResult {
  const resolved = similar.filter((s) => s.fwdReturn !== null) as (SimilarDay & { fwdReturn: number })[];
  const rets = resolved.map((s) => s.fwdReturn);
  const up = rets.filter((r) => r > 0).length;
  return {
    n: resolved.length,
    upProb: resolved.length ? up / resolved.length : NaN,
    ci: wilsonInterval(up, resolved.length),
    meanReturn: mean(rets),
    similar,
  };
}

// 「明日」カード用: 幅広い特徴量で、翌営業日クローズ比較の確率を見る
export function knnScore(rows: FeatureRow[], closes: number[], asOfIndex: number, horizon: number, poolEndExclusive: number, k = 40): KnnScoreResult {
  const similar = findSimilarDaysGeneric(rows, asOfIndex, (i) => forwardReturn(closes, i, horizon), KNN_FIELDS_DEFAULT, k, poolEndExclusive);
  return summarize(similar);
}

// 「今」カード用: 直近モメンタムだけに絞った、より短期・敏感な一致で翌営業日を見る
export function knnMomentumScore(rows: FeatureRow[], closes: number[], asOfIndex: number, poolEndExclusive: number, k = 30): KnnScoreResult {
  const similar = findSimilarDaysGeneric(rows, asOfIndex, (i) => forwardReturn(closes, i, 1), KNN_FIELDS_MOMENTUM, k, poolEndExclusive);
  return summarize(similar);
}

// 「今日」カード用: 前夜の海外市場・寄り付きギャップに絞り、当日の場中(始値→終値)の結果を見る
export function knnIntradayScore(
  rows: FeatureRow[],
  primaryOhlc: { open: number; close: number }[],
  asOfIndex: number,
  poolEndExclusive: number,
  k = 30
): KnnScoreResult {
  const intraday = (i: number): number | null => {
    if (i >= primaryOhlc.length) return null;
    const { open, close } = primaryOhlc[i];
    return ((close - open) / open) * 100;
  };
  const similar = findSimilarDaysGeneric(rows, asOfIndex, intraday, KNN_FIELDS_OVERNIGHT, k, poolEndExclusive);
  return summarize(similar);
}

// ── バックテスト ──
export interface BacktestResult {
  trades: { date: string; ret: number }[];
  equityCurve: { date: string; equity: number }[];
  winRate: number;
  avgReturn: number;
  maxDrawdownPct: number;
  netEvPerTrade: number; // 手数料・スリッページ控除後
  sharpeLike: number;
}

export function runBacktest(result: PatternResult, feeSlippagePct: number): BacktestResult {
  const resolved = result.matches.filter((m) => m.fwdReturn !== null) as (MatchInstance & { fwdReturn: number })[];
  const trades = resolved.map((m) => ({ date: m.date, ret: m.fwdReturn - feeSlippagePct }));

  let equity = 100;
  let peak = 100;
  let maxDd = 0;
  const equityCurve = trades.map((t) => {
    equity *= 1 + t.ret / 100;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
    return { date: t.date, equity };
  });

  const rets = trades.map((t) => t.ret);
  const win = rets.filter((r) => r > 0).length;

  return {
    trades,
    equityCurve,
    winRate: rets.length ? win / rets.length : NaN,
    avgReturn: mean(rets),
    maxDrawdownPct: maxDd * 100,
    netEvPerTrade: mean(rets),
    sharpeLike: rets.length > 1 ? mean(rets) / (stdev(rets) || NaN) : NaN,
  };
}

// ── ケリー基準（簡易・上限キャップ付き） ──
export function kellyFraction(winProb: number, avgWinPct: number, avgLossPct: number): number {
  if (avgLossPct >= 0 || avgWinPct <= 0 || Number.isNaN(winProb)) return 0;
  const b = avgWinPct / Math.abs(avgLossPct);
  const f = winProb - (1 - winProb) / b;
  return Math.max(0, Math.min(f, 0.5)); // 過大リスク防止のため50%を上限にキャップ
}

// ── 損切り前提の期待値 ──
export function stopLossAdjustedEv(rets: number[], stopLossPct: number): number {
  const clipped = rets.map((r) => Math.max(-Math.abs(stopLossPct), r));
  return mean(clipped);
}

// ── ウォークフォワード検証（タイムマシン機能の核） ──
// 「その日まで知り得た情報だけ」でknnScoreによる予測を行い、実際の結果と照合する。
// これにより「今/明日」ダッシュボードの判定手法そのものが過去どれくらい当たっていたかを検証できる。
export interface WalkForwardResult {
  tested: number; // 判定を出せた日数
  skippedLowSample: number; // n不足で判定を保留した日数
  correct: number;
  hitRate: number;
  avgReturnWhenCalledUp: number;
  avgReturnWhenCalledDown: number;
  timeline: { date: string; predictedUpProb: number; actual: number | null; correct: boolean | null }[];
}

export function runWalkForwardValidation(
  rows: FeatureRow[],
  closes: number[],
  startIndex: number,
  endIndex: number,
  horizon: number,
  stride = 1,
  minN = 15
): WalkForwardResult {
  let tested = 0;
  let skippedLowSample = 0;
  let correct = 0;
  const upRets: number[] = [];
  const downRets: number[] = [];
  const timeline: WalkForwardResult["timeline"] = [];

  for (let i = startIndex; i <= endIndex; i += stride) {
    const score = knnScore(rows, closes, i, horizon, i, 40);
    const actual = forwardReturn(closes, i, horizon);
    if (score.n < minN || Number.isNaN(score.upProb)) {
      skippedLowSample++;
      timeline.push({ date: rows[i].date, predictedUpProb: NaN, actual, correct: null });
      continue;
    }
    if (actual === null) {
      timeline.push({ date: rows[i].date, predictedUpProb: score.upProb, actual: null, correct: null });
      continue;
    }
    const predictedUp = score.upProb > 0.5;
    const isCorrect = predictedUp ? actual > 0 : actual < 0;
    tested++;
    if (isCorrect) correct++;
    if (predictedUp) upRets.push(actual);
    else downRets.push(actual);
    timeline.push({ date: rows[i].date, predictedUpProb: score.upProb, actual, correct: isCorrect });
  }

  return {
    tested,
    skippedLowSample,
    correct,
    hitRate: tested > 0 ? correct / tested : NaN,
    avgReturnWhenCalledUp: mean(upRets),
    avgReturnWhenCalledDown: mean(downRets),
    timeline,
  };
}
