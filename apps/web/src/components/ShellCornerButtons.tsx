"use client";

import type { ShellCornerType } from "@/types/parametric";
import { operationIconPath } from "@/lib/kercadIconPaths";
import { uiText, type KercadLocale } from "@/lib/kercadI18n";

export function ShellCornerButtons({ value = "rounded", locale, onChange }: {
  value?: ShellCornerType;
  locale: KercadLocale;
  onChange: (value: ShellCornerType) => void;
}) {
  return <>{(["sharp", "rounded"] as const).map((mode) => {
    const label = (mode === "sharp" ? uiText("ui.shellcornerbuttons.sharp.corners.3d3a90", {}, locale) : uiText("ui.shellcornerbuttons.rounded.corners.53b174", {}, locale));
    return <button key={mode} type="button" className={`kercad-shell-corner-mode ${value === mode ? "active" : ""}`} title={label} aria-label={label} aria-pressed={value === mode} onClick={() => onChange(mode)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={operationIconPath(`${mode === "sharp" ? "sharp" : "fillet"}.svg`)} width={22} height={22} alt="" draggable={false} />
    </button>;
  })}</>;
}
