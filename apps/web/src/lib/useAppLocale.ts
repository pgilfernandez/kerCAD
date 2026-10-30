"use client";

import { useEffect, useSyncExternalStore } from "react";
import { applyAppLocale, getCurrentLocale, LOCALE_CHANGE_EVENT, LOCALE_STORAGE_KEY, normalizeKercadLocale, type KercadLocale } from "@/lib/kercadI18n";

function activateLocale(locale: KercadLocale) {
  const url = new URL(window.location.href);
  url.searchParams.set("lang", locale);
  window.history.replaceState(window.history.state, "", url);
  applyAppLocale(locale);
}

function subscribe(listener: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null) {
      try { activateLocale(normalizeKercadLocale(localStorage.getItem(LOCALE_STORAGE_KEY))); } catch { /* Keep the active language. */ }
    }
  };
  window.addEventListener(LOCALE_CHANGE_EVENT, listener);
  window.addEventListener("storage", sync);
  return () => { window.removeEventListener(LOCALE_CHANGE_EVENT, listener); window.removeEventListener("storage", sync); };
}

export function useAppLocale() {
  const locale = useSyncExternalStore(subscribe, getCurrentLocale, (): KercadLocale => "en");
  useEffect(() => {
    try {
      const requested = new URLSearchParams(window.location.search).get("lang");
      applyAppLocale(normalizeKercadLocale(requested ?? localStorage.getItem(LOCALE_STORAGE_KEY)));
    } catch { /* Keep English when storage is blocked. */ }
  }, []);
  const setLocale = (value: KercadLocale) => {
    const next = normalizeKercadLocale(value);
    try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* Apply for this session. */ }
    activateLocale(next);
  };
  return [locale, setLocale] as const;
}
