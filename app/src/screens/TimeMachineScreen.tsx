import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useSimDate } from "../state/SimDateContext";
import { knnScore, runWalkForwardValidation, type WalkForwardResult } from "../data/stats";
import { InfoTip } from "../components/InfoTip";
import { ScoreBadge } from "../components/ScoreBadge";
import { LineChart } from "../charts/LineChart";
import { formatJP } from "../lib/dateUtils";

export function TimeMachineScreen() {
  const { rows, closes } = useAppData();
  const { asOfIndex, asOfDate, setAsOfDate, isSimulated } = useSimDate();
  const [revealed, setRevealed] = useState(false);
  const [wfResult, setWfResult] = useState<WalkForwardResult | null>(null);
  const [running, setRunning] = useState(false);
  const [windowYears, setWindowYears] = useState<number>(3);
  const [stride, setStride] = useState<number>(2);

  const minDate = rows[60]?.date;
  const maxDate = rows[Math.max(0, rows.length - 2)]?.date;

  const currentPrediction = useMemo(
    () => knnScore(rows, closes, asOfIndex, 1, asOfIndex, 40),
    [rows, closes, asOfIndex]
  );
  const actualNext = asOfIndex + 1 < rows.length ? ((closes[asOfIndex + 1] - closes[asOfIndex]) / closes[asOfIndex]) * 100 : null;

  function runValidation() {
    setRunning(true);
    setWfResult(null);
    setTimeout(() => {
      const endIndex = rows.length - 2;
      const approxDaysPerYear = 252;
      const startIndex = Math.max(60, endIndex - windowYears * approxDaysPerYear);
      const res = runWalkForwardValidation(rows, closes, startIndex, endIndex, 1, stride, 15);
      setWfResult(res);
      setRunning(false);
    }, 30);
  }

  const equityCurveData = useMemo(() => {
    if (!wfResult) return [];
    let equity = 100;
    const points: { x: string; y: number }[] = [];
    for (const t of wfResult.timeline) {
      if (t.actual === null || Number.isNaN(t.predictedUpProb)) continue;
      const positionReturn = t.predictedUpProb > 0.5 ? t.actual : -t.actual;
      equity *= 1 + positionReturn / 100;
      points.push({ x: t.date, y: equity });
    }
    return points;
  }, [wfResult]);

  return (
    <div>
      <h2>タイムマシン</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>
        「今日」を過去の任意の日に設定し、その時点までのデータだけを使ってダッシュボードの判定を再現します。
        本当にこの判定手法を信じてよいかを、実際に過去の期間で答え合わせして検証できます。
        <InfoTip text="ここで日付を選ぶと、ダッシュボード画面など他の画面もすべてその日付を「今日」として動作します（先読みは一切行いません）。ライブに戻すにはこの画面か上部バーの「ライブに戻る」ボタンを使ってください。" />
      </p>

      <div className="card">
        <h3>1. 「今日」を過去の日付に設定する</h3>
        <input
          type="date"
          min={minDate}
          max={maxDate}
          value={asOfDate ?? ""}
          onChange={(e) => {
            setAsOfDate(e.target.value || null);
            setRevealed(false);
          }}
        />
        <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setAsOfDate(null)}>
          ライブ（最新日）に戻す
        </button>
        {isSimulated && asOfDate && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {formatJP(asOfDate)}時点までのデータだけを使った「明日」の判定:
            </div>
            <div style={{ fontSize: 24, marginTop: 6 }}>
              <ScoreBadge upProb={currentPrediction.upProb} n={currentPrediction.n} />
            </div>
            {!revealed ? (
              <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => setRevealed(true)}>
                翌営業日の答え合わせを見る
              </button>
            ) : (
              <div style={{ marginTop: 10, fontSize: 16 }}>
                実際の翌営業日の結果:{" "}
                <strong className={actualNext === null ? "" : actualNext >= 0 ? "score-up" : "score-down"}>
                  {actualNext === null ? "データなし" : `${actualNext >= 0 ? "+" : ""}${actualNext.toFixed(2)}%`}
                </strong>
                {actualNext !== null && (
                  <span style={{ marginLeft: 10 }}>
                    {(currentPrediction.upProb > 0.5) === actualNext > 0 ? (
                      <span className="badge badge-real">✓ 判定通り</span>
                    ) : (
                      <span className="badge badge-sample">✗ 判定と逆</span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {!isSimulated && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-muted)" }}>現在はライブ（最新日）表示中です。上の日付を変更してください。</div>}
      </div>

      <div className="card">
        <h3>
          2. 本当に信じてよいか？ ウォークフォワード検証
          <InfoTip text="1日ずつ「その日までの情報だけ」で明日の判定を出し、実際の結果と照合することを繰り返します。的中率が50%に近ければ、この判定手法にはほぼ予測力がないことを意味します。" />
        </h3>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <label>
            検証期間:{" "}
            <select value={windowYears} onChange={(e) => setWindowYears(Number(e.target.value))}>
              <option value={1}>直近1年</option>
              <option value={3}>直近3年</option>
              <option value={5}>直近5年</option>
              <option value={10}>直近10年</option>
              <option value={25}>ほぼ全期間</option>
            </select>
          </label>
          <label>
            間隔:{" "}
            <select value={stride} onChange={(e) => setStride(Number(e.target.value))}>
              <option value={1}>1営業日ごと（精密・やや遅い）</option>
              <option value={2}>2営業日ごと</option>
              <option value={5}>5営業日ごと（高速）</option>
            </select>
          </label>
          <button className="btn btn-primary" onClick={runValidation} disabled={running}>
            {running ? "検証中…" : "検証を実行"}
          </button>
        </div>

        {wfResult && (
          <div>
            <div style={{ fontSize: 22, marginBottom: 6 }}>
              的中率 <strong className={wfResult.hitRate >= 0.55 ? "score-up" : wfResult.hitRate <= 0.45 ? "score-down" : "score-neutral"}>
                {(wfResult.hitRate * 100).toFixed(1)}%
              </strong>{" "}
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                （検証日数 {wfResult.tested}日、サンプル不足で保留 {wfResult.skippedLowSample}日）
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
              50%は「コイン投げと同じ」水準です。的中率がこれに近い、あるいはそれを下回る場合、この判定手法は短期売買の根拠として十分ではありません。
            </div>
            <table className="kv-table">
              <tbody>
                <tr>
                  <td>「上昇」と判定した日の平均実際リターン</td>
                  <td className={wfResult.avgReturnWhenCalledUp >= 0 ? "score-up" : "score-down"}>
                    {Number.isNaN(wfResult.avgReturnWhenCalledUp) ? "-" : `${wfResult.avgReturnWhenCalledUp >= 0 ? "+" : ""}${wfResult.avgReturnWhenCalledUp.toFixed(2)}%`}
                  </td>
                </tr>
                <tr>
                  <td>「下落」と判定した日の平均実際リターン</td>
                  <td className={wfResult.avgReturnWhenCalledDown <= 0 ? "score-up" : "score-down"}>
                    {Number.isNaN(wfResult.avgReturnWhenCalledDown) ? "-" : `${wfResult.avgReturnWhenCalledDown >= 0 ? "+" : ""}${wfResult.avgReturnWhenCalledDown.toFixed(2)}%`}
                  </td>
                </tr>
              </tbody>
            </table>
            <h4 style={{ marginTop: 14 }}>
              判定に毎回従っていた場合の仮想資産推移
              <InfoTip text="判定が「上昇」ならロング、「下落」ならショートを取ったと仮定し、実際のリターンを複利で積み上げたものです。手数料・スリッページは含まれていません。" />
            </h4>
            <LineChart data={equityCurveData} formatY={(v) => v.toFixed(0)} />
          </div>
        )}
      </div>
    </div>
  );
}
