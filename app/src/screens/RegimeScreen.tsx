import { useMemo } from "react";
import { useAppData } from "../state/AppDataContext";
import { useActivePattern } from "../state/ActivePatternContext";
import { evaluatePattern, wilsonInterval, mean } from "../data/stats";
import { InfoTip } from "../components/InfoTip";

const REGIMES = [
  { label: "バブル崩壊後・失われた10年", start: "1994-01-01", end: "2003-04-30" },
  { label: "量的緩和・郵政改革期", start: "2003-05-01", end: "2007-12-31" },
  { label: "リーマンショック〜民主党政権期", start: "2008-01-01", end: "2012-11-30" },
  { label: "アベノミクス期", start: "2012-12-01", end: "2020-01-31" },
  { label: "コロナ後・世界的金融引き締め期", start: "2020-02-01", end: "2099-12-31" },
];

export function RegimeScreen() {
  const { rows, closes } = useAppData();
  const { pattern } = useActivePattern();

  const result = useMemo(
    () => evaluatePattern(rows, closes, pattern.conditions, pattern.horizon, pattern.eventCategories),
    [rows, closes, pattern]
  );

  const byRegime = useMemo(() => {
    return REGIMES.map((r) => {
      const inRange = result.matches.filter((m) => m.date >= r.start && m.date <= r.end && m.fwdReturn !== null) as (typeof result.matches[number] & {
        fwdReturn: number;
      })[];
      const rets = inRange.map((m) => m.fwdReturn);
      const up = rets.filter((x) => x > 0).length;
      return {
        ...r,
        n: rets.length,
        upProb: rets.length ? up / rets.length : NaN,
        ci: wilsonInterval(up, rets.length),
        meanReturn: mean(rets),
      };
    });
  }, [result]);

  const validRegimes = byRegime.filter((r) => r.n >= 10);
  const spread =
    validRegimes.length >= 2 ? Math.max(...validRegimes.map((r) => r.upProb)) - Math.min(...validRegimes.map((r) => r.upProb)) : NaN;

  return (
    <div>
      <h2>時代別分析</h2>
      <div className="card">
        <strong>現在のパターン:</strong> {pattern.label}
        <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{pattern.description}</div>
      </div>

      <div className="card">
        <h3>
          金融環境（レジーム）別の成績
          <InfoTip text="日本市場の代表的な相場環境で期間を区切り、それぞれでこのパターンの上昇確率がどう変わるかを見ます。ある時代だけ通用していたパターンかどうかを判断する材料になります。" />
        </h3>
        <table className="kv-table">
          <thead>
            <tr>
              <th>時代</th>
              <th>期間</th>
              <th>n</th>
              <th>上昇確率</th>
              <th>平均リターン</th>
            </tr>
          </thead>
          <tbody>
            {byRegime.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {r.start.slice(0, 7)} 〜 {r.end === "2099-12-31" ? "現在" : r.end.slice(0, 7)}
                </td>
                <td>{r.n}</td>
                <td className={Number.isNaN(r.upProb) ? "" : r.upProb >= 0.5 ? "score-up" : "score-down"}>
                  {Number.isNaN(r.upProb) ? "-" : `${(r.upProb * 100).toFixed(1)}%`}
                </td>
                <td className={Number.isNaN(r.meanReturn) ? "" : r.meanReturn >= 0 ? "score-up" : "score-down"}>
                  {Number.isNaN(r.meanReturn) ? "-" : `${r.meanReturn >= 0 ? "+" : ""}${r.meanReturn.toFixed(2)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!Number.isNaN(spread) && (
          <div style={{ marginTop: 10 }}>
            {spread < 0.25 ? (
              <span className="badge badge-real">✓ 時代を通じて比較的一貫している（差 {(spread * 100).toFixed(0)}pt）</span>
            ) : (
              <span className="badge badge-sample">⚠ 時代によって大きく異なる（差 {(spread * 100).toFixed(0)}pt）— 特定の時代だけに通用した可能性</span>
            )}
          </div>
        )}
        {validRegimes.length < 2 && <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>比較に十分なサンプルがある時代が2つ未満のため、判定を保留します。</div>}
      </div>
    </div>
  );
}
