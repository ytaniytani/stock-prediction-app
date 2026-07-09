import { useEffect, useState } from "react";
import { useSimDate } from "../state/SimDateContext";
import { InfoTip } from "../components/InfoTip";
import { toISO } from "../lib/dateUtils";

interface PaperTrade {
  id: string;
  date: string;
  direction: "buy" | "sell";
  memo: string;
  resultPct: number | null; // 未確定はnull
}

const STORAGE_KEY = "paperTrades";

function load(): PaperTrade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(trades: PaperTrade[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
}

export function PaperTradingScreen() {
  const { asOfDate } = useSimDate();
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [date, setDate] = useState(asOfDate ?? toISO(new Date()));
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    setTrades(load());
  }, []);

  function addTrade() {
    const t: PaperTrade = { id: crypto.randomUUID(), date, direction, memo, resultPct: null };
    const next = [t, ...trades];
    setTrades(next);
    save(next);
    setMemo("");
  }

  function updateResult(id: string, value: string) {
    const num = value === "" ? null : Number(value);
    const next = trades.map((t) => (t.id === id ? { ...t, resultPct: num } : t));
    setTrades(next);
    save(next);
  }

  function removeTrade(id: string) {
    const next = trades.filter((t) => t.id !== id);
    setTrades(next);
    save(next);
  }

  function resetAll() {
    if (!confirm("記録をすべて削除します。よろしいですか？")) return;
    setTrades([]);
    save([]);
  }

  const resolved = trades.filter((t) => t.resultPct !== null);
  const totalPct = resolved.reduce((s, t) => s + (t.resultPct ?? 0), 0);
  const winCount = resolved.filter((t) => (t.resultPct ?? 0) > 0).length;

  return (
    <div>
      <h2>紙トレ記録</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>
        「アプリの判定に従ったつもり」の仮想売買をここに記録し、自分の運用成績として振り返ります。実際の資金は動きません。
        <InfoTip text="ダッシュボードやタイムマシンで見た判定をもとに、ここで自分なりに買い/売りを記録し、後日結果(%)を入力してください。ブラウザのlocalStorageに保存され、他の端末とは共有されません。" />
      </p>

      <div className="card">
        <h3>記録を追加</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select value={direction} onChange={(e) => setDirection(e.target.value as "buy" | "sell")}>
            <option value="buy">買い（ロング）</option>
            <option value="sell">売り（ショート）</option>
          </select>
          <input type="text" placeholder="メモ（任意）" value={memo} onChange={(e) => setMemo(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <button className="btn btn-primary" onClick={addTrade}>
            追加
          </button>
        </div>
      </div>

      <div className="card">
        <h3>成績サマリー</h3>
        <table className="kv-table">
          <tbody>
            <tr>
              <td>記録件数（結果入力済み / 全体）</td>
              <td>
                {resolved.length} / {trades.length}
              </td>
            </tr>
            <tr>
              <td>勝率</td>
              <td>{resolved.length ? `${((winCount / resolved.length) * 100).toFixed(1)}%` : "-"}</td>
            </tr>
            <tr>
              <td>合計リターン（単純合算）</td>
              <td className={totalPct >= 0 ? "score-up" : "score-down"}>
                {totalPct >= 0 ? "+" : ""}
                {totalPct.toFixed(2)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>記録一覧</h3>
        {trades.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>まだ記録がありません。</div>
        ) : (
          <table className="kv-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>方向</th>
                <th>メモ</th>
                <th>結果(%)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.direction === "buy" ? "買い" : "売り"}</td>
                  <td style={{ fontSize: 12.5 }}>{t.memo}</td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      value={t.resultPct ?? ""}
                      placeholder="未入力"
                      onChange={(e) => updateResult(t.id, e.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => removeTrade(t.id)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {trades.length > 0 && (
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={resetAll}>
            全件削除
          </button>
        )}
      </div>
    </div>
  );
}
