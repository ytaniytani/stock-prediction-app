import { useMemo, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { useActivePattern } from "../state/ActivePatternContext";
import { evaluatePattern, runBacktest, kellyFraction, stopLossAdjustedEv } from "../data/stats";
import { LineChart } from "../charts/LineChart";
import { InfoTip } from "../components/InfoTip";

export function BacktestScreen() {
  const { rows, closes, feeSlippagePct, setFeeSlippagePct } = useAppData();
  const { pattern } = useActivePattern();
  const [stopLossPct, setStopLossPct] = useState(1.5);

  const result = useMemo(
    () => evaluatePattern(rows, closes, pattern.conditions, pattern.horizon, pattern.eventCategories),
    [rows, closes, pattern]
  );
  const backtest = useMemo(() => runBacktest(result, feeSlippagePct), [result, feeSlippagePct]);

  const rets = result.matches.filter((m) => m.fwdReturn !== null).map((m) => m.fwdReturn as number);
  const wins = rets.filter((r) => r > 0);
  const losses = rets.filter((r) => r <= 0);
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const kelly = kellyFraction(backtest.winRate, avgWin, avgLoss);
  const slAdjustedEv = stopLossAdjustedEv(rets, stopLossPct);

  return (
    <div>
      <h2>バックテスト</h2>
      <div className="card">
        <strong>現在のパターン:</strong> {pattern.label}
        <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{pattern.description}</div>
      </div>

      <div className="card">
        <h3>
          設定
          <InfoTip text="日経225先物ミニを想定した往復手数料＋スリッページの概算を%換算で指定します。取引ごとのリターンからこの分を差し引いて『実質期待値』を計算します。" />
        </h3>
        <label>
          手数料・スリッページ（往復、%換算）:{" "}
          <input
            type="number"
            step="0.01"
            value={feeSlippagePct}
            onChange={(e) => setFeeSlippagePct(Number(e.target.value))}
            style={{ width: 80 }}
          />
          %
        </label>
        <br />
        <label style={{ marginTop: 8, display: "inline-block" }}>
          損切りライン（%）:{" "}
          <input type="number" step="0.1" value={stopLossPct} onChange={(e) => setStopLossPct(Number(e.target.value))} style={{ width: 80 }} />
          %
          <InfoTip text="この値を超えて逆行した場合は、そこで損切りしたと仮定して期待値を再計算します（簡易シミュレーション。実際のザラ場での約定価格とは異なります）。" />
        </label>
      </div>

      {result.n === 0 ? (
        <div className="card">該当する取引がありません。</div>
      ) : (
        <>
          <div className="card">
            <h3>成績サマリー（n={backtest.trades.length}）</h3>
            <table className="kv-table">
              <tbody>
                <tr>
                  <td>勝率</td>
                  <td>{(backtest.winRate * 100).toFixed(1)}%</td>
                </tr>
                <tr>
                  <td>平均リターン（手数料控除後・実質期待値）</td>
                  <td className={backtest.netEvPerTrade >= 0 ? "score-up" : "score-down"}>
                    {backtest.netEvPerTrade >= 0 ? "+" : ""}
                    {backtest.netEvPerTrade.toFixed(2)}%
                  </td>
                </tr>
                <tr>
                  <td>最大ドローダウン（仮想資産曲線ベース）</td>
                  <td className="score-down">-{backtest.maxDrawdownPct.toFixed(1)}%</td>
                </tr>
                <tr>
                  <td>
                    損切り前提の期待値（-{Math.abs(stopLossPct)}%でカット）
                    <InfoTip text="実際の値動きが損切りラインを超えた場合、そこで手仕舞ったとみなして期待値を再計算したものです。" />
                  </td>
                  <td className={slAdjustedEv >= 0 ? "score-up" : "score-down"}>
                    {slAdjustedEv >= 0 ? "+" : ""}
                    {slAdjustedEv.toFixed(2)}%
                  </td>
                </tr>
                <tr>
                  <td>
                    ケリー基準による参考ポジションサイズ
                    <InfoTip text="勝率と損益比から理論上の最適な投入比率を計算する手法です。過大なリスクを避けるため50%を上限にキャップしています。あくまで参考値であり、実際の運用ではさらに保守的な比率を使うのが一般的です。" />
                  </td>
                  <td>{(kelly * 100).toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>
              仮想資産曲線（このパターンに毎回従っていた場合）
              <InfoTip text="初期資産を100として、該当するたびに全額を投入したと仮定して複利計算した推移です。実際の運用では分割エントリーやポジションサイズ調整が必要です。" />
            </h3>
            <LineChart data={backtest.equityCurve.map((e) => ({ x: e.date, y: e.equity }))} formatY={(v) => v.toFixed(0)} />
          </div>
        </>
      )}
    </div>
  );
}
