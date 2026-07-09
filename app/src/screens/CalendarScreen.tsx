import { useMemo } from "react";
import { useAppData } from "../state/AppDataContext";
import { buildEventCalendar, EVENT_META } from "../data/eventCalendar";
import { forwardReturn, mean } from "../data/stats";
import type { EventCategory } from "../data/types";
import { InfoTip } from "../components/InfoTip";
import { formatJP, toISO } from "../lib/dateUtils";

const CATEGORIES = Object.keys(EVENT_META) as EventCategory[];

export function CalendarScreen() {
  const { rows, closes } = useAppData();
  const events = useMemo(() => buildEventCalendar(), []);

  const todayIso = toISO(new Date());
  const upcoming = useMemo(
    () => events.filter((e) => e.date >= todayIso).slice(0, 40),
    [events, todayIso]
  );

  const historyStats = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const idxs: number[] = [];
      rows.forEach((r, i) => {
        if (r.events.includes(cat)) idxs.push(i);
      });
      const dayOf = idxs.map((i) => r1(rows, i)).filter((v): v is number => v !== null);
      const nextDay = idxs.map((i) => forwardReturn(closes, i, 1)).filter((v): v is number => v !== null);
      return {
        cat,
        n: idxs.length,
        avgDayOf: mean(dayOf),
        avgNextDay: mean(nextDay),
      };
    });
  }, [rows, closes]);

  return (
    <div>
      <h2>イベント暦</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>
        今後の主要イベント日程と、過去にそのイベント該当日・翌日にどれくらい値動きしたかの平均を確認できます。
        <InfoTip text="「推定日程」は発表周期から近似計算した日付で、実際の発表日と数日ずれる場合があります。「確定日程」は制度上・史実として確定している日付です。" />
      </p>

      <div className="card">
        <h3>今後のイベント（{upcoming.length}件）</h3>
        {upcoming.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>登録済みカレンダー範囲外です。</div>
        ) : (
          <table className="kv-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>イベント</th>
                <th>精度</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((e, i) => (
                <tr key={i}>
                  <td>{formatJP(e.date)}</td>
                  <td>{e.label}</td>
                  <td>
                    <span className={`badge ${EVENT_META[e.category].precision === "exact" ? "badge-exact" : "badge-estimated"}`}>
                      {EVENT_META[e.category].precision === "exact" ? "確定" : "推定"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>
          イベント種別ごとの過去の平均騰落率
          <InfoTip text="「当日」はそのイベントが該当する日の前日終値→当日終値の騰落率、「翌営業日」はそこからさらに1営業日後までの騰落率の平均です。" />
        </h3>
        <table className="kv-table">
          <thead>
            <tr>
              <th>イベント</th>
              <th>n</th>
              <th>当日平均</th>
              <th>翌営業日平均</th>
            </tr>
          </thead>
          <tbody>
            {historyStats.map((s) => (
              <tr key={s.cat}>
                <td>{EVENT_META[s.cat].label}</td>
                <td>{s.n}</td>
                <td className={Number.isNaN(s.avgDayOf) ? "" : s.avgDayOf >= 0 ? "score-up" : "score-down"}>
                  {Number.isNaN(s.avgDayOf) ? "-" : `${s.avgDayOf >= 0 ? "+" : ""}${s.avgDayOf.toFixed(2)}%`}
                </td>
                <td className={Number.isNaN(s.avgNextDay) ? "" : s.avgNextDay >= 0 ? "score-up" : "score-down"}>
                  {Number.isNaN(s.avgNextDay) ? "-" : `${s.avgNextDay >= 0 ? "+" : ""}${s.avgNextDay.toFixed(2)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {historyStats.some((s) => s.n < 30) && (
          <div className="sample-banner" style={{ marginTop: 10 }}>
            ⚠ nが30未満の行は参考値です。
          </div>
        )}
      </div>
    </div>
  );
}

function r1(rows: { ret1: number }[], i: number): number | null {
  const v = rows[i].ret1;
  return Number.isNaN(v) ? null : v;
}
