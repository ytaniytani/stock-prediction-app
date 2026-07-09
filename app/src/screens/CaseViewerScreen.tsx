import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useActivePattern } from "../state/ActivePatternContext";
import { evaluatePattern } from "../data/stats";
import { LineChart } from "../charts/LineChart";
import { InfoTip } from "../components/InfoTip";
import { formatJP } from "../lib/dateUtils";

export function CaseViewerScreen() {
  const { rows, closes } = useAppData();
  const { pattern } = useActivePattern();
  const result = useMemo(
    () => evaluatePattern(rows, closes, pattern.conditions, pattern.horizon, pattern.eventCategories),
    [rows, closes, pattern]
  );

  const matches = [...result.matches].reverse();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const selected = matches[selectedIdx];

  const contextData = useMemo(() => {
    if (!selected) return [];
    const start = Math.max(0, selected.index - 20);
    const end = Math.min(rows.length - 1, selected.index + pattern.horizon + 10);
    return rows.slice(start, end + 1).map((r) => ({ x: r.date, y: r.close }));
  }, [selected, rows, pattern.horizon]);

  return (
    <div>
      <h2>事例ビューア</h2>
      <div className="card">
        <strong>現在のパターン:</strong> {pattern.label}
        <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{pattern.description}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
          パターン検索画面で条件を変更すると、ここに表示される事例も更新されます。
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="card">該当する事例がありません。パターン検索で条件を調整してください。</div>
      ) : (
        <div className="grid-2">
          <div className="card">
            <h3>該当日一覧（{matches.length}件）</h3>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <table className="kv-table">
                <tbody>
                  {matches.map((m, i) => (
                    <tr
                      key={m.date}
                      onClick={() => {
                        setSelectedIdx(i);
                        setRevealed(false);
                      }}
                      style={{ cursor: "pointer", background: i === selectedIdx ? "var(--surface-2)" : "transparent" }}
                    >
                      <td>{formatJP(m.date)}</td>
                      <td className={m.fwdReturn === null ? "" : m.fwdReturn >= 0 ? "score-up" : "score-down"}>
                        {m.fwdReturn === null ? "未確定" : revealed || i !== selectedIdx ? `${m.fwdReturn >= 0 ? "+" : ""}${m.fwdReturn.toFixed(2)}%` : "？？？"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3>
              {selected ? formatJP(selected.date) : "-"} の前後チャート
              <InfoTip text="選んだ日を中心に、前20営業日〜結果確定後10営業日の値動きを表示します。" />
            </h3>
            {selected && (
              <>
                <LineChart data={contextData} markers={[{ x: selected.date, label: "該当日", color: "var(--status-warning)" }]} />
                <div style={{ marginTop: 12 }}>
                  {!revealed ? (
                    <>
                      <p style={{ fontSize: 13 }}>
                        この日の条件が成立した{pattern.horizon}営業日後、日経225先物は上がった？下がった？予想してから答えを見てみましょう。
                      </p>
                      <button className="btn btn-primary" onClick={() => setRevealed(true)}>
                        答えを見る
                      </button>
                    </>
                  ) : (
                    <div style={{ fontSize: 16 }}>
                      結果:{" "}
                      <strong className={selected.fwdReturn === null ? "" : selected.fwdReturn >= 0 ? "score-up" : "score-down"}>
                        {selected.fwdReturn === null ? "データ未確定" : `${selected.fwdReturn >= 0 ? "+" : ""}${selected.fwdReturn.toFixed(2)}%`}
                      </strong>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
