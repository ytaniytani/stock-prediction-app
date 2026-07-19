import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CalendarEvent, DataCoverage, DataMode, InstrumentCode, OHLC } from "../data/types";
import { INSTRUMENTS } from "../data/types";
import { generateSampleDataset } from "../data/sampleData";
import { buildEventCalendar } from "../data/eventCalendar";
import { computeFeatures, type FeatureContext } from "../data/features";
import type { FeatureRow } from "../data/types";
import { getDataMode, loadAllSeries, saveSeries, setDataMode as persistDataMode, getMeta, setMeta } from "../data/db";
import { parseOhlcCsv } from "../data/csvImport";

const ALL_CODES: InstrumentCode[] = INSTRUMENTS.map((i) => i.code);

function mergeByDate(existing: OHLC[], incoming: OHLC[]): OHLC[] {
  const map = new Map(existing.map((r) => [r.date, r]));
  for (const r of incoming) map.set(r.date, r);
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// サイトに同梱された実データCSV（/data/<CODE>.csv）を取得する。
// 公開サイトではGitHub Actionsが毎営業日これを最新化している。
// 開発サーバー等でファイルが無い場合は該当銘柄をスキップする。
async function fetchBundledSeries(): Promise<Partial<Record<InstrumentCode, OHLC[]>>> {
  const results = await Promise.all(
    ALL_CODES.map(async (code) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/${code}.csv`, { cache: "no-cache" });
        if (!res.ok) return null;
        const text = await res.text();
        // SPAサーバーがindex.htmlを200で返すケースを除外
        if (!/^date,/i.test(text.trimStart())) return null;
        const parsed = parseOhlcCsv(text);
        if (parsed.errors.length > 0 || parsed.rows.length === 0) return null;
        return [code, parsed.rows] as const;
      } catch {
        return null;
      }
    })
  );
  const out: Partial<Record<InstrumentCode, OHLC[]>> = {};
  for (const r of results) if (r) out[r[0]] = r[1];
  return out;
}

// 同梱データをbaseへマージして保存し、データモードを実データにする。
// baseにはサンプルデータを渡さないこと（実データと混ざるため）。
async function applyBundledData(
  bundled: Partial<Record<InstrumentCode, OHLC[]>>,
  base: Partial<Record<InstrumentCode, OHLC[]>>
): Promise<Record<InstrumentCode, OHLC[]>> {
  const next = { ...base } as Record<InstrumentCode, OHLC[]>;
  for (const code of Object.keys(bundled) as InstrumentCode[]) {
    next[code] = mergeByDate(base[code] ?? [], bundled[code]!);
  }
  for (const code of ALL_CODES) {
    await saveSeries(code, next[code] ?? []);
  }
  await persistDataMode("real");
  return next;
}

interface AppDataValue {
  loading: boolean;
  dataMode: DataMode;
  series: Record<InstrumentCode, OHLC[]>;
  coverage: DataCoverage[];
  events: CalendarEvent[];
  rows: FeatureRow[];
  closes: number[];
  primaryCode: InstrumentCode;
  feeSlippagePct: number;
  setFeeSlippagePct: (v: number) => void;
  importCsv: (code: InstrumentCode, text: string) => Promise<{ added: number; skipped: number; errors: string[] }>;
  syncBundledData: () => Promise<string>;
  resetToSampleData: () => Promise<void>;
  clearInstrument: (code: InstrumentCode) => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [dataMode, setDataModeState] = useState<DataMode>("sample");
  const [series, setSeries] = useState<Record<InstrumentCode, OHLC[]>>({} as Record<InstrumentCode, OHLC[]>);
  const [feeSlippagePct, setFeeSlippagePct] = useState(0.06);
  const events = useMemo(() => buildEventCalendar(), []);

  const loadFromDb = useCallback(async () => {
    const mode = await getDataMode();
    const stored = await loadAllSeries(ALL_CODES);
    const hasAny = ALL_CODES.some((c) => (stored[c]?.length ?? 0) > 0);

    // サイト同梱の実データがあれば起動時に自動で取り込み・最新化する
    const bundled = await fetchBundledSeries();
    if (Object.keys(bundled).length > 0) {
      // サンプルデータはベースにしない（実データと混ざるため破棄する）
      const base = mode === "real" && hasAny ? (stored as Partial<Record<InstrumentCode, OHLC[]>>) : {};
      const next = await applyBundledData(bundled, base);
      setDataModeState("real");
      setSeries(next);
    } else if (!hasAny) {
      // 初回起動かつ同梱データも無い場合: サンプルデータを自動投入して即座に触れるようにする
      const sample = generateSampleDataset(30);
      for (const code of ALL_CODES) {
        await saveSeries(code, sample[code]);
      }
      await persistDataMode("sample");
      setDataModeState("sample");
      setSeries(sample);
    } else {
      setDataModeState(mode);
      setSeries(stored as Record<InstrumentCode, OHLC[]>);
    }
    const savedFee = await getMeta<number>("feeSlippagePct", 0.06);
    setFeeSlippagePct(savedFee);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFromDb();
  }, [loadFromDb]);

  const importCsv = useCallback(
    async (code: InstrumentCode, text: string) => {
      const result = parseOhlcCsv(text);
      if (result.errors.length > 0 || result.rows.length === 0) {
        return { added: 0, skipped: result.skipped, errors: result.errors.length ? result.errors : ["有効な行がありませんでした"] };
      }
      // 既存データとマージ（同日付は新しい方で上書き）
      const existing = series[code] ?? [];
      const map = new Map(existing.map((r) => [r.date, r]));
      for (const r of result.rows) map.set(r.date, r);
      const merged = Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      await saveSeries(code, merged);
      await persistDataMode("real");
      setDataModeState("real");
      setSeries((prev) => ({ ...prev, [code]: merged }));
      return { added: result.rows.length, skipped: result.skipped, errors: [] };
    },
    [series]
  );

  const syncBundledData = useCallback(async (): Promise<string> => {
    const bundled = await fetchBundledSeries();
    const codes = Object.keys(bundled) as InstrumentCode[];
    if (codes.length === 0) {
      return "サイト同梱データを取得できませんでした（公開サイト上でのみ利用できます）。";
    }
    const base = dataMode === "real" ? (series as Partial<Record<InstrumentCode, OHLC[]>>) : {};
    const next = await applyBundledData(bundled, base);
    setDataModeState("real");
    setSeries(next);
    return codes.map((c) => `✓ ${c}: 累計${next[c].length}件`).join(" / ");
  }, [dataMode, series]);

  const resetToSampleData = useCallback(async () => {
    setLoading(true);
    const sample = generateSampleDataset(30);
    for (const code of ALL_CODES) {
      await saveSeries(code, sample[code]);
    }
    await persistDataMode("sample");
    setDataModeState("sample");
    setSeries(sample);
    setLoading(false);
  }, []);

  const clearInstrument = useCallback(async (code: InstrumentCode) => {
    await saveSeries(code, []);
    setSeries((prev) => ({ ...prev, [code]: [] }));
  }, []);

  const updateFeeSlippagePct = useCallback((v: number) => {
    setFeeSlippagePct(v);
    setMeta("feeSlippagePct", v);
  }, []);

  const coverage: DataCoverage[] = useMemo(
    () =>
      ALL_CODES.map((code) => {
        const rows = series[code] ?? [];
        return {
          code,
          count: rows.length,
          first: rows[0]?.date ?? null,
          last: rows[rows.length - 1]?.date ?? null,
        };
      }),
    [series]
  );

  const primaryCode: InstrumentCode = (series.N225F?.length ?? 0) > 0 ? "N225F" : "N225";

  const rows = useMemo(() => {
    if (loading) return [];
    const primary = series[primaryCode] ?? [];
    if (primary.length === 0) return [];
    const ctx: FeatureContext = {
      primary,
      dji: series.DJI ?? [],
      ixic: series.IXIC ?? [],
      usdjpy: series.USDJPY ?? [],
      events,
    };
    return computeFeatures(ctx);
  }, [series, primaryCode, events, loading]);

  const closes = useMemo(() => rows.map((r) => r.close), [rows]);

  const value: AppDataValue = {
    loading,
    dataMode,
    series,
    coverage,
    events,
    rows,
    closes,
    primaryCode,
    feeSlippagePct,
    setFeeSlippagePct: updateFeeSlippagePct,
    importCsv,
    syncBundledData,
    resetToSampleData,
    clearInstrument,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
