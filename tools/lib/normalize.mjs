// 引用照合用の正規化。NFKC で全角英数を半角にし、空白・改行をすべて除く。
// pdftotext が日本語の間に入れる空白や改行の差を吸収するためのもの。
export function normQuote(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/[‐‑‒–—―−－]/g, '-')
    .replace(/[“”〝〟]/g, '"')
    .replace(/[‘’]/g, "'");
}
