"use client";

import { useAppAccent } from "@/lib/useAppAccent";
import type { KercadLocale } from "@/lib/kercadI18n";
import { uiText } from "@/lib/kercadI18n";

const PRESETS = [
  "#c5343c", "#934bc3", "#b94b9e", "#4b6fc3",
  "#1269eb", "#4bafc3", "#8ebc38", "#955e37",
];

export function AccentColorOptions({ locale = "en" }: { locale?: KercadLocale }) {
  const { accent, setAccent } = useAppAccent();
  const custom = !PRESETS.includes(accent);
  const label = uiText("ui.accentcoloroptions.accent.color.e49578", {}, locale);
  const customLabel = uiText("ui.accentcoloroptions.custom.accent.color.1982ac", {}, locale);
  return <div className="kercad-accent-options" role="group" aria-label={label}>
    {PRESETS.map((color) => <button
      key={color}
      type="button"
      className="kercad-accent-swatch"
      style={{ backgroundColor: color }}
      aria-label={`${label} ${color}`}
      title={color.toUpperCase()}
      aria-pressed={accent === color}
      onClick={() => setAccent(color)}
    />)}
    <label className={`kercad-accent-custom${custom ? " selected" : ""}`} style={custom ? { background: accent } : undefined} title={customLabel}>
      <input type="color" value={accent} onChange={(event) => setAccent(event.currentTarget.value)} aria-label={customLabel} />
    </label>
  </div>;
}
