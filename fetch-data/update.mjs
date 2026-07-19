#!/usr/bin/env node
// data/*.csv をstooq.comの公開CSVで最新化する差分更新スクリプト。
//
// fetch.mjs（out/ に毎回全量を保存するローカル用）と違い、こちらは
// リポジトリにコミットされた data/<CODE>.csv を正本として、
// 取得した行を日付キーでマージ（同日付は新しい取得分で上書き）して書き戻す。
// GitHub Actions（.github/workflows/update-data.yml）から毎営業日実行される想定。
//
// 使い方:
//   node update.mjs           … 全銘柄を更新
//   node update.mjs N225      … 指定銘柄のみ更新

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

// stooqのティッカー（fetch.mjsと同じ。変わったら https://stooq.com で要確認）
const TICKERS = {
  N225: "^nkx", // 日経平均株価
  DJI: "^dji", // NYダウ
  IXIC: "^ndq", // NASDAQ総合
  TOPX: "^tpx", // TOPIX
  USDJPY: "usdjpy", // ドル円
};

const HEADER = "Date,Open,High,Low,Close,Volume";

function parseRows(text) {
  // 先頭行がヘッダーのCSVを「日付 → 行文字列」のMapにする（値の解釈はアプリ側に任せる）
  const map = new Map();
  const lines = text.trim().split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const date = line.slice(0, line.indexOf(","));
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) map.set(date, line);
  }
  return map;
}

async function fetchStooq(symbol) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (personal-use data update script)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!/^Date,/i.test(text.trim())) {
    throw new Error(`想定外のレスポンス: ${text.slice(0, 80)}`);
  }
  return text;
}

async function updateOne(code, symbol) {
  const file = path.join(DATA_DIR, `${code}.csv`);
  const existing = existsSync(file) ? parseRows(await readFile(file, "utf-8")) : new Map();
  const fetched = parseRows(await fetchStooq(symbol));
  if (fetched.size === 0) throw new Error("取得データが空でした");

  let added = 0;
  let updated = 0;
  for (const [date, line] of fetched) {
    if (!existing.has(date)) added++;
    else if (existing.get(date) !== line) updated++;
    existing.set(date, line);
  }

  const dates = Array.from(existing.keys()).sort();
  const out = [HEADER, ...dates.map((d) => existing.get(d))].join("\n") + "\n";
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(file, out, "utf-8");
  return { total: existing.size, added, updated };
}

const only = process.argv[2];
const targets = Object.entries(TICKERS).filter(([code]) => !only || code === only.toUpperCase());
if (targets.length === 0) {
  console.error(`未知の銘柄コード: ${only}（対応: ${Object.keys(TICKERS).join(", ")}）`);
  process.exit(1);
}

let okCount = 0;
for (const [code, symbol] of targets) {
  try {
    const r = await updateOne(code, symbol);
    console.log(`✓ ${code}: 追加${r.added}件 / 更新${r.updated}件（累計${r.total}件）`);
    okCount++;
  } catch (e) {
    console.log(`✗ ${code}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 500));
}

// 1銘柄も成功しなかったらエラー終了（Actions側で失敗として扱う）
process.exit(okCount > 0 ? 0 : 1);
