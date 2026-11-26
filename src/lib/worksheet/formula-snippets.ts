export interface FormulaSnippet {
  id: string;
  labelVi: string;
  labelEn: string;
  latex: string;
  insert: string;
}

export interface FormulaSnippetGroup {
  id: "basic" | "calculus" | "geometry" | "chemistry";
  titleVi: string;
  titleEn: string;
  items: FormulaSnippet[];
}

export const FORMULA_SNIPPET_GROUPS: FormulaSnippetGroup[] = [
  {
    id: "basic",
    titleVi: "Cơ bản",
    titleEn: "Basic",
    items: [
      { id: "frac", labelVi: "Phân số", labelEn: "Fraction", latex: "\\frac{a}{b}", insert: "$\\frac{a}{b}$" },
      { id: "sqrt", labelVi: "Căn bậc hai", labelEn: "Square root", latex: "\\sqrt{x}", insert: "$\\sqrt{x}$" },
      { id: "pow", labelVi: "Luỹ thừa", labelEn: "Power", latex: "x^{n}", insert: "$x^{n}$" },
      { id: "sub", labelVi: "Chỉ số dưới", labelEn: "Subscript", latex: "x_{i}", insert: "$x_{i}$" },
      { id: "pm", labelVi: "Cộng trừ", labelEn: "Plus/minus", latex: "\\pm", insert: "$\\pm$" },
      { id: "leq", labelVi: "Nhỏ hơn hoặc bằng", labelEn: "≤", latex: "\\le", insert: "$\\le$" },
      { id: "geq", labelVi: "Lớn hơn hoặc bằng", labelEn: "≥", latex: "$\\ge$".replace(/\$/g, ""), insert: "$\\ge$" },
      { id: "neq", labelVi: "Khác", labelEn: "≠", latex: "\\ne", insert: "$\\ne$" },
    ],
  },
  {
    id: "calculus",
    titleVi: "Giải tích",
    titleEn: "Calculus",
    items: [
      { id: "int", labelVi: "Tích phân", labelEn: "Integral", latex: "\\int_{a}^{b} f(x)\\,dx", insert: "$\\int_{a}^{b} f(x)\\,dx$" },
      { id: "lim", labelVi: "Giới hạn", labelEn: "Limit", latex: "\\lim_{x \\to 0}", insert: "$\\lim_{x \\to 0}$" },
      { id: "sum", labelVi: "Tổng Sigma", labelEn: "Summation", latex: "\\sum_{i=1}^{n} a_i", insert: "$\\sum_{i=1}^{n} a_i$" },
      { id: "infty", labelVi: "Vô cực", labelEn: "Infinity", latex: "\\infty", insert: "$\\infty$" },
      { id: "deriv", labelVi: "Đạo hàm", labelEn: "Derivative", latex: "\\frac{dy}{dx}", insert: "$\\frac{dy}{dx}$" },
      { id: "log", labelVi: "Logarit", labelEn: "Logarithm", latex: "\\log_{a}{b}", insert: "$\\log_{a}{b}$" },
    ],
  },
  {
    id: "geometry",
    titleVi: "Hình học",
    titleEn: "Geometry",
    items: [
      { id: "vec", labelVi: "Vectơ", labelEn: "Vector", latex: "\\overrightarrow{AB}", insert: "$\\overrightarrow{AB}$" },
      { id: "angle", labelVi: "Góc", labelEn: "Angle", latex: "\\widehat{ABC}", insert: "$\\widehat{ABC}$" },
      { id: "tri", labelVi: "Tam giác", labelEn: "Triangle", latex: "\\triangle ABC", insert: "$\\triangle ABC$" },
      { id: "perp", labelVi: "Vuông góc", labelEn: "Perpendicular", latex: "\\perp", insert: "$\\perp$" },
      { id: "para", labelVi: "Song song", labelEn: "Parallel", latex: "\\parallel", insert: "$\\parallel$" },
      { id: "deg", labelVi: "Độ", labelEn: "Degree", latex: "90^{\\circ}", insert: "$90^{\\circ}$" },
    ],
  },
  {
    id: "chemistry",
    titleVi: "Hoá học",
    titleEn: "Chemistry",
    items: [
      { id: "arrow", labelVi: "Phản ứng", labelEn: "Reaction arrow", latex: "\\rightarrow", insert: "$\\rightarrow$" },
      { id: "eq", labelVi: "Thuận nghịch", labelEn: "Equilibrium", latex: "\\rightleftharpoons", insert: "$\\rightleftharpoons$" },
      { id: "heat", labelVi: "Nhiệt phân (t°)", labelEn: "Heated", latex: "\\xrightarrow{t^\\circ}", insert: "$\\xrightarrow{t^\\circ}$" },
      { id: "h2so4", labelVi: "Axit H₂SO₄", labelEn: "H₂SO₄", latex: "H_2SO_4", insert: "$H_2SO_4$" },
      { id: "ion", labelVi: "Ion", labelEn: "Ion", latex: "Fe^{3+}", insert: "$Fe^{3+}$" },
    ],
  },
];
