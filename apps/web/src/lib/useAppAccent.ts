"use client";

import { useSyncExternalStore } from "react";
import { APP_ACCENT_CHANGE_EVENT, APP_ACCENT_STORAGE_KEY, DEFAULT_APP_ACCENT, applyAppAccent, normalizeAppAccent, readStoredAppAccent, storeAppAccent } from "@/lib/appAccent";

function subscribe(listener: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === APP_ACCENT_STORAGE_KEY || event.key === null) {
      try { applyAppAccent(readStoredAppAccent(window.localStorage)); } catch { /* Keep the session color. */ }
    }
  };
  window.addEventListener(APP_ACCENT_CHANGE_EVENT, listener);
  window.addEventListener("storage", storageChanged);
  return () => {
    window.removeEventListener(APP_ACCENT_CHANGE_EVENT, listener);
    window.removeEventListener("storage", storageChanged);
  };
}

export function useAppAccent() {
  const accent = useSyncExternalStore(subscribe, () => normalizeAppAccent(document.documentElement.dataset.accent), () => DEFAULT_APP_ACCENT);
  const setAccent = (color: string) => {
    try { storeAppAccent(window.localStorage, color); } catch { /* Apply even if storage is blocked. */ }
    applyAppAccent(color);
  };
  return { accent, setAccent };
}
