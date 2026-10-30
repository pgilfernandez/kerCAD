import { describe, expect, it } from "vitest";
import { displayLengthToMillimeters, displayUnitLabel, formatDisplayLength, millimetersToDisplayLength } from "../../apps/web/src/lib/parametricUnits";

describe("parametric display units", () => {
  it("formats editable values for the selected language without unsupported digits or bidi marks", () => {
    expect(formatDisplayLength(12.5, "mm", 2, "es")).toBe("12,5");
    expect(formatDisplayLength(-12.5, "mm", 2, "ar")).toBe("-12.5");
    expect(formatDisplayLength(12.5, "mm", 2, "bn")).toBe("12.5");
  });
  it("round-trips inches without changing canonical millimeters", () => {
    expect(millimetersToDisplayLength(25.4, "in")).toBe(1);
    expect(displayLengthToMillimeters(1, "in")).toBe(25.4);
    expect(displayLengthToMillimeters(millimetersToDisplayLength(123.456, "in"), "in")).toBeCloseTo(123.456, 10);
  });

  it("keeps millimeter values unchanged", () => {
    expect(millimetersToDisplayLength(12.5, "mm")).toBe(12.5);
    expect(displayLengthToMillimeters(12.5, "mm")).toBe(12.5);
    expect(displayUnitLabel("mm")).toBe("mm");
    expect(displayUnitLabel("in")).toBe("in");
  });

  it("formats inch values with useful precision", () => {
    expect(formatDisplayLength(25.4, "in")).toBe("1");
  });
});
