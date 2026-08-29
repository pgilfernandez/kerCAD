export type ParametricDisplayUnit = "mm" | "in";

const MILLIMETERS_PER_INCH = 25.4;

export function displayUnitLabel(unit: ParametricDisplayUnit) {
  return unit === "in" ? "in" : "mm";
}

export function millimetersToDisplayLength(value: number, unit: ParametricDisplayUnit) {
  return unit === "in" ? value / MILLIMETERS_PER_INCH : value;
}

export function displayLengthToMillimeters(value: number, unit: ParametricDisplayUnit) {
  return unit === "in" ? value * MILLIMETERS_PER_INCH : value;
}

export function formatDisplayLength(valueInMillimeters: number, unit: ParametricDisplayUnit, maximumFractionDigits = unit === "in" ? 4 : 2) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits, useGrouping: false }).format(millimetersToDisplayLength(valueInMillimeters, unit));
}
