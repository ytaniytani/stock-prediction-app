import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useActivePattern } from "../state/ActivePatternContext";
import { PRESETS, emptyCustomPreset } from "../data/presets";
import {
  evaluatePattern,
  NUMERIC_FIELD_LABEL,
  checkStability,
  type Condition,
  type NumericField,
  type NumericCondition,
} from "../data/stats";
import type { EventCategory } from "../data/types";
import { EVENT_META } from "../data/eventCalendar";
import { InfoTip } from "../components/InfoTip";
import { ScoreBadge } from "../components/ScoreBadge";
import { Histogram } from "../charts/Histogram";
import { formatJP } from "../lib/dateUtils";

const NUMERIC_FIELDS: NumericField[] = Object.keys(NUMERIC_FIELD_LABEL) as NumericField[];
const EVENT_CATEGORIES = Object.keys(EVENT_META) as EventCategory[];

function ConditionRow({ cond, onChange, onRemove }: { cond: NumericCondition; onChange: (c: NumericCondition) => void; onRemove: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
      <select value={cond.field} onChange={(e) => onChange({ ...cond, field: e.target.value as NumericField })}>
        {NUMERIC_FIELDS.map((f) => (
          <option key={f} value={f}>
            {NUMERIC_FIELD_LABEL[f]}
          </option>
        ))}
      </select>
      <select value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as NumericCondition["op"] })}>
        <option value=">=">以上 (≥)</option>
        <option value="<=">以下 (≤)</option>
        <option value=">">超 (＞)</option>
        <option value="<">未満 (＜)</option>
      </select>
      <input type="number" step="0.1" value={cond.value} onChange={(e) => onChange({ ...cond, value: Number(e.target.value) })} style={{ width: 90 }} />
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>%（または該当単位）</span>
      <button className="btn btn-sm" onClick={onRemove}>
        削除
      </button>
    </div>
  );
}

export function PatternSearchScreen() {
  const { rows, closes } = useAppData();
  const { pattern, setPattern } = useActivePattern();

  const [presetId, setPresetId] = useState<string>("down5-20");
  const [conditions, setConditions] = useState<Condition[]>(pattern.conditions);
  const [horizon, setHorizon] = useState<number>(pattern.horizon);
  const [selectedEvents, setSelectedEvents] = useState<EventCategory[]>(pattern.eventCategories);
  const [seasonMonthStart, setSeasonMonthStart] = useState(false);
  const [seasonMonthEnd, setSeasonMonthEnd] = useState(false);
  const [seasonFyEnd, setSeasonFyEnd] = useState(false);
  const [seasonFyStart, setSeasonFyStart] = useState(false);

  function applyPreset(id: string) {
    setPresetId(id);
    if (id === "custom") {
      const p = emptyCustomPreset();
      setConditions(p.conditions);
      setHorizon(p.horizon);
      return;
    }
    const p = PRESETS.find((x) => x.id === id);
    if (p) {
      setConditions(p.conditions.filter((c) => c.kind === "numeric"));
      setHorizon(p.horizon);
    }
  }

  const seasonConditions: Condition[] = useMemo(() => {
    const list: Condition[] = [];
    if (seasonMonthStart) list.push({ kind: "season", type: "monthStart" });
    if (seasonMonthEnd) list.push({ kind: "season", type: "monthEnd" });
    if (seasonFyEnd) list.push({ kind: "season", type: "fyEnd" });
    if (seasonFyStart) list.push({ kind: "season", type: "fyStart" });
    return list;
  }, [seasonMonthStart, seasonMonthEnd, seasonFyEnd, seasonFyStart]);

  const allConditions = useMemo(() => [...conditions, ...seasonConditions], [conditions, seasonConditions]);

  const result = useMemo(
    () => evaluatePattern(rows, closes, allConditions, horizon, selectedEvents),
    [rows, closes, allConditions, horizon, selectedEvents]
  );
  const stability = useMemo(() => checkStability(result), [result]);

  const resolvedRets = result.matches.filter((m) => m.fwdReturn !== null).map((m) => m.fwdReturn as number);

  function toggleEvent(cat: EventCategory) {
    setSelectedEvents((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  function saveAsActivePattern() {
    const label = presetId === "custom" ? "カスタム条件" : PRESETS.find((p) => p.id === presetId)?.label ?? "パターン";
    const description = presetId === "custom" ? "条件ビルダーで組み立てた条件" : PRESETS.find((p) => p.id === presetId)?.description ?? "";
    setPattern({ label, description, conditions: allConditions, eventCategories: selectedEvents, horizon });
  }

  return (
    <div>
      <h2>パターン検索</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>
        過去約30年の日経225先物データから、指定した条件に一致する日を探し、その後の騰落を統計的に集計します。
        <InfoTip text="条件はすべてAND（すべて満たす日のみ）で絞り込まれます。イベントのチェックボックスのみOR（いずれかに該当する日）です。" />
      </p>

      <div className="card">
        <h3>1. プリセットまたはカスタム条件を選ぶ</h3>
        <select value={presetId} onChange={(e) => applyPreset(e.target.value)} style={{ width: "100%", marginBottom: 10 }}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">カスタム条件（自分で組み立てる）</option>
        </select>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
          {presetId === "custom" ? "下の「条件を追加」で自由に条件を組み立てられます。" : PRESETS.find((p) => p.id === presetId)?.description}
        </div>

        {conditions
          .filter((c): c is NumericCondition => c.kind === "numeric")
          .map((c, i) => (
            <ConditionRow
              key={i}
              cond={c}
              onChange={(nc) =>
                setConditions((prev) => prev.map((p, idx) => (idx === i ? nc : p)))
              }
              onRemove={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        <button
          className="btn btn-sm"
          onClick={() => setConditions((prev) => [...prev, { kind: "numeric", field: "ret1", op: ">=", value: 0 }])}
        >
          ＋ 条件を追加
        </button>

        <hr className="hairline" />
        <label>
          何営業日後の騰落を見るか
          <InfoTip text="1なら翌営業日の終値、3なら3営業日後の終値と比較します。" />
        </label>
        <div style={{ marginTop: 6 }}>
          {[1, 3, 5, 10].map((h) => (
            <label key={h} style={{ marginRight: 16 }}>
              <input type="radio" checked={horizon === h} onChange={() => setHorizon(h)} /> {h}営業日後
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>
          2. 考慮する要素（任意・チェックで絞り込み）
          <InfoTip text="チェックした項目のいずれかに該当する日だけに絞り込みます。日銀会合とFOMCの両方をチェックした場合は「日銀会合の日 または FOMCの日」のいずれかに一致する日が対象になります。" />
        </h3>
        <div className="grid-2">
          {EVENT_CATEGORIES.map((cat) => {
            const meta = EVENT_META[cat];
            return (
              <div className="checkbox-row" key={cat}>
                <input type="checkbox" checked={selectedEvents.includes(cat)} onChange={() => toggleEvent(cat)} id={`ev-${cat}`} />
                <label htmlFor={`ev-${cat}`}>{meta.label}</label>
                <span className={`badge ${meta.precision === "exact" ? "badge-exact" : "badge-estimated"}`}>
                  {meta.precision === "exact" ? "確定日程" : "推定日程"}
                </span>
              </div>
            );
          })}
        </div>
        <hr className="hairline" />
        <div className="grid-2">
          <div className="checkbox-row">
            <input type="checkbox" checked={seasonMonthStart} onChange={(e) => setSeasonMonthStart(e.target.checked)} id="s-mstart" />
            <label htmlFor="s-mstart">月初（3営業日以内）</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" checked={seasonMonthEnd} onChange={(e) => setSeasonMonthEnd(e.target.checked)} id="s-mend" />
            <label htmlFor="s-mend">月末（3営業日以内）</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" checked={seasonFyEnd} onChange={(e) => setSeasonFyEnd(e.target.checked)} id="s-fyend" />
            <label htmlFor="s-fyend">年度末（3月末）</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" checked={seasonFyStart} onChange={(e) => setSeasonFyStart(e.target.checked)} id="s-fystart" />
            <label htmlFor="s-fystart">年度初（4月初）</label>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>3. 結果</h3>
        <div style={{ fontSize: 15, marginBottom: 4 }}>
          該当件数 n=<strong>{result.n}</strong>
          {result.nExcludedRecent > 0 && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}> （直近{result.nExcludedRecent}件は結果がまだ確定していないため除外）</span>
          )}
        </div>
        {result.n < 30 && (
          <div className="sample-banner">⚠ サンプル数が30件未満です。この確率は参考値として扱ってください。</div>
        )}
        {result.n > 0 && (
          <>
            <div style={{ fontSize: 22, marginBottom: 8 }}>
              <ScoreBadge upProb={result.upProb} n={result.n} /> （95%信頼区間 {(result.ci[0] * 100).toFixed(1)}〜{(result.ci[1] * 100).toFixed(1)}%）
              <InfoTip text="信頼区間とは「本当の確率はだいたいこの範囲内にある可能性が高い」という統計的な幅です。サンプル数が少ないほどこの幅は広くなります。" />
            </div>
            <table className="kv-table">
              <tbody>
                <tr>
                  <td>平均リターン</td>
                  <td>{result.meanReturn >= 0 ? "+" : ""}{result.meanReturn.toFixed(2)}%</td>
                </tr>
                <tr>
                  <td>中央値リターン</td>
                  <td>{result.medianReturn >= 0 ? "+" : ""}{result.medianReturn.toFixed(2)}%</td>
                </tr>
                <tr>
                  <td>最大上昇</td>
                  <td className="score-up">+{result.maxReturn.toFixed(2)}%</td>
                </tr>
                <tr>
                  <td>最大下落</td>
                  <td className="score-down">{result.minReturn.toFixed(2)}%</td>
                </tr>
              </tbody>
            </table>

            <h4 style={{ marginTop: 16 }}>騰落率の分布</h4>
            <Histogram values={resolvedRets} />

            <h4 style={{ marginTop: 16 }}>
              期間別の安定性チェック
              <InfoTip text="全期間を前期・中期・後期の3つに分け、それぞれで上昇確率を再計算します。期間によって確率が大きく違う場合は「昔だけ通用したパターン」の可能性があるため『不安定』と表示します。" />
            </h4>
            {stability.insufficientData ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>期間分割するにはサンプル数が不足しています。</div>
            ) : (
              <>
                <span className={`badge ${stability.stable ? "badge-real" : "badge-sample"}`}>
                  {stability.stable ? "✓ 期間を通じて比較的安定" : "⚠ 期間によるばらつきが大きい"}
                </span>
                <table className="kv-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>期間</th>
                      <th>n</th>
                      <th>上昇確率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stability.buckets.map((b) => (
                      <tr key={b.label}>
                        <td>{b.label}</td>
                        <td>{b.n}</td>
                        <td>{Number.isNaN(b.upProb) ? "-" : `${(b.upProb * 100).toFixed(1)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <h4 style={{ marginTop: 16 }}>該当日（新しい順・最大10件）</h4>
            <table className="kv-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>結果（{horizon}営業日後）</th>
                </tr>
              </thead>
              <tbody>
                {[...result.matches]
                  .reverse()
                  .slice(0, 10)
                  .map((m) => (
                    <tr key={m.date}>
                      <td>{formatJP(m.date)}</td>
                      <td className={m.fwdReturn === null ? "" : m.fwdReturn >= 0 ? "score-up" : "score-down"}>
                        {m.fwdReturn === null ? "未確定" : `${m.fwdReturn >= 0 ? "+" : ""}${m.fwdReturn.toFixed(2)}%`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={saveAsActivePattern}>
                このパターンを「事例ビューア」「バックテスト」「時代別分析」で使う
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
