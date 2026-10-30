import { kercadTranslate, type KercadLocale, type KercadTranslationKey, type TranslationValues } from "@/lib/kercadI18n";

export type DashboardTranslationKey = KercadTranslationKey;
export function dashboardTranslate(locale: KercadLocale, key: DashboardTranslationKey, values: TranslationValues = {}) {
  return kercadTranslate(locale, key, values);
}
