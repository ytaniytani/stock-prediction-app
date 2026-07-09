#!/usr/bin/env node
// 日経225先物 予想ラボ 用の実データ取得補助スクリプト。
//
// ログイン・APIキーが不要な公開CSVエンドポイント（stooq.com）のみを使う。
// stooqは個人利用目的での閲覧・ダウンロードを想定した無料サービス。
// 過度な頻度でのアクセスは避けること（このスクリプトは1日1回程度の実行を想定）。
//
// 使い方:
//   node fetch.mjs            … 一度だけ取得して ./out/*.csv に保存
//   node fetch.mjs --serve    … 取得後、ローカルHTTPサーバーとして配信し続ける
//                                 （アプリの「データ管理」画面から直接取り込める）

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "out");

// ── 取得対象の銘柄とstooqのティッカーシンボル ──
// ティッカーが変わった/取得できない場合は https://stooq.com で銘柄名を検索し、
// URL末尾の "s=" の値を書き換えること。
// 日経225先物(N225F)は無料・ログイン不要のソースが見当たらないため対象外
// （アプリ側は先物データが無い場合、日経平均株価(N225)で自動的に代用する）。
const TICKERS = {
  N225: "^nkx", // 日経平均株価
  DJI: "^dji", // NYダウ
  IXIC: "^ndq", // NASDAQ総合
  TOPX: "^tpx", // TOPIX
  USDJPY: "usdjpy", // ドル円
};

const LABELS = {
  N225: "日経平均株価",
  DJI: "NYダウ",
  IXIC: "NASDAQ総合",
  TOPX: "TOPIX",
  USDJPY: "ドル円",
};

function stooqUrl(symbol) {
  return `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
}

async function fetchOne(code, symbol) {
  const url = stooqUrl(symbol);
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (personal-use data fetch script)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!/^Date,/i.test(text.trim())) {
    throw new Error(`想定外のレスポンス（銘柄コードが変わった可能性があります）: ${text.slice(0, 80)}`);
  }
  const lines = text.trim().split("\n");
  if (lines.length < 2) throw new Error("データが空でした");
  await mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${code}.csv`);
  await writeFile(file, text, "utf-8");
  return { code, rows: lines.length - 1, file };
}

async function fetchAll() {
  const results = [];
  for (const [code, symbol] of Object.entries(TICKERS)) {
    try {
      // stooqへの負荷を抑えるため直列＋小休止で取得する
      const r = await fetchOne(code, symbol);
      results.push({ ...r, label: LABELS[code], ok: true });
    } catch (e) {
      results.push({ code, label: LABELS[code], ok: false, error: e.message });
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return results;
}

function printSummary(results) {
  console.log("");
  for (const r of results) {
    if (r.ok) {
      console.log(`✓ ${r.label}(${r.code}): ${r.rows}件 → ${r.file}`);
    } else {
      console.log(`✗ ${r.label}(${r.code}): 取得失敗 — ${r.error}`);
    }
  }
  console.log("");
}

function lanAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

async function runOnce() {
  console.log("実データを取得しています（stooq.comの公開CSV、ログイン不要）…");
  const results = await fetchAll();
  printSummary(results);
  console.log(`./out/ 内のCSVを、アプリの「データ管理」画面からドラッグ&ドロップ、または貼り付けで取り込んでください。`);
}

async function runServe(port) {
  console.log("実データを取得しています（初回起動時）…");
  printSummary(await fetchAll());

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, codes: Object.keys(TICKERS) }));
      return;
    }

    if (url.pathname === "/refresh" && req.method === "POST") {
      const results = await fetchAll();
      printSummary(results);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(results));
      return;
    }

    const match = url.pathname.match(/^\/([A-Z0-9]+)\.csv$/);
    if (match) {
      const code = match[1];
      const file = path.join(OUT_DIR, `${code}.csv`);
      if (!existsSync(file)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("該当データがありません。/refresh を実行してください。");
        return;
      }
      const content = await readFile(file, "utf-8");
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8" });
      res.end(content);
      return;
    }

    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<pre>日経225先物 予想ラボ - ローカル取得サーバー

利用可能なエンドポイント:
${Object.keys(TICKERS)
  .map((c) => `  GET  /${c}.csv`)
  .join("\n")}
  POST /refresh   （再取得）
  GET  /health

このPCで実行中は http://localhost:${port} からアクセスできます。
同じWi-Fiに接続したiPhone等からは、以下のいずれかのアドレスでアクセスできます:
${lanAddresses()
  .map((a) => `  http://${a}:${port}`)
  .join("\n") || "  (LAN上のIPv4アドレスが見つかりませんでした)"}
</pre>`
      );
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`\nローカル取得サーバーを起動しました。`);
    console.log(`  このPCから:      http://localhost:${port}`);
    const addrs = lanAddresses();
    if (addrs.length > 0) {
      console.log(`  同じWi-FiのiPhone等から:`);
      for (const a of addrs) console.log(`    http://${a}:${port}`);
      console.log(`\n  ※ iPhoneでアプリを開く場合は、PCと同じWi-Fiに接続したうえで`);
      console.log(`    上記アドレスをアプリの「データ管理」画面に入力してください。`);
      console.log(`    外出先など別ネットワークからは届かない点に注意してください`);
      console.log(`    （インターネット経由でも使いたい場合は将来的な公開ホスティングの検討が必要です）。`);
    }
    console.log(`\n1日1回程度、"更新を取得" ボタン（POST /refresh）で最新化してください。`);
    console.log(`終了するには Ctrl+C を押してください。\n`);
  });

  // 起動したまま放置されるケースを考え、24時間おきに自動更新もしておく
  setInterval(async () => {
    console.log(`[自動更新] ${new Date().toLocaleString("ja-JP")}`);
    printSummary(await fetchAll());
  }, 24 * 60 * 60 * 1000);
}

const args = process.argv.slice(2);
const serveMode = args.includes("--serve");
const portArgIdx = args.indexOf("--port");
const port = portArgIdx >= 0 ? Number(args[portArgIdx + 1]) : 8787;

if (serveMode) {
  runServe(port);
} else {
  runOnce();
}
