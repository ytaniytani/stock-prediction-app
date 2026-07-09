import type { ReactNode } from "react";
import { useAppData } from "../state/AppDataContext";
import { useSimDate } from "../state/SimDateContext";
import { formatJP } from "../lib/dateUtils";

export type ScreenId =
  | "dashboard"
  | "pattern"
  | "cases"
  | "calendar"
  | "timemachine"
  | "backtest"
  | "papertrading"
  | "regime"
  | "data";

const NAV: { id: ScreenId; label: string; icon: string }[] = [
  { id: "dashboard", label: "ダッシュボード", icon: "◆" },
  { id: "pattern", label: "パターン検索", icon: "🔍" },
  { id: "cases", label: "事例ビューア", icon: "📄" },
  { id: "regime", label: "時代別分析", icon: "🕰" },
  { id: "backtest", label: "バックテスト", icon: "📈" },
  { id: "calendar", label: "イベント暦", icon: "📅" },
  { id: "timemachine", label: "タイムマシン", icon: "⏳" },
  { id: "papertrading", label: "紙トレ記録", icon: "📝" },
  { id: "data", label: "データ管理", icon: "🗄" },
];

export function Layout({ screen, onNavigate, children }: { screen: ScreenId; onNavigate: (s: ScreenId) => void; children: ReactNode }) {
  const { dataMode, loading } = useAppData();
  const { isSimulated, asOfDate, setAsOfDate } = useSimDate();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-title">
          日経225先物 予想ラボ
          <small>短期売買の参考統計ツール</small>
        </div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-btn ${screen === n.id ? "active" : ""}`} onClick={() => onNavigate(n.id)}>
            <span>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </aside>
      <div className="main-area">
        <div className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`badge ${dataMode === "sample" ? "badge-sample" : "badge-real"}`}>
              {dataMode === "sample" ? "⚠ サンプルデータ（架空）" : "✓ 実データ"}
            </span>
            {loading && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>読み込み中…</span>}
          </div>
          {isSimulated && asOfDate && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="badge badge-estimated">⏳ タイムマシン中: {formatJP(asOfDate)}を「今日」として表示</span>
              <button className="btn btn-sm" onClick={() => setAsOfDate(null)}>
                ライブに戻る
              </button>
            </div>
          )}
        </div>
        <div className="content">{children}</div>
        <footer className="disclaimer-footer">
          ⚠ 本アプリが表示する確率・スコアはすべて過去データの統計的な集計結果であり、将来の値動きを保証するものではありません。
          投資助言・売買推奨ではなく、最終的な売買判断とその結果の責任はご利用者ご自身に帰属します。
          {dataMode === "sample" &&
            " 現在表示中のデータは「サンプルデータ管理」画面で生成した架空のデータです。実際の日経平均・NYダウ等の値ではありません。"}
        </footer>
      </div>
    </div>
  );
}
