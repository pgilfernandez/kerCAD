import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { APP_ACCENT_INITIAL_SCRIPT, APP_ACCENT_STORAGE_KEY, DEFAULT_APP_ACCENT, appAccentProperties, normalizeAppAccent, readStoredAppAccent, storeAppAccent } from "@/lib/appAccent";
import { OBJECT_COLOR_PALETTE } from "@/lib/colorPalette";

function luminance(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
}

describe("application accent", () => {
  it("normalizes custom colors and rejects malformed storage", () => {
    expect(normalizeAppAccent(" #AbC ")).toBe("#aabbcc");
    for (const value of [null, "", "red", "#abcd", "#ffffff; color:red", 123]) expect(normalizeAppAccent(value)).toBe(DEFAULT_APP_ACCENT);
    expect(readStoredAppAccent({ getItem() { throw Error("blocked"); } })).toBe(DEFAULT_APP_ACCENT);
  });

  it("stores only normalized colors and tolerates blocked storage", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    storeAppAccent(storage, "#ABC");
    expect(values.get(APP_ACCENT_STORAGE_KEY)).toBe("#aabbcc");
    expect(readStoredAppAccent(storage)).toBe("#aabbcc");
    expect(() => storeAppAccent({ setItem() { throw Error("blocked"); } }, "#ffffff")).not.toThrow();
  });

  it("keeps accessible solid and link tones for all swatches, including black and white", () => {
    for (const color of [...OBJECT_COLOR_PALETTE, "#ffff00", "#00ff00", "#0000ff", DEFAULT_APP_ACCENT]) {
      const p = appAccentProperties(color);
      expect(p["--accent-base"]).toBe(color);
      expect(1.05 / (luminance(p["--accent-solid"]) + .05)).toBeGreaterThanOrEqual(4.5);
      expect((luminance(p["--accent-link-dark"]) + .05) / (luminance("#1c2835") + .05)).toBeGreaterThanOrEqual(4.5);
      expect(Object.values(p).join(" ")).not.toContain("NaN");
    }
    expect(appAccentProperties("#808080")["--accent-saturation"]).toBe("0%");
    expect(Number(appAccentProperties("#0f952a")["--accent-hue"])).toBeGreaterThan(120);
  });

  it.each(["#d03cab", "invalid", null, "blocked"])("applies the saved accent before hydration (%s)", (stored) => {
    const properties: Record<string, string> = {};
    const root = { dataset: {} as Record<string, string>, style: { setProperty: (key: string, value: string) => { properties[key] = value; } } };
    runInNewContext(APP_ACCENT_INITIAL_SCRIPT, {
      document: { documentElement: root },
      localStorage: { getItem() { if (stored === "blocked") throw Error("blocked"); return stored; } },
    });
    const expected = normalizeAppAccent(stored);
    expect(root.dataset.accent).toBe(expected);
    expect(properties).toEqual(appAccentProperties(expected));
  });
});
