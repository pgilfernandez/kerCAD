"use client";

import { useEffect } from "react";
import { applyAppAccent, readStoredAppAccent } from "@/lib/appAccent";
import { useAppAccent } from "@/lib/useAppAccent";

// Keep storage synchronization active even while the appearance menu is closed.
export function AppAccentSync() {
  useAppAccent();
  useEffect(() => {
    try {
      const saved = readStoredAppAccent(window.localStorage);
      if (document.documentElement.dataset.accent !== saved) applyAppAccent(saved);
    } catch { /* Keep the pre-hydration color when storage is blocked. */ }
  }, []);
  return null;
}
