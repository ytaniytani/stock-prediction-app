import { useMemo } from "react";
import { useAppData } from "../state/AppDataContext";
import { useSimDate } from "../state/SimDateContext";
import { knnIntradayScore, knnMomentumScore, knnScore, type KnnScoreResult } from "../data/stats";
import { InfoTip } from "../components/InfoTip";
import { scoreLabel } from "../components/ScoreBadge";
import { formatJP } from "../lib/dateUtils";
import type { ScreenId } from "../components/Layout";
import { INSTRUMENTS } from "../data/types";

function JudgmentCard({
  title,
  info,
  result,
  onDetail,
}: {
  title: string;
  info: string;
  result: KnnScoreResult;
  onDetail: () => void;
}) {
  const { text, className } = scoreLabel(result.upProb, result.n);
  return (
    <div className="card">
      <h3>
        {title}
        <InfoTip text={info} />
      </h3>
      <div style={{ fontSize: 26, fontWeight: 800 }} className={className}>
        {text}
      </div>
      {result.n > 0 && !Number.isNaN(result.upProb) ? (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
          上昇確率 <strong>{(result.upProb * 100).toFixed(1)}%</strong>（95%信頼区間 {(result.ci[0] * 100).toFixed(1)}〜
          {(result.ci[1] * 100).toFixed(1)}%）
          <br />
          サンプル数 n={result.n} ／ 平均リターン {result.meanReturn >= 0 ? "+" : ""}
          {result.meanReturn.toFixed(2)}%
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>類似する過去事例が少なく判定できません</div>
      )}
      <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={onDetail}>
        根拠を見る（類似日一覧）
      </button>
    </div>
  );
}

export function DashboardScreen({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const { rows, closes, series, primaryCode } = useAppData();
  const { asOfIndex, asOfDate, isSimulated } = useSimDate();

  const poolEndExclusive = asOfIndex; // 「今日」より前の全履歴のみを根拠プールとする(先読み防止)
  const primaryOhlc = series[primaryCode] ?? [];

  const nowResult = useMemo(() => knnMomentumScore(rows, closes, asOfIndex, poolEndExclusive), [rows, closes, asOfIndex, poolEndExclusive]);
  const todayResult = useMemo(
    () => knnIntradayScore(rows, primaryOhlc, asOfIndex, poolEndExclusive),
    [rows, primaryOhlc, asOfIndex, poolEndExclusive]
  );
  const tomorrowResult = useMemo(() => knnScore(rows, closes, asOfIndex, 1, poolEndExclusive), [rows, closes, asOfIndex, poolEndExclusive]);

  const currentRow = rows[asOfIndex];

  return (
    <div>
      <h2>
        ダッシュボード
        {isSimulated && asOfDate && (
          <span style={{ fontSize: 13, fontWeight: 400, color: "var(--status-warning)", marginLeft: 10 }}>
            （{formatJP(asOfDate)}時点のシミュレーション表示）
          </span>
        )}
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>
        「今」「今日」「明日」それぞれについて、現在の相場状況と統計的に似ていた過去の日を探し、その後の値動きの傾向を表示します。
        <InfoTip text="内部では、直近の騰落率・移動平均乖離率・ボラティリティなどを数値化し、k近傍法（過去データの中から最も似た状態を探すアルゴリズム）で類似日を抽出しています。「優位」「劣位」の判定はサンプル数(n)が30未満だと出しません。" />
      </p>

      <div className="grid-3">
        <JudgmentCard
          title="今"
          info="直近の値動きの勢い・荒さ（1日騰落率、20日ボラティリティ、寄付ギャップ、直近の連続騰落）が似ていた過去の日を探し、その翌営業日の騰落確率を表示します。短期モメンタムのみに着目した速報値です。"
          result={nowResult}
          onDetail={() => onNavigate("cases")}
        />
        <JudgmentCard
          title="今日"
          info="前夜のNYダウ・NASDAQの動き、寄り付きのギャップ、直近の連続騰落が似ていた過去の日を探し、その日の「始値→終値」の結果（場中に上がったか下がったか）を集計します。"
          result={todayResult}
          onDetail={() => onNavigate("cases")}
        />
        <JudgmentCard
          title="明日"
          info="1〜20日の各種騰落率・移動平均乖離率・ボラティリティなど多角的な特徴量が似ていた過去の日を探し、その翌営業日クローズの騰落確率を表示します。"
          result={tomorrowResult}
          onDetail={() => onNavigate("cases")}
        />
      </div>

      <div className="card">
        <h3>市場サマリー（{currentRow ? formatJP(currentRow.date) : "-"} 時点）</h3>
        <table className="kv-table">
          <thead>
            <tr>
              <th>銘柄</th>
              <th>終値</th>
              <th>前日比</th>
            </tr>
          </thead>
          <tbody>
            {INSTRUMENTS.map((inst) => {
              const s = series[inst.code] ?? [];
              const idx = s.findIndex((r) => r.date === currentRow?.date);
              if (idx < 0) return null;
              const cur = s[idx];
              const prev = s[idx - 1];
              const chg = prev ? ((cur.close - prev.close) / prev.close) * 100 : null;
              return (
                <tr key={inst.code}>
                  <td>{inst.label}</td>
                  <td>
                    {cur.close.toLocaleString()} {inst.unit}
                  </td>
                  <td className={chg === null ? "" : chg >= 0 ? "score-up" : "score-down"}>
                    {chg === null ? "-" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>
          直近の状態
          <InfoTip text="現在「今日」として扱っている日の特徴量です。連続陽線/陰線日数がプラスなら連続上昇、マイナスなら連続下落を意味します。" />
        </h3>
        {currentRow && (
          <table className="kv-table">
            <tbody>
              <tr>
                <td>連続陽線/陰線</td>
                <td>
                  {currentRow.streakDays > 0 ? `${currentRow.streakDays}日連続陽線` : currentRow.streakDays < 0 ? `${-currentRow.streakDays}日連続陰線` : "-"}
                  （合計 {currentRow.streakReturn >= 0 ? "+" : ""}
                  {currentRow.streakReturn.toFixed(2)}%）
                </td>
              </tr>
              <tr>
                <td>25日移動平均乖離率</td>
                <td className={currentRow.maDev25 >= 0 ? "score-up" : "score-down"}>
                  {currentRow.maDev25 >= 0 ? "+" : ""}
                  {currentRow.maDev25.toFixed(2)}%
                </td>
              </tr>
              <tr>
                <td>20日ボラティリティ</td>
                <td>{currentRow.vol20.toFixed(2)}%/日</td>
              </tr>
              <tr>
                <td>寄付ギャップ</td>
                <td className={currentRow.gap >= 0 ? "score-up" : "score-down"}>
                  {currentRow.gap >= 0 ? "+" : ""}
                  {currentRow.gap.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-sm" onClick={() => onNavigate("timemachine")}>
            この判定を本当に信じてよいか、タイムマシンで検証する →
          </button>
        </div>
      </div>
    </div>
  );
}
