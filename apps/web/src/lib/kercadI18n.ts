import { languageCatalogs } from "@/locales/registry.generated";
import english from "@/locales/en.json";

export type KercadLocale = keyof typeof languageCatalogs;
export type KercadTranslationKey = keyof typeof english.messages;
export type TranslationValues = Record<string, string | number>;
export const KERCAD_LOCALES = Object.keys(languageCatalogs) as KercadLocale[];
export const KERCAD_LANGUAGES = KERCAD_LOCALES.map((locale) => ({
  locale,
  name: languageCatalogs[locale].name,
  direction: languageCatalogs[locale].direction as "ltr" | "rtl",
}));
export const LOCALE_STORAGE_KEY = "kercad.locale";
export const LOCALE_CHANGE_EVENT = "kercad:locale-change";

export function normalizeKercadLocale(value: unknown): KercadLocale {
  if (typeof value !== "string") return "en";
  const normalized = value.trim().replace(/_/g, "-").toLowerCase();
  return KERCAD_LOCALES.find((locale) => locale.toLowerCase() === normalized)
    ?? KERCAD_LOCALES.find((locale) => locale.toLowerCase() === normalized.split("-")[0])
    ?? "en";
}

export function getCurrentLocale(): KercadLocale {
  if (typeof document !== "undefined") return normalizeKercadLocale(document.documentElement.lang);
  return "en";
}

export function getLanguageName(locale: KercadLocale): string {
  return languageCatalogs[locale].name;
}

export function kercadTranslate(locale: KercadLocale, key: string, values: TranslationValues = {}): string {
  const messages: Record<string, string> = languageCatalogs[normalizeKercadLocale(locale)].messages;
  const fallback: Record<string, string> = english.messages;
  const text = messages[key] ?? fallback[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
}

// Used by interface components without an explicit locale prop, including legacy tools.
export function uiText(key: string, values: TranslationValues = {}, locale = getCurrentLocale()): string {
  return kercadTranslate(locale, key, values);
}

export function applyAppLocale(locale: KercadLocale) {
  if (typeof document === "undefined") return;
  const normalized = normalizeKercadLocale(locale);
  document.documentElement.lang = normalized;
  document.documentElement.dir = languageCatalogs[normalized].direction;
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
}

function mergeContent(base: unknown, translated: unknown): unknown {
  if (Array.isArray(base)) return base.map((value, index) => mergeContent(value, Array.isArray(translated) ? translated[index] : undefined));
  if (base && typeof base === "object") return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, mergeContent(value, translated && typeof translated === "object" ? (translated as Record<string, unknown>)[key] : undefined)]));
  return typeof translated === typeof base ? translated : base;
}

const contentCache = new Map<string, unknown>();

export function getLocaleContent<Key extends keyof typeof english.content>(locale: string, key: Key): typeof english.content[Key] {
  const normalized = normalizeKercadLocale(locale);
  const cacheKey = `${normalized}:${key}`;
  if (!contentCache.has(cacheKey)) {
    const catalog = languageCatalogs[normalized] as { content?: Record<string, unknown> };
    contentCache.set(cacheKey, mergeContent(english.content[key], catalog.content?.[key]));
  }
  return contentCache.get(cacheKey) as typeof english.content[Key];
}

// Legacy CAD definitions keep stable internal labels; their presentation is localized here.
export function translateSourceText(source: string, locale = getCurrentLocale()): string {
  const aliases: Record<string, string> = english.sourceAliases;
  return aliases[source] ? kercadTranslate(locale, aliases[source]) : source;
}

export function pluralMessage(locale: KercadLocale, prefix: string, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);
  const key = `${prefix}.${category}`;
  const messages: Record<string, string> = languageCatalogs[locale].messages;
  return key in messages || key in english.messages ? key : `${prefix}.other`;
}

export const APP_LOCALE_INITIAL_SCRIPT = `(function(){var languages=${JSON.stringify(KERCAD_LANGUAGES)};var value="en";try{value=new URLSearchParams(location.search).get("lang")||localStorage.getItem("${LOCALE_STORAGE_KEY}")||"en";}catch(e){}value=value.trim().replace(/_/g,"-").toLowerCase();var selected=languages.find(function(l){return l.locale.toLowerCase()===value;})||languages.find(function(l){return l.locale.toLowerCase()===value.split("-")[0];})||languages.find(function(l){return l.locale==="en";});document.documentElement.lang=selected.locale;document.documentElement.dir=selected.direction;})();`;
