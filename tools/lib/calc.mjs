// 計算問題の機械検算。q.calc = { expr: "(a+b)/2 の数式", value: 数値, tol?: 許容誤差 }
// 使える記号: 数値, + - * / ^ ( ), sqrt(), ln(), log10(), abs()。変数は使えない（式に数値を直接書く）。
export function evalExpr(src) {
  const s = String(src).replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/');
  let i = 0;
  const peek = () => s[i];
  function num() {
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`数値が必要（位置${i}）`);
    i += m[0].length; return parseFloat(m[0]);
  }
  function atom() {
    if (peek() === '(') { i++; const v = add(); if (s[i++] !== ')') throw new Error(') がない'); return v; }
    if (peek() === '-') { i++; return -atom(); }
    for (const [name, fn] of [['sqrt', Math.sqrt], ['ln', Math.log], ['log10', Math.log10], ['abs', Math.abs]]) {
      if (s.startsWith(name + '(', i)) { i += name.length + 1; const v = add(); if (s[i++] !== ')') throw new Error(') がない'); return fn(v); }
    }
    return num();
  }
  function pow() { let v = atom(); while (peek() === '^') { i++; v = Math.pow(v, atom()); } return v; }
  function mul() { let v = pow(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = pow(); v = op === '*' ? v * r : v / r; } return v; }
  function add() { let v = mul(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = mul(); v = op === '+' ? v + r : v - r; } return v; }
  const v = add();
  if (i !== s.length) throw new Error(`式の解釈に失敗（位置${i}: ${s.slice(i, i + 8)}）`);
  return v;
}
export function checkCalc(q) {
  const errs = [];
  if (!q.calc) return errs;
  const { expr, value } = q.calc;
  const tol = q.calc.tol ?? 0.051;
  let v;
  try { v = evalExpr(expr); } catch (e) { errs.push(`calc.expr を評価できない: ${e.message}`); return errs; }
  if (typeof value !== 'number' || Math.abs(v - value) > tol) errs.push(`calc: 式の値 ${v} と value ${value} が一致しない`);
  const choice = String(q.choices?.[q.answer] ?? '').normalize('NFKC').replace(/,/g, '');
  const nums = (choice.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.some((n) => Math.abs(n - value) <= tol)) errs.push(`calc: 正答の選択肢「${q.choices?.[q.answer]}」に value ${value} が含まれない`);
  return errs;
}
