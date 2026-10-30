import { describe, expect, it } from "vitest";
import { kercadTranslate, normalizeKercadLocale } from "../../apps/web/src/lib/kercadI18n";

describe("kerCAD translations", () => {
  it("ships matching Spanish and English keys", () => {
    expect(kercadTranslate("es", "toolbar.createSketch")).toBe("Crear boceto");
    expect(kercadTranslate("en", "toolbar.createSketch")).toBe("Create sketch");
  });

  it("uses English when no supported locale has been persisted", () => {
    expect(normalizeKercadLocale("en")).toBe("en");
    expect(normalizeKercadLocale("es")).toBe("es");
    expect(normalizeKercadLocale("xx-unknown")).toBe("en");
    expect(normalizeKercadLocale(null)).toBe("en");
  });
});
