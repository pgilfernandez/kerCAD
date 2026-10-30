import { getLocaleContent, type KercadLocale } from "@/lib/kercadI18n";

export function getAboutContent(locale: KercadLocale) {
  return getLocaleContent(locale, "about");
}
