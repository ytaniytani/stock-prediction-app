import { createContext, useContext, useState, type ReactNode } from "react";
import type { Condition } from "../data/stats";
import type { EventCategory } from "../data/types";
import { PRESETS } from "../data/presets";

export interface ActivePattern {
  label: string;
  description: string;
  conditions: Condition[];
  eventCategories: EventCategory[];
  horizon: number;
}

function fromPreset(): ActivePattern {
  const p = PRESETS[1]; // 「5日連続下落・合計20%超」を初期値に
  return { label: p.label, description: p.description, conditions: p.conditions, eventCategories: [], horizon: p.horizon };
}

interface Ctx {
  pattern: ActivePattern;
  setPattern: (p: ActivePattern) => void;
}

const ActivePatternContext = createContext<Ctx | null>(null);

export function ActivePatternProvider({ children }: { children: ReactNode }) {
  const [pattern, setPattern] = useState<ActivePattern>(fromPreset());
  return <ActivePatternContext.Provider value={{ pattern, setPattern }}>{children}</ActivePatternContext.Provider>;
}

export function useActivePattern(): Ctx {
  const ctx = useContext(ActivePatternContext);
  if (!ctx) throw new Error("useActivePattern must be used within ActivePatternProvider");
  return ctx;
}
