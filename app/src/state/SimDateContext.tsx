import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useAppData } from "./AppDataContext";

interface SimDateValue {
  asOfIndex: number; // rows配列中の「今日」に相当するインデックス
  isSimulated: boolean; // ライブ（最新日）でない場合true
  asOfDate: string | null;
  setAsOfDate: (date: string | null) => void; // null = ライブに戻す
  liveIndex: number;
}

const SimDateContext = createContext<SimDateValue | null>(null);

export function SimDateProvider({ children }: { children: ReactNode }) {
  const { rows } = useAppData();
  const [override, setOverride] = useState<string | null>(null);

  const liveIndex = rows.length - 1;

  const asOfIndex = useMemo(() => {
    if (override === null) return liveIndex;
    // override日付に最も近い(以前の)インデックスを探す
    let idx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].date <= override) idx = i;
      else break;
    }
    return idx >= 0 ? idx : liveIndex;
  }, [override, rows, liveIndex]);

  const value: SimDateValue = {
    asOfIndex,
    isSimulated: override !== null && asOfIndex !== liveIndex,
    asOfDate: rows[asOfIndex]?.date ?? null,
    setAsOfDate: setOverride,
    liveIndex,
  };

  return <SimDateContext.Provider value={value}>{children}</SimDateContext.Provider>;
}

export function useSimDate(): SimDateValue {
  const ctx = useContext(SimDateContext);
  if (!ctx) throw new Error("useSimDate must be used within SimDateProvider");
  return ctx;
}
