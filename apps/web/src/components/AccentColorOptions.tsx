"use client";

import { useAppAccent } from "@/lib/useAppAccent";
import type { KercadLocale } from "@/lib/kercadI18n";
import { uiText } from "@/lib/kercadI18n";
import { Plus } from "lucide-react";

export const ACCENT_COLOR_PRESETS = [
  // Left-to-right order in public/assets/kercad/logo_color_palette.svg.
  "#c83f46", "#9b6641", "#d9843d", "#ffea50", "#94bf42",
  "#54b3c6", "#5476c6", "#9954c6", "#bd54a3",
];

export function AccentColorOptions({ locale = "en" }: { locale?: KercadLocale }) {
  const { accent, setAccent } = useAppAccent();
  const custom = !ACCENT_COLOR_PRESETS.includes(accent);
  const label = uiText("ui.accentcoloroptions.accent.color.e49578", {}, locale);
  const customLabel = uiText("ui.accentcoloroptions.custom.accent.color.1982ac", {}, locale);
  return <div className="kercad-accent-options" role="group" aria-label={label}>
    {ACCENT_COLOR_PRESETS.map((color) => <button
      key={color}
      type="button"
      className="kercad-accent-swatch"
      style={{ backgroundColor: color }}
      aria-label={`${label} ${color}`}
      title={color.toUpperCase()}
      aria-pressed={accent === color}
      onClick={() => setAccent(color)}
    />)}
    <label className={`kercad-accent-custom${custom ? " selected" : ""}`} title={customLabel}>
      <Plus size={14} aria-hidden="true" />
      <input type="color" value={accent} onChange={(event) => setAccent(event.currentTarget.value)} aria-label={customLabel} />
    </label>
  </div>;
}
