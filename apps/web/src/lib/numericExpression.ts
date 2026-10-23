type Quantity = { value: number; length: number; angle: number };
type Unit = { factor: number; length: number; angle: number };

const units: Record<string, Unit> = Object.create(null);
function register(names: string[], factor: number, length: number, angle = 0) {
  for (const name of names) units[name] = { factor, length, angle };
}
register(["mm", "millimeter", "millimeters", "millimetre", "millimetres"], 1, 1);
register(["cm", "centimeter", "centimeters"], 10, 1);
register(["m", "meter", "meters", "metre", "metres"], 1000, 1);
register(["km"], 1e6, 1);
register(["um", "µm", "μm"], 0.001, 1);
register(["in", "inch", "inches", '"'], 25.4, 1);
register(["ft", "foot", "feet", "'"], 304.8, 1);
register(["yd", "yard", "yards"], 914.4, 1);
register(["stud"], 8, 1);
register(["px", "pixel", "pixels"], 1, 0);
register(["deg", "degree", "degrees", "°"], 1, 0, 1);
register(["rad", "radian", "radians"], 180 / Math.PI, 0, 1);
// Percent fields use percentage points; percentages in other fields are ratios.
register(["%"], 0.01, 0);

/** Evaluate arithmetic without executing JavaScript. The result uses the field's display unit. */
export function parseNumericExpression(input: string | number, defaultUnit: string | number = ""): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : NaN;
  if (!input.trim() || input.length > 2048) return NaN;
  const target = typeof defaultUnit === "number" ? { factor: defaultUnit, length: 1, angle: 0 } : defaultUnit === "%" ? { factor: 1, length: 0, angle: 0 } : units[defaultUnit.toLowerCase()] ?? { factor: 1, length: 0, angle: 0 };
  const text = input.toLowerCase().replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  let position = 0;
  let depth = 0;
  const skip = () => { while (/\s/.test(text[position] ?? "") && position < text.length) position++; };
  const scalar = (value: number): Quantity => ({ value, length: 0, angle: 0 });
  const same = (a: Quantity, b: Quantity) => a.length === b.length && a.angle === b.angle;
  const isScalar = (q: Quantity) => q.length === 0 && q.angle === 0;
  const promote = (q: Quantity): Quantity => ({ value: q.value * target.factor, length: target.length, angle: target.angle });
  function fail(): never { throw new Error("Invalid or incompatible expression"); }
  function primary(): Quantity {
    skip();
    if (++depth > 64) fail();
    let result: Quantity;
    if (text[position] === "(") {
      position++;
      result = addition();
      skip();
      if (text[position++] !== ")") fail();
    } else if (text.slice(position, position + 2) === "pi") {
      position += 2; result = scalar(Math.PI);
    } else if (text[position] === "π") {
      position++; result = scalar(Math.PI);
    } else {
      const match = text.slice(position).match(/^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?/);
      if (!match) fail();
      position += match[0].length;
      result = scalar(Number(match[0].replace(",", ".")));
    }
    skip();
    const suffix = text.slice(position).match(/^[a-zµμ]+|^[°%"']/)?.[0];
    if (suffix) {
      const unit = suffix === "%" && defaultUnit === "%" ? target : units[suffix];
      if (!unit || !isScalar(result)) fail();
      position += suffix.length;
      result = { value: result.value * unit.factor, length: unit.length, angle: unit.angle };
    }
    depth--;
    return result;
  }
  function unary(): Quantity {
    skip();
    if (text[position] === "+" || text[position] === "-") {
      const sign = text[position++] === "-" ? -1 : 1;
      // Bound unary chains as well as nested parentheses.
      if (++depth > 64) fail();
      const q = unary(); depth--;
      return { ...q, value: q.value * sign };
    }
    return primary();
  }
  function multiplication(): Quantity {
    let left = unary();
    for (;;) {
      skip(); const op = text[position];
      if (op !== "*" && op !== "/") return left;
      position++; const right = unary();
      if (op === "/" && right.value === 0) fail();
      left = { value: op === "*" ? left.value * right.value : left.value / right.value, length: left.length + (op === "*" ? right.length : -right.length), angle: left.angle + (op === "*" ? right.angle : -right.angle) };
    }
  }
  function addition(): Quantity {
    let left = multiplication();
    for (;;) {
      skip(); const op = text[position];
      if (op !== "+" && op !== "-") return left;
      position++; let right = multiplication();
      if (!same(left, right)) {
        if (isScalar(left) && same(promote(left), right)) left = promote(left);
        else if (isScalar(right) && same(left, promote(right))) right = promote(right);
        else fail();
      }
      left = { ...left, value: left.value + (op === "+" ? right.value : -right.value) };
    }
  }
  try {
    let result = addition(); skip();
    if (position !== text.length || !Number.isFinite(result.value)) return NaN;
    if (isScalar(result) && (target.length || target.angle)) result = promote(result);
    if (result.length !== target.length || result.angle !== target.angle) return NaN;
    return result.value / target.factor;
  } catch { return NaN; }
}

export function validateNumericExpression(input: HTMLInputElement, value: number) {
  const valid = Number.isFinite(value);
  input.setCustomValidity(valid ? "" : document.documentElement.lang === "es"
    ? "Expresión inválida o unidades incompatibles. Ejemplo: 2mm + 2inch."
    : "Invalid expression or incompatible units. Example: 2mm + 2inch.");
  input.setAttribute("aria-invalid", String(!valid));
  if (!valid) input.reportValidity();
  return valid;
}
