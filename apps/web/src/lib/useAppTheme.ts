"use client";

import { useSyncExternalStore } from "react";
import { APP_THEME_CHANGE_EVENT, APP_THEME_STORAGE_KEY, applyAppTheme, readStoredAppTheme, storeAppTheme, type ResolvedAppTheme } from "@/lib/appTheme";

function subscribe(listener: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === APP_THEME_STORAGE_KEY || event.key === "sketchForge.theme" || event.key === null) {
      try { applyAppTheme(readStoredAppTheme(window.localStorage)); } catch { /* Keep the current theme if storage is blocked. */ }
    }
  };
  window.addEventListener(APP_THEME_CHANGE_EVENT, listener);
  window.addEventListener("storage", storageChanged);
  return () => { window.removeEventListener(APP_THEME_CHANGE_EVENT, listener); window.removeEventListener("storage", storageChanged); };
}

export function useAppTheme() {
  const theme = useSyncExternalStore(subscribe, (): ResolvedAppTheme => document.documentElement.dataset.theme === "dark" ? "dark" : "light", (): ResolvedAppTheme => "light");
  const setTheme = (next: ResolvedAppTheme) => {
    try { storeAppTheme(window.localStorage, next); } catch { /* Apply even if storage is inaccessible. */ }
    applyAppTheme(next);
  };
  return { theme, setTheme };
}
