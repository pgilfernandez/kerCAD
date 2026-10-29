export const APP_ACCENT_STORAGE_KEY = "kercad.accent";
export const APP_ACCENT_CHANGE_EVENT = "kercad:accent-change";
export const DEFAULT_APP_ACCENT = "#1269eb";

export function normalizeAppAccent(value: unknown): string {
  const fallback = "#1269eb";
  if (typeof value !== "string") return fallback;
  const hex = value.trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(hex)) return hex;
  if (/^#[\da-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map((c) => c + c).join("")}`;
  return fallback;
}

export function readStoredAppAccent(storage: Pick<Storage, "getItem"> | null | undefined): string {
  try { return normalizeAppAccent(storage?.getItem(APP_ACCENT_STORAGE_KEY)); }
  catch { return DEFAULT_APP_ACCENT; }
}

export function storeAppAccent(storage: Pick<Storage, "setItem"> | null | undefined, color: string) {
  try { storage?.setItem(APP_ACCENT_STORAGE_KEY, normalizeAppAccent(color)); }
  catch { /* The selection still applies when storage is unavailable. */ }
}

// Self-contained so the same implementation can run before React hydration.
export function appAccentProperties(color: string): Record<string, string> {
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels;
  const max = Math.max(...channels), min = Math.min(...channels), delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const atLightness = (l: number) => {
    const c = (1 - Math.abs(2 * l - 1)) * saturation;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = l - c / 2;
    const rgb = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
    return rgb.map((v) => Math.round((v + m) * 255));
  };
  const luminance = (rgb: number[]) => rgb.map((v) => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const hex = (rgb: number[]) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  // Solid controls always carry white text. Links have separate light/dark tones.
  let solidL = Math.min(lightness, .5);
  while (solidL > .05 && 1.05 / (luminance(atLightness(solidL)) + .05) < 4.5) solidL -= .005;
  let darkL = Math.max(lightness, .74);
  const darkSurface = luminance([28, 40, 53]);
  while (darkL < .98 && (luminance(atLightness(darkL)) + .05) / (darkSurface + .05) < 4.5) darkL += .005;
  return {
    "--accent-base": color,
    "--accent-hue": String(hue),
    "--accent-saturation": `${saturation * 100}%`,
    "--accent-solid": hex(atLightness(solidL)),
    "--accent-link-light": hex(atLightness(solidL)),
    "--accent-link-dark": hex(atLightness(darkL)),
  };
}

export function applyAppAccent(color: string) {
  if (typeof document === "undefined") return;
  const normalized = normalizeAppAccent(color);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(appAccentProperties(normalized))) root.style.setProperty(key, value);
  root.dataset.accent = normalized;
  window.dispatchEvent(new CustomEvent(APP_ACCENT_CHANGE_EVENT));
}

export const APP_ACCENT_INITIAL_SCRIPT = `(function(){var c="${DEFAULT_APP_ACCENT}";try{c=(${normalizeAppAccent.toString()})(localStorage.getItem("${APP_ACCENT_STORAGE_KEY}"));}catch(e){}var r=document.documentElement;var p=(${appAccentProperties.toString()})(c);Object.keys(p).forEach(function(k){r.style.setProperty(k,p[k]);});r.dataset.accent=c;})();`;
