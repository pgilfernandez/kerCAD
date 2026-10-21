export const APP_THEME_STORAGE_KEY = "educad.theme";
export const APP_THEME_CHANGE_EVENT = "educad:theme-change";
const LEGACY_THEME_STORAGE_KEY = "sketchForge.theme";

export const APP_THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

// Keep the system value readable for older editor integrations; the public
// chooser deliberately offers only the two explicit base themes.
export type AppThemePreference = (typeof APP_THEME_OPTIONS)[number]["value"] | "system";
export type ResolvedAppTheme = Exclude<AppThemePreference, "system">;

export function normalizeAppThemePreference(value: unknown): AppThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "light";
}

export function resolveAppTheme(preference: AppThemePreference, prefersDark: boolean): ResolvedAppTheme {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}

export function readStoredAppTheme(storage: Pick<Storage, "getItem"> | null | undefined): AppThemePreference {
  if (!storage) return "light";
  try {
    return normalizeAppThemePreference(storage.getItem(APP_THEME_STORAGE_KEY) ?? storage.getItem(LEGACY_THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function storeAppTheme(
  storage: Pick<Storage, "setItem"> | null | undefined,
  preference: AppThemePreference,
) {
  if (!storage) return;
  try {
    storage.setItem(APP_THEME_STORAGE_KEY, preference);
  } catch {
    // The selected theme still applies for this session when storage is unavailable.
  }
}

export function applyAppTheme(preference: AppThemePreference, prefersDark?: boolean) {
  if (typeof document === "undefined") return;
  const systemPrefersDark = prefersDark ?? (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );
  const resolved = resolveAppTheme(preference, systemPrefersDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  window.dispatchEvent(new CustomEvent(APP_THEME_CHANGE_EVENT, { detail: resolved }));
}

// Runs before hydration. Keep the default light, independent of the OS, unless
// the user has explicitly saved a preference (including an older system value).
export const APP_THEME_INITIAL_SCRIPT = `(function(){try{var t=localStorage.getItem("${APP_THEME_STORAGE_KEY}")||localStorage.getItem("${LEGACY_THEME_STORAGE_KEY}");var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;
