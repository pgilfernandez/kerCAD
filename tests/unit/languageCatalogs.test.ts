import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import english from "@/locales/en.json";
import spanish from "@/locales/es.json";
import { APP_LOCALE_INITIAL_SCRIPT, getLanguageName, getLocaleContent, KERCAD_LOCALES, kercadTranslate, normalizeKercadLocale, pluralMessage } from "@/lib/kercadI18n";

const generator = path.resolve(__dirname, "../../scripts/i18n.mjs");

describe("language catalogs", () => {
  it("interpolates complete phrases and preserves missing variables", () => {
    expect(kercadTranslate("es", "loading.remaining", { seconds: 12 })).toBe("≈ 12 s restantes");
    expect(kercadTranslate("en", "sketch.validProfile.other", { count: 2 })).toBe("Valid profile · 2 contours");
    expect(kercadTranslate("en", "loading.remaining")).toContain("{seconds}");
  });

  it("normalizes region tags and exposes the catalog's native language name", () => {
    expect(normalizeKercadLocale("ES_mx")).toBe("es");
    expect(normalizeKercadLocale(" en-US ")).toBe("en");
    expect(normalizeKercadLocale("not-a-language")).toBe("en");
    expect(KERCAD_LOCALES.map(getLanguageName)).toEqual(expect.arrayContaining(["English", "Español", "Français", "Italiano", "Deutsch"]));
    expect(normalizeKercadLocale("fr-CA")).toBe("fr");
    expect(normalizeKercadLocale("it-IT")).toBe("it");
    expect(normalizeKercadLocale("de-AT")).toBe("de");
  });

  it("uses the selected language for tutorials, documentation and primitive labels", () => {
    expect(getLocaleContent("es", "tutorial").cards[0].title).toBe(spanish.content.tutorial.cards[0].title);
    expect(getLocaleContent("en", "about").heroTitle).toBe(english.content.about.heroTitle);
    expect(getLocaleContent("es", "primitives").box.parameters.width).toBe("Anchura");
    expect(pluralMessage("en", "sketch.validProfile", 1)).toBe("sketch.validProfile.one");
    expect(pluralMessage("es", "sketch.validProfile", 2)).toBe("sketch.validProfile.other");
  });

  it("applies stored language, URL preference and text direction before hydration", () => {
    for (const [query, saved, expected] of [["", "es", "es"], ["?lang=en", "es", "en"], ["?lang=ES-MX", null, "es"], ["", "invalid", "en"]]) {
      const document = { documentElement: { lang: "", dir: "" } };
      runInNewContext(APP_LOCALE_INITIAL_SCRIPT, { document, URLSearchParams, location: { search: query }, localStorage: { getItem: () => saved } });
      expect(document.documentElement).toEqual({ lang: expected, dir: "ltr" });
    }
  });

  it("discovers additional and RTL languages without changing any menu or TypeScript file", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "kercad-languages-"));
    try {
      writeFileSync(path.join(directory, "en.json"), JSON.stringify({ locale: "en", name: "English", direction: "ltr", messages: { greeting: "Hello {name}", "items.other": "{count} items" } }));
      writeFileSync(path.join(directory, "ar.json"), JSON.stringify({ locale: "ar", name: "العربية", direction: "rtl", messages: { "items.few": "{count} عناصر" } }));
      execFileSync(process.execPath, [generator, "--directory", directory, "--allow-incomplete"], { stdio: "pipe" });
      const registry = readFileSync(path.join(directory, "registry.generated.ts"), "utf8");
      expect(registry).toContain('import locale0 from "./ar.json"');
      expect(registry).toContain('"ar": locale0');
      const before = registry;
      execFileSync(process.execPath, [generator, "--directory", directory, "--allow-incomplete"], { stdio: "pipe" });
      expect(readFileSync(path.join(directory, "registry.generated.ts"), "utf8")).toBe(before);
      writeFileSync(path.join(directory, "ar.json"), JSON.stringify({ locale: "ar", name: "العربية", direction: "rtl", messages: { greeting: "Hello {wrong}" } }));
      const invalid = spawnSync(process.execPath, [generator, "--directory", directory], { encoding: "utf8" });
      expect(invalid.status).not.toBe(0);
      expect(invalid.stderr).toContain("Placeholder mismatch");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("rejects missing messages and nested content in installed languages", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "kercad-complete-languages-"));
    try {
      const metadata = { direction: "ltr", messages: { title: "Title", added: "New text" }, content: { cards: [{ title: "Card", body: "Instructions" }] } };
      writeFileSync(path.join(directory, "en.json"), JSON.stringify({ ...metadata, locale: "en", name: "English" }));
      const translated = { ...metadata, locale: "fr", name: "Français", messages: { title: "Titre" }, content: { cards: [{ title: "Carte" }] } };
      writeFileSync(path.join(directory, "fr.json"), JSON.stringify(translated));
      const incomplete = spawnSync(process.execPath, [generator, "--directory", directory], { encoding: "utf8" });
      expect(incomplete.status).not.toBe(0);
      expect(incomplete.stderr).toContain("fr:messages.added");
      expect(incomplete.stderr).toContain("fr:content.cards.0.body");
      writeFileSync(path.join(directory, "fr.json"), JSON.stringify({ ...translated, messages: { title: "Titre", added: "Nouveau texte" }, content: { cards: [{ title: "Carte", body: "Instructions" }] } }));
      expect(spawnSync(process.execPath, [generator, "--directory", directory], { encoding: "utf8" }).status).toBe(0);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
