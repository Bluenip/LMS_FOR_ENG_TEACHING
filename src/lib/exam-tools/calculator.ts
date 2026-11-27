/**
 * Scientific calculator for the in-exam tool drawer: tokenizer + Shunting-Yard + RPN evaluation.
 * No `eval` / `new Function`: only whitelisted numbers, operators, constants and functions.
 */

export type AngleMode = "DEG" | "RAD";

export class CalcError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "SYNTAX" | "MATH" | "TOO_LONG") {
    super(code);
    this.name = "CalcError";
  }
}

type Token =
  | { k: "num"; v: number }
  | { k: "op"; v: "+" | "-" | "*" | "/" | "^" | "%" | "neg" }
  | { k: "fn"; v: string }
  | { k: "lp" }
  | { k: "rp" }
  | { k: "fact" };

const FUNCTIONS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "log", "ln", "sqrt", "abs", "cbrt", "exp"]);
const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };
export const CALC_MAX_LENGTH = 200;

export function tokenize(input: string): Token[] {
  if (input.length > CALC_MAX_LENGTH) throw new CalcError("TOO_LONG");
  const src = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, ".").toLowerCase();
  if (!/^[0-9a-zπ+\-*/^%().!\s]*$/.test(src)) throw new CalcError("INVALID_INPUT");
  const out: Token[] = [];
  let i = 0;
  const prevIsValue = () => {
    const p = out[out.length - 1];
    return p !== undefined && (p.k === "num" || p.k === "rp" || p.k === "fact");
  };
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === " ") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new CalcError("SYNTAX");
      if (prevIsValue()) out.push({ k: "op", v: "*" }); // 2(3) → 2*(3)
      out.push({ k: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zπ]/.test(ch)) {
      const m = /^(π|[a-z]+)/.exec(src.slice(i))!;
      const word = m[0];
      if (prevIsValue()) out.push({ k: "op", v: "*" }); // 2pi, 3sin(x)
      if (FUNCTIONS.has(word)) out.push({ k: "fn", v: word });
      else if (word in CONSTANTS) out.push({ k: "num", v: CONSTANTS[word]! });
      else throw new CalcError("INVALID_INPUT");
      i += word.length;
      continue;
    }
    if (ch === "(") {
      if (prevIsValue()) out.push({ k: "op", v: "*" });
      out.push({ k: "lp" });
    } else if (ch === ")") out.push({ k: "rp" });
    else if (ch === "!") out.push({ k: "fact" });
    else if (ch === "-" || ch === "+") {
      if (!prevIsValue()) {
        if (ch === "-") out.push({ k: "op", v: "neg" });
      } else out.push({ k: "op", v: ch });
    } else out.push({ k: "op", v: ch as "*" | "/" | "^" | "%" });
    i++;
  }
  return out;
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, neg: 3, "^": 4 };
const RIGHT = new Set(["^", "neg"]);

function toRpn(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const stack: Token[] = [];
  for (const t of tokens) {
    if (t.k === "num" || t.k === "fact") out.push(t);
    else if (t.k === "fn" || t.k === "lp") stack.push(t);
    else if (t.k === "op") {
      while (stack.length) {
        const top = stack[stack.length - 1]!;
        if (top.k === "fn") {
          out.push(stack.pop()!);
          continue;
        }
        if (top.k !== "op") break;
        const pt = PREC[top.v]!;
        const pc = PREC[t.v]!;
        if (pt > pc || (pt === pc && !RIGHT.has(t.v))) out.push(stack.pop()!);
        else break;
      }
      stack.push(t);
    } else if (t.k === "rp") {
      let found = false;
      while (stack.length) {
        const top = stack.pop()!;
        if (top.k === "lp") {
          found = true;
          break;
        }
        out.push(top);
      }
      if (!found) throw new CalcError("SYNTAX");
      if (stack.length && stack[stack.length - 1]!.k === "fn") out.push(stack.pop()!);
    }
  }
  while (stack.length) {
    const t = stack.pop()!;
    if (t.k === "lp") throw new CalcError("SYNTAX");
    out.push(t);
  }
  return out;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new CalcError("MATH");
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function evaluate(input: string, mode: AngleMode = "DEG"): number {
  const rpn = toRpn(tokenize(input));
  if (rpn.length === 0) throw new CalcError("SYNTAX");
  const toRad = (x: number) => (mode === "DEG" ? (x * Math.PI) / 180 : x);
  const fromRad = (x: number) => (mode === "DEG" ? (x * 180) / Math.PI : x);
  const st: number[] = [];
  const pop = () => {
    const v = st.pop();
    if (v === undefined) throw new CalcError("SYNTAX");
    return v;
  };
  for (const t of rpn) {
    if (t.k === "num") st.push(t.v);
    else if (t.k === "fact") st.push(factorial(pop()));
    else if (t.k === "op") {
      if (t.v === "neg") {
        st.push(-pop());
        continue;
      }
      const b = pop();
      const a = pop();
      st.push(
        t.v === "+" ? a + b : t.v === "-" ? a - b : t.v === "*" ? a * b : t.v === "/" ? a / b : t.v === "%" ? a % b : Math.pow(a, b)
      );
    } else if (t.k === "fn") {
      const x = pop();
      const fns: Record<string, () => number> = {
        sin: () => Math.sin(toRad(x)),
        cos: () => Math.cos(toRad(x)),
        tan: () => Math.tan(toRad(x)),
        asin: () => fromRad(Math.asin(x)),
        acos: () => fromRad(Math.acos(x)),
        atan: () => fromRad(Math.atan(x)),
        log: () => Math.log10(x),
        ln: () => Math.log(x),
        sqrt: () => Math.sqrt(x),
        cbrt: () => Math.cbrt(x),
        abs: () => Math.abs(x),
        exp: () => Math.exp(x),
      };
      st.push(fns[t.v]!());
    } else throw new CalcError("SYNTAX");
  }
  if (st.length !== 1) throw new CalcError("SYNTAX");
  const v = st[0]!;
  if (!Number.isFinite(v)) throw new CalcError("MATH");
  // clean floating noise such as sin(30°) = 0.49999999999999994
  return Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(12));
}
