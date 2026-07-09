import { useRef, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { INSTRUMENTS, type InstrumentCode } from "../data/types";
import { InfoTip } from "../components/InfoTip";

// fetch-data/fetch.mjs --serve が配信する銘柄コード（先物N225Fは無料ソースが無いため対象外）
const FETCH_SERVER_CODES: InstrumentCode[] = ["N225", "DJI", "IXIC", "TOPX", "USDJPY"];
const SERVER_URL_KEY = "fetchServerUrl";

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function DataManagerScreen() {
  const { dataMode, coverage, importCsv, resetToSampleData, clearInstrument, feeSlippagePct, setFeeSlippagePct } = useAppData();
  const [code, setCode] = useState<InstrumentCode>("N225");
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem(SERVER_URL_KEY) ?? "http://localhost:8787");
  const [serverBusy, setServerBusy] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  function updateServerUrl(v: string) {
    setServerUrl(v);
    localStorage.setItem(SERVER_URL_KEY, v);
  }

  async function fetchFromServer(refreshFirst: boolean) {
    setServerBusy(true);
    setServerMessage(null);
    const base = serverUrl.replace(/\/$/, "");
    try {
      if (refreshFirst) {
        setServerMessage("サーバー側で最新データを取得しています…（stooq.comへの問い合わせのため数秒〜数十秒かかることがあります）");
        try {
          await fetchWithTimeout(`${base}/refresh`, 60000, { method: "POST" });
        } catch {
          // 再取得に失敗しても、サーバーに既にあるキャッシュ済みCSVの取り込みは試みる
        }
      }
      const lines: string[] = [];
      let successCount = 0;
      for (const c of FETCH_SERVER_CODES) {
        try {
          const res = await fetchWithTimeout(`${base}/${c}.csv`, 8000);
          if (!res.ok) {
            lines.push(`✗ ${c}: サーバーに該当データがありません（HTTP ${res.status}）`);
            continue;
          }
          const text = await res.text();
          const result = await importCsv(c, text);
          if (result.errors.length > 0) {
            lines.push(`✗ ${c}: ${result.errors.join(" / ")}`);
          } else {
            lines.push(`✓ ${c}: ${result.added}件を取り込み`);
            successCount++;
          }
        } catch (e) {
          lines.push(`✗ ${c}: サーバーに接続できません（${(e as Error).message}）`);
        }
      }
      lines.unshift(`${successCount}/${FETCH_SERVER_CODES.length}銘柄を取り込みました。`);
      setServerMessage(lines.join("\n"));
    } finally {
      setServerBusy(false);
    }
  }

  async function handleImport() {
    if (!text.trim()) {
      setMessage("CSVの内容が空です。");
      return;
    }
    const res = await importCsv(code, text);
    if (res.errors.length > 0) {
      setMessage(`取り込みエラー: ${res.errors.join(" / ")}`);
    } else {
      setMessage(`${res.added}件を取り込みました（${res.skipped}件はスキップ）。データモードは「実データ」に切り替わりました。`);
      setText("");
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  return (
    <div>
      <h2>データ管理</h2>

      <div className="card">
        <h3>
          現在のデータモード:{" "}
          <span className={`badge ${dataMode === "sample" ? "badge-sample" : "badge-real"}`}>
            {dataMode === "sample" ? "⚠ サンプルデータ（架空）" : "✓ 実データ"}
          </span>
          <InfoTip text="サンプルデータは統計的な性質（ボラティリティの変動、たまに起こる急落など）だけを模した乱数生成の架空データです。実際の日経平均やダウの値ではありません。信頼できる予測には、必ずご自身で取得した実データをCSVで取り込んでください。" />
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          このサンドボック環境からは証券データ配信元への直接アクセスができないため、実データはお手元でエクスポートしたCSVファイルの取り込みが基本の入力経路になります（Yahoo!ファイナンス、investing.com、証券会社のツール等からエクスポートしたファイルを想定）。
        </p>
        <button className="btn btn-sm" onClick={resetToSampleData}>
          サンプルデータに戻す（既存データは上書きされます）
        </button>
      </div>

      <div className="card">
        <h3>
          ローカル取得サーバーから読み込む
          <InfoTip text="お手元のPCで fetch-data/fetch.mjs --serve を実行しておくと、ID・パスワード不要の公開CSV（stooq.com）から日経平均・NYダウ・NASDAQ総合・TOPIX・ドル円を自動取得できます。同じWi-Fiに接続していれば、iPhoneなど別端末からも同じサーバーに接続してこの画面から取り込めます。日経225先物(N225F)は無料の取得元が無いため対象外です（未取得の場合、統計エンジンは自動的に日経平均株価で代用します）。" />
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          リポジトリの <code>stock-prediction/fetch-data/</code> にある取得スクリプトを、お使いのPCで
          <code>node fetch.mjs --serve</code> として起動しておくと、下のボタンから一括取り込みできます。詳しくは同フォルダのREADMEを参照してください。
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label>
            サーバーURL:{" "}
            <input type="text" value={serverUrl} onChange={(e) => updateServerUrl(e.target.value)} style={{ width: 220 }} placeholder="http://localhost:8787" />
          </label>
          <button className="btn btn-primary btn-sm" disabled={serverBusy} onClick={() => fetchFromServer(true)}>
            {serverBusy ? "取得中…" : "サーバーで最新化してから取り込む"}
          </button>
          <button className="btn btn-sm" disabled={serverBusy} onClick={() => fetchFromServer(false)}>
            サーバーの既存データだけ取り込む（高速）
          </button>
        </div>
        {serverMessage && (
          <pre style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{serverMessage}</pre>
        )}
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
          iPhoneで使う場合: PCで <code>node fetch.mjs --serve</code> を実行したまま、iPhoneをPCと同じWi-Fiに接続し、サーバーURLをPCのLAN内IPアドレス（起動時にターミナルへ表示されます。例:
          http://192.168.x.x:8787）に変更してください。外出先など別ネットワークからは届きません。
        </p>
      </div>

      <div className="card">
        <h3>データ収録状況</h3>
        <table className="kv-table">
          <thead>
            <tr>
              <th>銘柄</th>
              <th>件数</th>
              <th>開始日</th>
              <th>終了日</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((c) => {
              const inst = INSTRUMENTS.find((i) => i.code === c.code);
              return (
                <tr key={c.code}>
                  <td>{inst?.label}</td>
                  <td>{c.count}</td>
                  <td>{c.first ?? "-"}</td>
                  <td>{c.last ?? "-"}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => clearInstrument(c.code)}>
                      クリア
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>
          CSVインポート
          <InfoTip text="Date,Open,High,Low,Close の列を持つCSV（Yahoo!ファイナンス形式）や、Date,Price,Open,High,Low の列を持つCSV（investing.com形式）に対応しています。同じ日付のデータは新しい取り込みで上書きされます。" />
        </h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <label>
            対象銘柄:{" "}
            <select value={code} onChange={(e) => setCode(e.target.value as InstrumentCode)}>
              {INSTRUMENTS.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <input type="file" accept=".csv,text/csv" ref={fileRef} onChange={handleFile} />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="CSVをここに貼り付けるか、上のファイル選択から読み込んでください"
          rows={8}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
        />
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={handleImport}>
            取り込む
          </button>
        </div>
        {message && <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>{message}</div>}
      </div>

      <div className="card">
        <h3>取引コスト設定</h3>
        <label>
          手数料・スリッページ（往復、%換算）:{" "}
          <input type="number" step="0.01" value={feeSlippagePct} onChange={(e) => setFeeSlippagePct(Number(e.target.value))} style={{ width: 80 }} />
          %
        </label>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>バックテスト画面の実質期待値計算に使われます。</p>
      </div>
    </div>
  );
}
