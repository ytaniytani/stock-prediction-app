import type { Condition } from "./stats";

export interface PatternPreset {
  id: string;
  label: string;
  description: string;
  conditions: Condition[];
  horizon: number; // 何営業日後の騰落を見るか
}

export const PRESETS: PatternPreset[] = [
  {
    id: "down3-10",
    label: "3日連続下落・合計10%超",
    description: "3営業日連続で下落し、その合計下落率が10%を超えた翌営業日の騰落を見る",
    conditions: [
      { kind: "numeric", field: "streakDays", op: "<=", value: -3 },
      { kind: "numeric", field: "streakReturn", op: "<=", value: -10 },
    ],
    horizon: 1,
  },
  {
    id: "down5-20",
    label: "5日連続下落・合計20%超",
    description: "5営業日連続で下落し、その合計下落率が20%を超えた翌営業日の騰落を見る",
    conditions: [
      { kind: "numeric", field: "streakDays", op: "<=", value: -5 },
      { kind: "numeric", field: "streakReturn", op: "<=", value: -20 },
    ],
    horizon: 1,
  },
  {
    id: "down7-15",
    label: "7日連続下落・合計15%超",
    description: "7営業日連続で下落し、その合計下落率が15%を超えた翌営業日の騰落を見る",
    conditions: [
      { kind: "numeric", field: "streakDays", op: "<=", value: -7 },
      { kind: "numeric", field: "streakReturn", op: "<=", value: -15 },
    ],
    horizon: 1,
  },
  {
    id: "gapdown2",
    label: "2%超の大幅ギャップダウン",
    description: "前日終値比2%以上下にギャップを開けて寄り付いた当日引けまでの騰落を見る",
    conditions: [{ kind: "numeric", field: "gap", op: "<=", value: -2 }],
    horizon: 1,
  },
  {
    id: "gapup2",
    label: "2%超の大幅ギャップアップ",
    description: "前日終値比2%以上上にギャップを開けて寄り付いた当日引けまでの騰落を見る",
    conditions: [{ kind: "numeric", field: "gap", op: ">=", value: 2 }],
    horizon: 1,
  },
  {
    id: "ma25dev-8",
    label: "25日移動平均から-8%以上乖離",
    description: "25日移動平均線から8%以上下に乖離した状態からの、3営業日後までの騰落を見る",
    conditions: [{ kind: "numeric", field: "maDev25", op: "<=", value: -8 }],
    horizon: 3,
  },
  {
    id: "highvol3up",
    label: "前日比±3%以上の高ボラティリティ日",
    description: "前日比3%以上動いた日の翌営業日の騰落を見る（上下いずれかの急変日）",
    conditions: [{ kind: "numeric", field: "vol20", op: ">=", value: 2.5 }],
    horizon: 1,
  },
];

export function emptyCustomPreset(): PatternPreset {
  return {
    id: "custom",
    label: "カスタム条件",
    description: "条件ビルダーで自由に組み立てた条件",
    conditions: [],
    horizon: 1,
  };
}
