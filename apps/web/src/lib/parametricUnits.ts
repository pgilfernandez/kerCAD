export type ParametricDisplayUnit = "mm" | "cm" | "m" | "in" | "ft";

// Geometry, constraints, grid spacing and exports remain in millimeters.
const MILLIMETERS_PER_UNIT: Record<ParametricDisplayUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

export function normalizeDisplayUnit(unit: unknown): ParametricDisplayUnit {
  return typeof unit === "string" && Object.hasOwn(MILLIMETERS_PER_UNIT, unit) ? unit as ParametricDisplayUnit : "mm";
}

export function displayUnitWorkspace(unit: ParametricDisplayUnit) {
  const scales: Record<ParametricDisplayUnit, string> = {
    mm: "1:1 (millimeters)", cm: "1:10 (centimeters)", m: "1:1000 (meters)",
    in: "1:1 (inches)", ft: "1:1 (feet)",
  };
  return { units: unit === "in" || unit === "ft" ? "Imperial" : "Metric (Default)", scale: scales[unit] };
}

export function displayUnitLabel(unit: ParametricDisplayUnit) {
  return unit;
}

export function millimetersToDisplayLength(value: number, unit: ParametricDisplayUnit) {
  return value / MILLIMETERS_PER_UNIT[unit];
}

export function displayLengthToMillimeters(value: number, unit: ParametricDisplayUnit) {
  return value * MILLIMETERS_PER_UNIT[unit];
}

export function formatDisplayLength(valueInMillimeters: number, unit: ParametricDisplayUnit, maximumFractionDigits = unit === "mm" ? 2 : unit === "cm" ? 3 : unit === "in" ? 4 : 5) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits, useGrouping: false }).format(millimetersToDisplayLength(valueInMillimeters, unit));
}
