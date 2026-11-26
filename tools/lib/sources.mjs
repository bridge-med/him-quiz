// 一次資料キャッシュ（リポジトリ外）の登録簿を読む。
// 既定の場所: /home/user/hq-work/src/*/registry.json（環境変数 HIMQ_SOURCES で変更）
import fs from 'node:fs';
import path from 'node:path';
import { normQuote } from './normalize.mjs';
export const SRC_DIR = process.env.HIMQ_SOURCES || '/home/user/hq-work/src';
export function loadRegistry(dir = SRC_DIR) {
  const reg = new Map();
  if (!fs.existsSync(dir)) return reg;
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'registry.json');
    if (!fs.existsSync(p)) continue;
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.error(`registry parse error: ${p}`); continue; }
    for (const r of arr) if (r && r.id) reg.set(r.id, r);
  }
  return reg;
}
const textCache = new Map();
export function sourceText(entry) {
  if (!entry || !entry.path) return null;
  if (textCache.has(entry.path)) return textCache.get(entry.path);
  let t = null;
  try { t = normQuote(fs.readFileSync(entry.path, 'utf8')); } catch (e) { t = null; }
  textCache.set(entry.path, t);
  return t;
}
export function checkQuote(reg, src) {
  const e = reg.get(src.ref);
  if (!e) return { ok: false, why: `未登録の資料ID: ${src.ref}` };
  const t = sourceText(e);
  if (!t) return { ok: false, why: `資料本文を読めない: ${e.path}` };
  const q = normQuote(src.quote);
  if (q.length < 8) return { ok: false, why: '引用が短すぎる（8文字未満）' };
  if (!t.includes(q)) return { ok: false, why: '引用が資料本文に見つからない' };
  return { ok: true, entry: e };
}
