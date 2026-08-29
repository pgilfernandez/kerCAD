import { describe, expect, it } from "vitest";
import { educadTranslate, normalizeEducadLocale } from "../../apps/web/src/lib/educadI18n";

describe("eduCAD translations", () => {
  it("ships matching Spanish and English keys", () => {
    expect(educadTranslate("es", "toolbar.createSketch")).toBe("Crear boceto");
    expect(educadTranslate("en", "toolbar.createSketch")).toBe("Create sketch");
  });

  it("normalizes unsupported persisted locales to Spanish", () => {
    expect(normalizeEducadLocale("en")).toBe("en");
    expect(normalizeEducadLocale("fr")).toBe("es");
  });
});
