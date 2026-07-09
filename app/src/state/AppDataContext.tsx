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
    if (!hasAny) {
      // 初回起動: サンプルデータを自動投入して即座に触れるようにする
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
